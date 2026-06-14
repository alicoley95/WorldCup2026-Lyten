import { createClient } from '@supabase/supabase-js'

const API_KEY = process.env.API_FOOTBALL_KEY
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const API_HOST = 'v3.football.api-sports.io'
const LEAGUE_ID = 1
const SEASON = 2026

async function apiFetch(endpoint) {
  const res = await fetch(`https://${API_HOST}${endpoint}`, {
    headers: { 'x-apisports-key': API_KEY }
  })
  const text = await res.text()
  console.log(`API ${endpoint} status:`, res.status)
  console.log(`API ${endpoint} response:`, text.substring(0, 500))
  if (!res.ok) throw new Error(`API error: ${res.status} — ${text.substring(0, 200)}`)
  return JSON.parse(text)
}

function mapStage(round) {
  if (!round) return { stage: 'Group Stage', group_name: null }
  const r = round.toLowerCase()
  if (r.includes('group')) {
    const letter = round.replace(/[^A-L]/gi, '').toUpperCase()
    return { stage: 'Group Stage', group_name: letter || null }
  }
  if (r.includes('32')) return { stage: 'Round of 32', group_name: null }
  if (r.includes('16')) return { stage: 'Round of 16', group_name: null }
  if (r.includes('quarter')) return { stage: 'Quarter-final', group_name: null }
  if (r.includes('semi')) return { stage: 'Semi-final', group_name: null }
  if (r.includes('3rd') || r.includes('third')) return { stage: 'Third Place', group_name: null }
  if (r.includes('final') && !r.includes('semi') && !r.includes('quarter'))
    return { stage: 'Final', group_name: null }
  return { stage: round, group_name: null }
}

function mapEventType(type, detail) {
  if (type === 'Goal' && detail === 'Penalty') return 'penalty_goal'
  if (type === 'Goal' && detail === 'Own Goal') return 'own_goal'
  if (type === 'Goal') return 'goal'
  if (type === 'Card' && detail === 'Yellow Card') return 'yellow'
  if (type === 'Card' && detail === 'Red Card') return 'red'
  return null
}

export async function handler() {
  try {
    console.log('Sync started. API_KEY present:', !!API_KEY)
    console.log('SUPABASE_URL present:', !!process.env.SUPABASE_URL)
    console.log('SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY)

    if (!API_KEY) throw new Error('API_FOOTBALL_KEY not set in environment')

    const fixturesData = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const fixtures = fixturesData.response || []

    console.log('Fixtures received:', fixtures.length)
    console.log('API errors:', JSON.stringify(fixturesData.errors))

    if (fixtures.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          matchesUpdated: 0,
          eventsAdded: 0,
          message: 'No fixtures found',
          apiErrors: fixturesData.errors,
          apiResults: fixturesData.results
        })
      }
    }

    let matchesUpdated = 0
    let eventsAdded = 0

    for (const fix of fixtures) {
      const f = fix.fixture
      const teams = fix.teams
      const goals = fix.goals
      const league = fix.league

      const statusMap = {
        'FT': 'finished', 'AET': 'finished', 'PEN': 'finished',
        'NS': 'scheduled', 'TBD': 'scheduled', 'PST': 'scheduled',
        '1H': 'live', '2H': 'live', 'HT': 'live', 'ET': 'live', 'BT': 'live', 'P': 'live'
      }
      const status = statusMap[f.status?.short] || 'scheduled'
      const { stage, group_name } = mapStage(league.round)

      const row = {
        api_fixture_id: f.id,
        home_team: teams.home.name,
        away_team: teams.away.name,
        home_score: goals.home,
        away_score: goals.away,
        stage,
        group_name,
        match_date: f.date,
        venue: f.venue?.name || null,
        city: f.venue?.city || null,
        status,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase.from('matches').upsert(row, { onConflict: 'api_fixture_id' })
      if (error) console.error('Supabase upsert error:', error.message)
      else matchesUpdated++
    }

    // Fetch events for finished matches
    const { data: finishedMatches } = await supabase
      .from('matches')
      .select('id, api_fixture_id')
      .eq('status', 'finished')

    if (finishedMatches && finishedMatches.length > 0) {
      const { data: existingEvents } = await supabase
        .from('match_events')
        .select('match_id')

      const matchesWithEvents = new Set((existingEvents || []).map(e => e.match_id))
      const needEvents = finishedMatches.filter(m => !matchesWithEvents.has(m.id))

      for (const match of needEvents) {
        try {
          const evData = await apiFetch(`/fixtures/events?fixture=${match.api_fixture_id}`)
          const rawEvents = evData.response || []

          for (const ev of rawEvents) {
            const eventType = mapEventType(ev.type, ev.detail)
            if (!eventType) continue

            const eventRow = {
              match_id: match.id,
              team: ev.team?.name || 'Unknown',
              player_name: ev.player?.name || 'Unknown',
              event_type: eventType,
              minute: ev.time?.elapsed || null,
              detail: ev.detail || null
            }

            const { error } = await supabase.from('match_events').insert(eventRow)
            if (!error) eventsAdded++
          }
        } catch (err) {
          console.error(`Failed events for fixture ${match.api_fixture_id}:`, err.message)
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchesUpdated, eventsAdded, totalFixtures: fixtures.length })
    }
  } catch (err) {
    console.error('Sync error:', err.message)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    }
  }
}
