import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

// Small delay helper to stay within 10 req/min rate limit
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
  const apiHeaders = { 'X-Auth-Token': apiKey };

  try {
    // ── 1. Fetch all WC matches (scores + schedule only) ─────────────────────
    const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
    console.log(`Fetching match list: ${matchesUrl}`);
    const matchesRes = await fetch(matchesUrl, { headers: apiHeaders });
    console.log(`Match list response status: ${matchesRes.status}`);

    if (!matchesRes.ok) {
      const text = await matchesRes.text();
      console.error('Match list fetch failed:', text);
      return new Response(JSON.stringify({ error: 'Match list fetch failed', detail: text }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const matchesData = await matchesRes.json();
    const allMatches = matchesData.matches || [];
    const finishedMatches = allMatches.filter(m => m.status === 'FINISHED');
    console.log(`Total matches: ${allMatches.length}, finished: ${finishedMatches.length}`);

    // ── 2. Fetch already-synced fixture IDs from Supabase ───────────────────
    const { data: existingMatches, error: existingError } = await supabase
      .from('matches')
      .select('id, api_fixture_id, home_score, away_score');

    if (existingError) {
      console.error('Error fetching existing matches:', existingError.message);
    }

    const existingByFixtureId = {};
    for (const m of (existingMatches || [])) {
      existingByFixtureId[m.api_fixture_id] = m;
    }

    // ── 3. Determine which matches need detail fetching ──────────────────────
    const matchesToProcess = finishedMatches.filter(match => {
      const existing = existingByFixtureId[match.id];
      if (!existing) return true; // new match
      const homeScore = match.score?.fullTime?.home ?? null;
      const awayScore = match.score?.fullTime?.away ?? null;
      const scoreChanged = existing.home_score !== homeScore || existing.away_score !== awayScore;
      return scoreChanged; // re-sync if score corrected
    });

    console.log(`Matches needing detail fetch: ${matchesToProcess.length}`);

    let matchesUpserted = 0;
    let matchesSkipped = finishedMatches.length - matchesToProcess.length;
    let eventsInserted = 0;

    // ── 4. Upsert scores-only for all finished matches (no detail call) ──────
    for (const match of finishedMatches) {
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

      const matchRecord = {
        api_fixture_id: match.id,
        home_team: homeName,
        away_team: awayName,
        home_score: homeScore,
        away_score: awayScore,
        stage: stageLabel,
        group_name: groupName,
        match_date: match.utcDate,
        status: match.status,
        updated_at: new Date().toISOString(),
      };

      const { error: matchError } = await supabase
        .from('matches')
        .upsert(matchRecord, { onConflict: 'api_fixture_id' });

      if (matchError) {
        console.error(`Error upserting match ${match.id}:`, matchError.message);
      } else {
        matchesUpserted++;
      }
    }

    // ── 5. Fetch individual match detail for new/changed matches ─────────────
    for (const match of matchesToProcess) {
      await delay(6200); // ~10 req/min safe spacing

      const detailUrl = `${FOOTBALL_DATA_BASE}/matches/${match.id}`;
      console.log(`Fetching detail for match ${match.id} (${match.homeTeam?.tla} vs ${match.awayTeam?.tla})`);
      const detailRes = await fetch(detailUrl, { headers: apiHeaders });

      if (!detailRes.ok) {
        console.error(`Detail fetch failed for match ${match.id}: ${detailRes.status}`);
        continue;
      }

      const detail = await detailRes.json();

      // Get the Supabase match ID
      const { data: dbMatch, error: dbMatchError } = await supabase
        .from('matches')
        .select('id')
        .eq('api_fixture_id', match.id)
        .single();

      if (dbMatchError || !dbMatch) {
        console.error(`Could not find DB match for fixture ${match.id}`);
        continue;
      }

      const matchId = dbMatch.id;

      // Clear existing events for this match
      await supabase.from('match_events').delete().eq('match_id', matchId);

      const events = [];

      // Goals
      const goals = detail.goals || [];
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

      // Bookings
      const bookings = detail.bookings || [];
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

      console.log(`Match ${match.id}: ${goals.length} goals, ${bookings.length} bookings.`);

      if (events.length > 0) {
        const { error: eventsError } = await supabase
          .from('match_events')
          .insert(events);

        if (eventsError) {
          console.error(`Error inserting events for match ${match.id}:`, eventsError.message);
        } else {
          eventsInserted += events.length;
        }
      }
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
