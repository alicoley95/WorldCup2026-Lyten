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
  const headers = { 'X-Auth-Token': apiKey };

  try {
    // ── 1. Fetch all WC matches ──────────────────────────────────────────────
    const matchesUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/matches`;
    console.log(`Fetching: ${matchesUrl}`);
    const matchesRes = await fetch(matchesUrl, { headers });
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

    // ── 2. Upsert matches into Supabase ──────────────────────────────────────
    let matchesUpserted = 0;
    let goalsUpserted = 0;

    for (const match of matches) {
      if (match.status !== 'FINISHED') continue;

      const homeScore = match.score?.fullTime?.home ?? null;
      const awayScore = match.score?.fullTime?.away ?? null;
      const homeName = match.homeTeam?.shortName || match.homeTeam?.name;
      const awayName = match.awayTeam?.shortName || match.awayTeam?.name;

      // Determine group/stage label
      const stage = match.stage || '';
      const group = match.group || null;
      const stageLabel = group
        ? group.replace('GROUP_', 'Group ')
        : stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

      const matchRecord = {
        external_id: String(match.id),
        home_team: homeName,
        away_team: awayName,
        home_score: homeScore,
        away_score: awayScore,
        match_date: match.utcDate,
        stage: stageLabel,
        status: match.status,
      };

      const { data: upsertedMatch, error: matchError } = await supabase
        .from('matches')
        .upsert(matchRecord, { onConflict: 'external_id', returning: 'representation' })
        .select()
        .single();

      if (matchError) {
        console.error(`Error upserting match ${match.id}:`, matchError.message);
        continue;
      }

      matchesUpserted++;
      const matchId = upsertedMatch.id;

      // ── 3. Upsert goals ───────────────────────────────────────────────────
      const goals = match.goals || [];
      for (const goal of goals) {
        if (!goal.scorer?.name) continue;

        const goalRecord = {
          match_id: matchId,
          player_name: goal.scorer.name,
          team: goal.team?.shortName || goal.team?.name || null,
          minute: goal.minute ?? null,
          is_own_goal: goal.type === 'OWN_GOAL',
          is_penalty: goal.type === 'PENALTY',
        };

        const { error: goalError } = await supabase
          .from('goals')
          .upsert(goalRecord, { onConflict: 'match_id,player_name,minute' });

        if (goalError) {
          console.error(`Error upserting goal:`, goalError.message);
        } else {
          goalsUpserted++;
        }
      }
    }

    // ── 4. Fetch top scorers ─────────────────────────────────────────────────
    const scorersUrl = `${FOOTBALL_DATA_BASE}/competitions/${COMPETITION}/scorers?limit=20`;
    console.log(`Fetching: ${scorersUrl}`);
    const scorersRes = await fetch(scorersUrl, { headers });
    console.log(`Scorers response status: ${scorersRes.status}`);

    let scorersUpserted = 0;
    if (scorersRes.ok) {
      const scorersData = await scorersRes.json();
      const scorers = scorersData.scorers || [];
      console.log(`Scorers received: ${scorers.length}`);

      for (const entry of scorers) {
        const scorerRecord = {
          player_name: entry.player?.name,
          team: entry.team?.shortName || entry.team?.name || null,
          goals: entry.goals ?? 0,
          assists: entry.assists ?? 0,
          penalties: entry.penalties ?? 0,
        };

        if (!scorerRecord.player_name) continue;

        const { error: scorerError } = await supabase
          .from('top_scorers')
          .upsert(scorerRecord, { onConflict: 'player_name' });

        if (scorerError) {
          console.error(`Error upserting scorer:`, scorerError.message);
        } else {
          scorersUpserted++;
        }
      }
    } else {
      console.warn('Scorers fetch failed with status:', scorersRes.status);
    }

    const summary = {
      success: true,
      matchesUpserted,
      goalsUpserted,
      scorersUpserted,
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
