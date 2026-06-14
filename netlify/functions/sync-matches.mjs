import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

export default async function handler(req, context) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  console.log('Sync started.');
  console.log('FOOTBALL_DATA_KEY present:', !!apiKey);
  console.log('SUPABASE_URL present:', !!supabaseUrl);
  console.log('SUPABASE_SERVICE_KEY present:', !!supabaseKey);

  if (!supabaseUrl || !supabaseKey || !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing environment variables' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const apiHeaders = {
    'X-Auth-Token': apiKey,
    'X-Unfold-Goals': 'true',
    'X-Unfold-Bookings': 'true',
  };

  try {
    // ── 1. Fetch all WC matches with goals and bookings unfolded ─────────────
    const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
    console.log(`Fetching: ${matchesUrl}`);
    const matchesRes = await fetch(matchesUrl, { headers: apiHeaders });
    console.log(`Matches response status: ${matchesRes.status}`);

    if (!matchesRes.ok) {
      const text = await matchesRes.text();
      console.error('Matches fetch failed:', text);
      return new Response(JSON.stringify({ error: 'Matches fetch failed', detail: text }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const matchesData = await matchesRes.json();
    const matches = matchesData.matches || [];
    console.log(`Total matches received: ${matches.length}`);

    // ── 2. Fetch already-synced fixture IDs from Supabase ───────────────────
    // We track which matches have had their events fully synced by checking
    // for existing match_events rows. If a match has events recorded we skip
    // re-processing it, unless the score has changed (e.g. correction).
    const { data: existingMatches, error: existingError } = await supabase
      .from('matches')
      .select('id, api_fixture_id, home_score, away_score')
      .not('home_score', 'is', null);

    if (existingError) {
      console.error('Error fetching existing matches:', existingError.message);
    }

    const existingByFixtureId = {};
    for (const m of (existingMatches || [])) {
      existingByFixtureId[m.api_fixture_id] = m;
    }

    let matchesUpserted = 0;
    let eventsInserted = 0;
    let matchesSkipped = 0;

    for (const match of matches) {
      if (match.status !== 'FINISHED') continue;

      const homeScore = match.score?.fullTime?.home ?? null;
      const awayScore = match.score?.fullTime?.away ?? null;
      const homeName = match.homeTeam?.shortName || match.homeTeam?.name;
      const awayName = match.awayTeam?.shortName || match.awayTeam?.name;

      const rawGroup = match.group || null;
      const groupName = rawGroup ? rawGroup.replace('GROUP_', 'Group ') : null;
      const rawStage = match.stage || '';
      const stageLabel = groupName
        ? 'Group Stage'
        : rawStage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      const existing = existingByFixtureId[match.id];
      const scoreChanged = existing &&
        (existing.home_score !== homeScore || existing.away_score !== awayScore);
      const isNew = !existing;

      // ── 3. Upsert the match row ────────────────────────────────────────────
      const matchRecord = {
        api_fixture_id: match.id,
        home_team: homeName,
        away_team: awayName,
        home_score: homeScore,
        away_score: awayScore,
        stage: stageLabel,
        group_name: groupName,
        match_date: match.utcDate,
        venue: match.venue || null,
        status: match.status,
        updated_at: new Date().toISOString(),
      };

      const { data: upsertedMatch, error: matchError } = await supabase
        .from('matches')
        .upsert(matchRecord, { onConflict: 'api_fixture_id' })
        .select()
        .single();

      if (matchError) {
        console.error(`Error upserting match ${match.id}:`, matchError.message);
        continue;
      }

      matchesUpserted++;
      const matchId = upsertedMatch.id;

      // Skip event processing if match already synced and score unchanged
      if (existing && !scoreChanged) {
        matchesSkipped++;
        continue;
      }

      if (scoreChanged) {
        console.log(`Score changed for match ${match.id}, re-syncing events.`);
      }

      // ── 4. Clear and re-insert events for this match ──────────────────────
      // Delete existing events first to avoid duplicates on re-sync
      await supabase
        .from('match_events')
        .delete()
        .eq('match_id', matchId);

      const events = [];

      // Goals
      const goals = match.goals || [];
      for (const goal of goals) {
        if (!goal.scorer?.name) continue;
        const eventType = goal.type === 'OWN'
          ? 'own_goal'
          : goal.type === 'PENALTY'
          ? 'penalty'
          : 'goal';

        events.push({
          match_id: matchId,
          team: goal.team?.shortName || goal.team?.name || null,
          player_name: goal.scorer.name,
          event_type: eventType,
          minute: goal.minute ?? null,
          detail: null,
        });
      }

      // Bookings (yellow cards, yellow-reds, reds)
      const bookings = match.bookings || [];
      for (const booking of bookings) {
        if (!booking.player?.name) continue;
        const cardType = booking.card === 'YELLOW_RED'
          ? 'yellow_red_card'
          : booking.card === 'RED'
          ? 'red_card'
          : 'yellow_card';

        events.push({
          match_id: matchId,
          team: booking.team?.shortName || booking.team?.name || null,
          player_name: booking.player.name,
          event_type: cardType,
          minute: booking.minute ?? null,
          detail: null,
        });
      }

      if (events.length > 0) {
        const { error: eventsError } = await supabase
          .from('match_events')
          .insert(events);

        if (eventsError) {
          console.error(`Error inserting events for match ${match.id}:`, eventsError.message);
        } else {
          eventsInserted += events.length;
          console.log(`Match ${match.id}: ${goals.length} goals, ${bookings.length} bookings inserted.`);
        }
      }
    }

    // ── 5. Fetch top scorers for reference ───────────────────────────────────
    // Note: goal tallies per player can be derived from match_events in Supabase.
    // The scorers endpoint is fetched here as a cross-check log only.
    const scorersUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/scorers?limit=20`;
    const scorersRes = await fetch(scorersUrl, { headers: apiHeaders });
    if (scorersRes.ok) {
      const scorersData = await scorersRes.json();
      const scorers = (scorersData.scorers || []).slice(0, 5);
      console.log('Top scorers (cross-check):', scorers.map(s => `${s.player?.name} ${s.goals}g`).join(', '));
    }

    const summary = {
      success: true,
      matchesUpserted,
      matchesSkipped,
      eventsInserted,
    };

    console.log('Sync complete:', JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Unexpected error during sync:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
