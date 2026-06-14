import { createClient } from '@supabase/supabase-js';

// Team code -> short name mapping (must match what's in your matches table)
const CODE_TO_NAME = {
  MEX: 'Mexico', RSA: 'South Africa', KOR: 'Korea Republic', CZE: 'Czechia',
  CAN: 'Canada', BIH: 'Bosnia-H.', QAT: 'Qatar', SUI: 'Switzerland',
  BRA: 'Brazil', MAR: 'Morocco', HAI: 'Haiti', SCO: 'Scotland',
  USA: 'USA', PAR: 'Paraguay', AUS: 'Australia', TUR: 'Türkiye',
  GER: 'Germany', CUW: 'Curaçao', CIV: "Côte d'Ivoire", ECU: 'Ecuador',
  NED: 'Netherlands', JPN: 'Japan', SWE: 'Sweden', TUN: 'Tunisia',
  BEL: 'Belgium', EGY: 'Egypt', IRN: 'Iran', NZL: 'New Zealand',
  ESP: 'Spain', CPV: 'Cape Verde', KSA: 'Saudi Arabia', URU: 'Uruguay',
  FRA: 'France', SEN: 'Senegal', NOR: 'Norway', IRQ: 'Iraq',
  ARG: 'Argentina', ALG: 'Algeria', AUT: 'Austria', JOR: 'Jordan',
  POR: 'Portugal', COD: 'DR Congo', UZB: 'Uzbekistan', COL: 'Colombia',
  ENG: 'England', CRO: 'Croatia', GHA: 'Ghana', PAN: 'Panama'
};

export default async function handler(req, context) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let matches;
  try {
    const body = await req.json();
    matches = Array.isArray(body) ? body : [body];
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log(`Import started: ${matches.length} matches`);

  const results = [];

  for (const match of matches) {
    const homeName = CODE_TO_NAME[match.homeCode] || match.homeCode;
    const awayName = CODE_TO_NAME[match.awayCode] || match.awayCode;

    // Find the match in Supabase by home/away team and date
    const dateStart = match.date + 'T00:00:00Z';
    const dateEnd = match.date + 'T23:59:59Z';

    const { data: dbMatches, error: findError } = await supabase
      .from('matches')
      .select('id, home_team, away_team')
      .gte('match_date', dateStart)
      .lte('match_date', dateEnd)
      .or(`and(home_team.ilike.%${homeName.split(' ')[0]}%,away_team.ilike.%${awayName.split(' ')[0]}%),and(home_team.ilike.%${awayName.split(' ')[0]}%,away_team.ilike.%${homeName.split(' ')[0]}%)`);

    if (findError || !dbMatches || dbMatches.length === 0) {
      // Try broader search without date
      const { data: broadMatches } = await supabase
        .from('matches')
        .select('id, home_team, away_team, match_date')
        .or(`and(home_team.ilike.%${homeName.split(' ')[0]}%,away_team.ilike.%${awayName.split(' ')[0]}%),and(home_team.ilike.%${awayName.split(' ')[0]}%,away_team.ilike.%${homeName.split(' ')[0]}%)`);

      if (!broadMatches || broadMatches.length === 0) {
        console.error(`Match not found: ${homeName} vs ${awayName} on ${match.date}`);
        results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'not_found' });
        continue;
      }
      dbMatches.push(...broadMatches);
    }

    const dbMatch = dbMatches[0];
    const matchId = dbMatch.id;

    // Update score and status
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: match.homeScore,
        away_score: match.awayScore,
        status: 'finished',
        updated_at: new Date().toISOString()
      })
      .eq('id', matchId);

    if (updateError) {
      console.error(`Failed to update match ${matchId}:`, updateError.message);
    }

    // Clear existing events
    await supabase.from('match_events').delete().eq('match_id', matchId);

    const events = [];

    // Goals
    for (const goal of (match.goals || [])) {
      const teamName = CODE_TO_NAME[goal.code] || goal.code;
      events.push({
        match_id: matchId,
        team: teamName,
        player_name: goal.player,
        event_type: goal.ownGoal ? 'own_goal' : 'goal',
        minute: goal.minute ?? null,
        detail: null
      });
    }

    // Cards
    for (const card of (match.cards || [])) {
      const teamName = CODE_TO_NAME[card.code] || card.code;
      const eventType = card.type === 'red' ? 'red' : card.type === 'yellow_red' ? 'yellow_red' : 'yellow';
      events.push({
        match_id: matchId,
        team: teamName,
        player_name: card.player,
        event_type: eventType,
        minute: card.minute ?? null,
        detail: null
      });
    }

    if (events.length > 0) {
      const { error: insertError } = await supabase
        .from('match_events')
        .insert(events);

      if (insertError) {
        console.error(`Failed to insert events for match ${matchId}:`, insertError.message);
        results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'events_failed', error: insertError.message });
        continue;
      }
    }

    console.log(`Imported: ${match.homeCode} ${match.homeScore}-${match.awayScore} ${match.awayCode} | ${events.length} events`);
    results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'ok', events: events.length });
  }

  const summary = {
    success: true,
    processed: matches.length,
    results
  };

  console.log('Import complete:', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
