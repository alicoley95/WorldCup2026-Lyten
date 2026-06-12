import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getTeam, GROUPS } from '../data/teams'

const STAGE_ORDER = ['Group Stage','Round of 32','Round of 16','Quarter-final','Semi-final','Third Place','Final']

export default function Schedule() {
  const [matches, setMatches] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const [mRes, eRes] = await Promise.all([
        supabase.from('matches').select('*').order('match_date', { ascending: true }),
        supabase.from('match_events').select('*')
      ])
      setMatches(mRes.data || [])
      setEvents(eRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Loading schedule...</div>
  if (matches.length === 0) return (
    <div className="empty">
      <h2>No matches loaded</h2>
      <p>Sync matches from the Admin panel to populate the schedule.</p>
    </div>
  )

  const filterOptions = ['all', ...GROUPS.map(g => `Group ${g}`), 'Knockout']

  const filtered = matches.filter(m => {
    if (filter === 'all') return true
    if (filter === 'Knockout') return !m.stage.startsWith('Group')
    return m.stage === filter || m.group_name === filter.replace('Group ', '')
  })

  const grouped = {}
  filtered.forEach(m => {
    const key = m.group_name ? `Group ${m.group_name}` : m.stage
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  })

  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const aIdx = STAGE_ORDER.findIndex(s => a.includes(s) || a.startsWith('Group'))
    const bIdx = STAGE_ORDER.findIndex(s => b.includes(s) || b.startsWith('Group'))
    if (a.startsWith('Group') && b.startsWith('Group')) return a.localeCompare(b)
    if (a.startsWith('Group') && !b.startsWith('Group')) return -1
    if (!a.startsWith('Group') && b.startsWith('Group')) return 1
    return aIdx - bIdx
  })

  const finishedCount = matches.filter(m => m.status === 'finished').length

  return (
    <>
      <div className="page-title">📅 Schedule & Results</div>
      <div className="alert alert-info">{finishedCount} of {matches.length} matches completed</div>

      <div className="filter-row">
        {filterOptions.map(f => (
          <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All Matches' : f}
          </button>
        ))}
      </div>

      {sortedKeys.map(stage => (
        <div key={stage}>
          <div className="stage-header">{stage}</div>
          <div className="card">
            {grouped[stage].map(m => (
              <MatchRow key={m.id} match={m} events={events.filter(e => e.match_id === m.id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function MatchRow({ match, events }) {
  const home = getTeam(match.home_team)
  const away = getTeam(match.away_team)
  const homeGoals = events.filter(e => e.team === match.home_team && ['goal','penalty_goal'].includes(e.event_type))
  const awayGoals = events.filter(e => e.team === match.away_team && ['goal','penalty_goal'].includes(e.event_type))
  const homeYellows = events.filter(e => e.team === match.home_team && e.event_type === 'yellow')
  const awayYellows = events.filter(e => e.team === match.away_team && e.event_type === 'yellow')

  const dateStr = match.match_date
    ? new Date(match.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'TBC'

  return (
    <div>
      <div className="match-card">
        <div className="match-team">
          <span>{home.flag}</span>
          <span>{match.home_team}</span>
        </div>
        <div>
          {match.status === 'finished' ? (
            <div className="match-score">{match.home_score} — {match.away_score}</div>
          ) : match.status === 'live' ? (
            <div className="match-score" style={{ color: 'var(--red)' }}>
              {match.home_score} — {match.away_score}
            </div>
          ) : (
            <div className="match-score pending">vs</div>
          )}
          <div className="match-meta">
            {dateStr}
            {match.venue && ` · ${match.venue}`}
          </div>
          <div className="match-meta">
            <span className={`badge badge-${match.status}`}>{match.status}</span>
          </div>
        </div>
        <div className="match-team away">
          <span>{match.away_team}</span>
          <span>{away.flag}</span>
        </div>
      </div>
      {events.length > 0 && (
        <div className="event-list" style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {homeGoals.map((e, i) => <span key={i} className="event-goal">⚽ {e.player_name} {e.minute && `${e.minute}'`} </span>)}
            {homeYellows.map((e, i) => <span key={i} className="event-yellow">🟨 {e.player_name} </span>)}
          </div>
          <div style={{ textAlign: 'right' }}>
            {awayGoals.map((e, i) => <span key={i} className="event-goal">⚽ {e.player_name} {e.minute && `${e.minute}'`} </span>)}
            {awayYellows.map((e, i) => <span key={i} className="event-yellow">🟨 {e.player_name} </span>)}
          </div>
        </div>
      )}
    </div>
  )
}
