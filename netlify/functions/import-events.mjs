import { createClient } from '@supabase/supabase-js';

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

// Aliases for teams whose names vary between APIs and databases
const NAME_ALIASES = {
  'turkey': 'TUR', 'turkiye': 'TUR', 'türkiye': 'TUR',
  'south korea': 'KOR', 'korea republic': 'KOR', 'korea': 'KOR',
  'usa': 'USA', 'united states': 'USA', 'us': 'USA',
  'bosnia': 'BIH', 'bosnia and herzegovina': 'BIH', 'bosnia-h.': 'BIH', 'bosnia herzegovina': 'BIH',
  'ivory coast': 'CIV', "côte d'ivoire": 'CIV', "cote d'ivoire": 'CIV', 'cote divoire': 'CIV',
  'curacao': 'CUW', 'curaçao': 'CUW',
  'dr congo': 'COD', 'democratic republic of congo': 'COD', 'congo dr': 'COD',
  'cape verde': 'CPV', 'cabo verde': 'CPV',
  'saudi arabia': 'KSA',
  'iran': 'IRN',
  'new zealand': 'NZL',
  'czechia': 'CZE', 'czech republic': 'CZE',
  'australia': 'AUS',
  'scotland': 'SCO',
  'morocco': 'MAR',
  'switzerland': 'SUI',
};

// Normalise a team name to a code for fuzzy matching
function normalise(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// Get all possible search terms for a team
function getSearchTerms(code) {
  const canonical = CODE_TO_NAME[code] || code;
  const normCanonical = normalise(canonical);
  // Also include the first word for partial matching
  const firstWord = normCanonical.split(' ')[0];
  return { canonical, normCanonical, firstWord };
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

  // Load all matches from Supabase once and do matching in memory
  const { data: allDbMatches, error: loadError } = await supabase
    .from('matches')
    .select('id, home_team, away_team, match_date');

  if (loadError || !allDbMatches) {
    return new Response(JSON.stringify({ error: 'Failed to load matches from DB' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build normalised index of DB matches
  const dbIndex = allDbMatches.map(m => ({
    ...m,
    normHome: normalise(m.home_team),
    normAway: normalise(m.away_team),
    date: m.match_date ? m.match_date.substring(0, 10) : null
  }));

  const results = [];

  for (const match of matches) {
    const homeTerms = getSearchTerms(match.homeCode);
    const awayTerms = getSearchTerms(match.awayCode);

    console.log(`Looking for: ${match.homeCode} (${homeTerms.normCanonical}) vs ${match.awayCode} (${awayTerms.normCanonical}) on ${match.date}`);

    // Find matching DB row — try date + teams first, then just teams
    let dbMatch = dbIndex.find(m => {
      const homeMatch = m.normHome.includes(homeTerms.firstWord) || m.normAway.includes(homeTerms.firstWord);
      const awayMatch = m.normHome.includes(awayTerms.firstWord) || m.normAway.includes(awayTerms.firstWord);
      const dateMatch = m.date === match.date;
      return homeMatch && awayMatch && dateMatch;
    });

    // Fallback: match by teams only (handles UTC date offsets)
    if (!dbMatch) {
      dbMatch = dbIndex.find(m => {
        const homeMatch = m.normHome.includes(homeTerms.firstWord) || m.normAway.includes(homeTerms.firstWord);
        const awayMatch = m.normHome.includes(awayTerms.firstWord) || m.normAway.includes(awayTerms.firstWord);
        return homeMatch && awayMatch;
      });
    }

    // Fallback: check aliases for team names stored differently in DB
    if (!dbMatch) {
      const homeAlias = NAME_ALIASES[homeTerms.normCanonical];
      const awayAlias = NAME_ALIASES[awayTerms.normCanonical];
      const homeAlt = homeAlias ? normalise(CODE_TO_NAME[homeAlias] || homeAlias) : homeTerms.normCanonical;
      const awayAlt = awayAlias ? normalise(CODE_TO_NAME[awayAlias] || awayAlias) : awayTerms.normCanonical;

      dbMatch = dbIndex.find(m => {
        const homeMatch = m.normHome.includes(homeAlt.split(' ')[0]) || m.normAway.includes(homeAlt.split(' ')[0]);
        const awayMatch = m.normHome.includes(awayAlt.split(' ')[0]) || m.normAway.includes(awayAlt.split(' ')[0]);
        return homeMatch && awayMatch;
      });
    }

    if (!dbMatch) {
      console.error(`Match not found: ${match.homeCode} vs ${match.awayCode} on ${match.date}`);
      console.log('DB teams sample:', dbIndex.slice(0, 5).map(m => `${m.normHome} vs ${m.normAway}`));
      results.push({ match: `${match.homeCode} vs ${match.awayCode}`, status: 'not_found' });
      continue;
    }

    console.log(`Found: ${dbMatch.home_team} vs ${dbMatch.away_team} (id: ${dbMatch.id})`);

    // Update score and status
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

    // Clear existing events
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
