import { createClient } from '@supabase/supabase-js';

const CODE_TO_NAME = {
  MEX: 'Mexico', RSA: 'South Africa', KOR: 'Korea Republic', CZE: 'Czechia',
  CAN: 'Canada', BIH: 'Bosnia-H.', QAT: 'Qatar', SUI: 'Switzerland',
  BRA: 'Brazil', MAR: 'Morocco', HAI: 'Haiti', SCO: 'Scotland',
  USA: 'USA', PAR: 'Paraguay', AUS: 'Australia', TUR: 'Turkey',
  GER: 'Germany', CUW: 'Curacao', CIV: "Ivory Coast", ECU: 'Ecuador',
  NED: 'Netherlands', JPN: 'Japan', SWE: 'Sweden', TUN: 'Tunisia',
  BEL: 'Belgium', EGY: 'Egypt', IRN: 'Iran', NZL: 'New Zealand',
  ESP: 'Spain', CPV: 'Cape Verde', KSA: 'Saudi Arabia', URU: 'Uruguay',
  FRA: 'France', SEN: 'Senegal', NOR: 'Norway', IRQ: 'Iraq',
  ARG: 'Argentina', ALG: 'Algeria', AUT: 'Austria', JOR: 'Jordan',
  POR: 'Portugal', COD: 'DR Congo', UZB: 'Uzbekistan', COL: 'Colombia',
  ENG: 'England', CRO: 'Croatia', GHA: 'Ghana', PAN: 'Panama'
};

// All known variants a team name might appear as in the DB, stripped of diacritics
const CODE_TO_VARIANTS = {
  TUR: ['turkey', 'turkiye', 'türkiye'],
  BIH: ['bosnia', 'bosniah', 'bosniaherzegovina', 'bosnia and herzegovina'],
  KOR: ['korea', 'south korea', 'korea republic'],
  USA: ['usa', 'united states'],
  CIV: ['ivory coast', 'cote divoire', 'cotedivoire'],
  CUW: ['curacao', 'curao'],
  COD: ['dr congo', 'congo', 'democratic republic'],
  CPV: ['cape verde', 'cabo verde'],
  KSA: ['saudi arabia', 'saudi'],
  CZE: ['czechia', 'czech republic'],
};

function normalise(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function teamMatches(dbTeamName, code) {
  const norm = normalise(dbTeamName);
  const canonical = normalise(CODE_TO_NAME[code] || code);
  
  // Direct match
  if (norm === canonical) return true;
  if (norm.includes(canonical) || canonical.includes(norm)) return true;
  
  // Check known variants
  const variants = CODE_TO_VARIANTS[code] || [];
  return variants.some(v => norm.includes(v) || v.includes(norm));
}

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

  const { data: allDbMatches, error: loadError } = await supabase
    .from('matches')
    .select('id, home_team, away_team, match_date');

  if (loadError || !allDbMatches) {
    return new Response(JSON.stringify({ error: 'Failed to load matches from DB' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const results = [];

  for (const match of matches) {
    console.log(`Looking for: ${match.homeCode} vs ${match.awayCode} on ${match.date}`);

    // Find DB match — try with date first, then without
    let dbMatch = null;

    for (const tryDateMatch of [true, false]) {
      dbMatch = allDbMatches.find(m => {
        const homeOk = teamMatches(m.home_team, match.homeCode) || teamMatches(m.away_team, match.homeCode);
        const awayOk = teamMatches(m.home_team, match.awayCode) || teamMatches(m.away_team, match.awayCode);
        const dateOk = !tryDateMatch || (m.match_date && m.match_date.startsWith(match.date));
        return homeOk && awayOk && dateOk;
      });
      if (dbMatch) break;
    }

    if (!dbMatch) {
      console.error(`Match not found: ${match.homeCode} vs ${match.awayCode}`);
      console.log('All DB teams:', allDbMatches.map(m => `${m.home_team} vs ${m.away_team} (${m.match_date?.substring(0,10)})`).join(' | '));
      results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'not_found' });
      continue;
    }

    console.log(`Found: ${dbMatch.home_team} vs ${dbMatch.away_team}`);

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: match.homeScore,
        away_score: match.awayScore,
        status: 'finished',
        updated_at: new Date().toISOString()
      })
      .eq('id', dbMatch.id);

    if (updateError) {
      console.error(`Failed to update match ${dbMatch.id}:`, updateError.message);
    }

    await supabase.from('match_events').delete().eq('match_id', dbMatch.id);

    const events = [];

    for (const goal of (match.goals || [])) {
      const teamName = CODE_TO_NAME[goal.code] || goal.code;
      events.push({
        match_id: dbMatch.id,
        team: teamName,
        player_name: goal.player,
        event_type: goal.ownGoal ? 'own_goal' : 'goal',
        minute: goal.minute ?? null,
        detail: null
      });
    }

    for (const card of (match.cards || [])) {
      const teamName = CODE_TO_NAME[card.code] || card.code;
      const eventType = card.type === 'red' ? 'red' : card.type === 'yellow_red' ? 'yellow_red' : 'yellow';
      events.push({
        match_id: dbMatch.id,
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
        console.error(`Failed to insert events for match ${dbMatch.id}:`, insertError.message);
        results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'events_failed', error: insertError.message });
        continue;
      }
    }

    console.log(`Imported: ${match.homeCode} ${match.homeScore}-${match.awayScore} ${match.awayCode} | ${events.length} events`);
    results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'ok', events: events.length });
  }

  const summary = { success: true, processed: matches.length, results };
  console.log('Import complete:', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
