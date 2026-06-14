import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

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

  // Map API status values to what the frontend expects (lowercase)
  function normaliseStatus(apiStatus) {
    const map = {
      'FINISHED': 'finished',
      'IN_PLAY': 'live',
      'PAUSED': 'live',
      'SCHEDULED': 'scheduled',
      'TIMED': 'scheduled',
      'POSTPONED': 'postponed',
      'CANCELLED': 'cancelled',
    };
    return map[apiStatus] || apiStatus.toLowerCase();
  }

  // Map API goal types to what the frontend expects
  function normaliseGoalType(apiType) {
    if (apiType === 'PENALTY') return 'penalty_goal';
    if (apiType === 'OWN') return 'own_goal';
    return 'goal';
  }

  // Map API card types to what the frontend expects
  function normaliseCardType(apiCard) {
    if (apiCard === 'YELLOW_RED') return 'yellow_red';
    if (apiCard === 'RED') return 'red';
    return 'yellow'; // frontend checks for 'yellow'
  }

  try {
    // ── 1. Fetch all WC matches ──────────────────────────────────────────────
    const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
    console.log(`Fetching match list: ${matchesUrl}`);
    const matchesRes = await fetch(matchesUrl, { headers: apiHeaders });
    console.log(`Match list status: ${matchesRes.status}`);

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

    // ── 2. Fetch already-synced matches from Supabase ────────────────────────
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

    // ── 3. Determine which finished matches need event detail fetching ────────
    const matchesToProcess = finishedMatches.filter(match => {
      const existing = existingByFixtureId[match.id];
      if (!existing) return true;
      const homeScore = match.score?.fullTime?.home ?? null;
      const awayScore = match.score?.fullTime?.away ?? null;
      return existing.home_score !== homeScore || existing.away_score !== awayScore;
    });

    console.log(`Matches needing detail fetch: ${matchesToProcess.length}`);

    let matchesUpserted = 0;
    let matchesSkipped = finishedMatches.length - matchesToProcess.length;
    let eventsInserted = 0;

    // ── 4. Upsert all finished matches (scores + normalised status) ───────────
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
        status: normaliseStatus(match.status), // 'finished' not 'FINISHED'
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
      await delay(6200);

      const detailUrl = `${FOOTBALL_DATA_BASE}/matches/${match.id}`;
      console.log(`Fetching detail: match ${match.id} (${match.homeTeam?.tla} vs ${match.awayTeam?.tla})`);
      const detailRes = await fetch(detailUrl, { headers: apiHeaders });

      if (!detailRes.ok) {
        console.error(`Detail fetch failed for match ${match.id}: ${detailRes.status}`);
        continue;
      }

      const detail = await detailRes.json();

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

      // Clear existing events for this match before re-inserting
      await supabase.from('match_events').delete().eq('match_id', matchId);

      const events = [];

      // Goals — normalised to 'goal', 'penalty_goal', 'own_goal'
      const goals = detail.goals || [];
      for (const goal of goals) {
        if (!goal.scorer?.name) continue;
        events.push({
          match_id: matchId,
          team: goal.team?.shortName || goal.team?.name || null,
          player_name: goal.scorer.name,
          event_type: normaliseGoalType(goal.type),
          minute: goal.minute ?? null,
          detail: null,
        });
      }

      // Bookings — normalised to 'yellow', 'yellow_red', 'red'
      const bookings = detail.bookings || [];
      for (const booking of bookings) {
        if (!booking.player?.name) continue;
        events.push({
          match_id: matchId,
          team: booking.team?.shortName || booking.team?.name || null,
          player_name: booking.player.name,
          event_type: normaliseCardType(booking.card),
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
    console.error('Unexpected error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
