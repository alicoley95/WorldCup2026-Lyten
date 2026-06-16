import { createClient } from '@supabase/supabase-js';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

// A match is treated as "in window" if now falls between (kickoff - 30 min)
// and (kickoff + 3 hours). The 3 hour back end allows for knockout matches
// that go to extra time and penalties. This is only used to decide whether
// the scheduled function should bother calling the API at all.
const WINDOW_AHEAD_MS = 30 * 60 * 1000;
const WINDOW_BEHIND_MS = 3 * 60 * 60 * 1000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function loadEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const apiKey = process.env.FOOTBALL_DATA_KEY;

  if (!supabaseUrl || !supabaseKey || !apiKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!supabaseKey) missing.push('SUPABASE_SERVICE_KEY');
    if (!apiKey) missing.push('FOOTBALL_DATA_KEY');
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return { supabaseUrl, supabaseKey, apiKey };
}

export function getClient(env) {
  return createClient(env.supabaseUrl, env.supabaseKey);
}

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

function normaliseGoalType(apiType) {
  if (apiType === 'PENALTY') return 'penalty_goal';
  if (apiType === 'OWN') return 'own_goal';
  return 'goal';
}

function normaliseCardType(apiCard) {
  if (apiCard === 'YELLOW_RED') return 'yellow_red';
  if (apiCard === 'RED') return 'red';
  return 'yellow';
}

// Cheap, Supabase-only check, no football-data.org call involved. The
// scheduled function uses this to skip doing any work outside match windows,
// without needing to hardcode kickoff hours that vary across host time zones
// and between group stage and knockout stage.
export async function isMatchWindowActive(supabase) {
  const now = Date.now();
  const from = new Date(now - WINDOW_BEHIND_MS).toISOString();
  const to = new Date(now + WINDOW_AHEAD_MS).toISOString();

  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .gte('match_date', from)
    .lte('match_date', to)
    .not('status', 'in', '(postponed,cancelled)')
    .limit(1);

  if (error) {
    console.error('Window check failed, defaulting to active to be safe:', error.message);
    return true;
  }

  return (data || []).length > 0;
}

export async function runSync({ supabase, apiKey, maxDetailFetchesPerRun = Infinity }) {
  const apiHeaders = { 'X-Auth-Token': apiKey };

  // ── 1. Fetch all 104 WC matches ──────────────────────────────────────────
  const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
  console.log(`Fetching match list: ${matchesUrl}`);
  const matchesRes = await fetch(matchesUrl, { headers: apiHeaders });
  console.log(`Match list status: ${matchesRes.status}`);

  if (!matchesRes.ok) {
    const text = await matchesRes.text();
    throw new Error(`Match list fetch failed (${matchesRes.status}): ${text}`);
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
  let matchesToProcess = finishedMatches.filter(match => {
    const existing = existingByFixtureId[match.id];
    if (!existing) return true;
    const homeScore = match.score?.fullTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? null;
    return existing.home_score !== homeScore || existing.away_score !== awayScore;
  });

  // Oldest kickoff first, so if a batch has to be capped, the earliest
  // finishing matches get processed first rather than an arbitrary subset.
  matchesToProcess.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  const totalPending = matchesToProcess.length;
  matchesToProcess = matchesToProcess.slice(0, maxDetailFetchesPerRun);
  const deferredCount = totalPending - matchesToProcess.length;

  console.log(`Matches needing detail fetch: ${totalPending} (processing ${matchesToProcess.length} this run, ${deferredCount} deferred to next run)`);

  let matchesUpserted = 0;
  let eventsInserted = 0;

  // ── 4. Upsert ALL matches (finished + scheduled + knockout placeholders) ──
  for (const match of allMatches) {
    const homeScore = match.score?.fullTime?.home ?? null;
    const awayScore = match.score?.fullTime?.away ?? null;

    const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'TBD';
    const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'TBD';

    const rawGroup = match.group || null;
    const groupName = rawGroup ? rawGroup.replace('GROUP_', '') : null;
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
      status: normaliseStatus(match.status),
      updated_at: new Date().toISOString(),
    };

    // For non-finished matches already in DB, only update date, status, and
    // (while actually underway) the running score, to avoid overwriting team
    // names already set by the import workflow.
    const existing = existingByFixtureId[match.id];
    if (existing && match.status !== 'FINISHED') {
      const updatePayload = {
        status: normaliseStatus(match.status),
        match_date: match.utcDate,
        updated_at: new Date().toISOString(),
      };

      // football-data.org's fullTime field is set to 0-0 the moment a match
      // goes IN_PLAY and updates as the match progresses, it isn't withheld
      // until the final whistle. Capture it while the match is live so the
      // schedule shows the current score during play, not just afterwards.
      if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
        updatePayload.home_score = match.score?.fullTime?.home ?? null;
        updatePayload.away_score = match.score?.fullTime?.away ?? null;
      }

      const { error: matchError } = await supabase
        .from('matches')
        .update(updatePayload)
        .eq('api_fixture_id', match.id);

      if (matchError) {
        console.error(`Error updating match ${match.id}:`, matchError.message);
      } else {
        matchesUpserted++;
      }
      continue;
    }

    const { error: matchError } = await supabase
      .from('matches')
      .upsert(matchRecord, { onConflict: 'api_fixture_id' });

    if (matchError) {
      console.error(`Error upserting match ${match.id}:`, matchError.message);
    } else {
      matchesUpserted++;
    }
  }

  // ── 5. Fetch individual match detail for new/changed finished matches ─────
  // Capped by maxDetailFetchesPerRun (see slice above). Anything deferred
  // still has a changed score next time this runs, so it gets picked up on
  // the next cycle without any extra bookkeeping needed.
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
    await supabase.from('match_events').delete().eq('match_id', matchId);

    const events = [];

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

  return {
    success: true,
    matchesUpserted,
    eventsInserted,
    detailFetchesThisRun: matchesToProcess.length,
    detailFetchesDeferred: deferredCount,
  };
}
