import React, { useState } from 'react'
import { TEAMS, GROUPS } from '../lib/teams'

const STAGE_ORDER = ['Group Stage', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Third Place', 'Final']

export default function Schedule({ matches, goalScorers }) {
  const [filter, setFilter] = useState('all')

  const filteredMatches = matches.filter(m => {
    if (filter === 'all') return true
    if (GROUPS.includes(filter)) return m.group_name === filter
    return m.stage === filter
  })

  // Group matches by stage
  const grouped = {}
  for (const m of filteredMatches) {
    const key = m.stage || 'Unknown'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  }

  // Compute nation stats summary
  const nationStats = {}
  for (const m of matches) {
    if (m.status !== 'finished') continue
    for (const side of ['home', 'away']) {
      const team = side === 'home' ? m.home_team : m.away_team
      if (!team) continue
      if (!nationStats[team]) nationStats[team] = { gf: 0, ga: 0, yc: 0, gp: 0 }
      nationStats[team].gf += (side === 'home' ? m.home_score : m.away_score) || 0
      nationStats[team].ga += (side === 'home' ? m.away_score : m.home_score) || 0
      nationStats[team].yc += (side === 'home' ? m.home_yellows : m.away_yellows) || 0
      nationStats[team].gp++
    }
  }

  const getTeamFlag = (name) => {
    const t = TEAMS.find(t => t.name === name)
    return t?.flag || '🏳️'
  }

  const getMatchGoals = (matchId, team) => {
    return goalScorers.filter(g => g.match_id === matchId && g.team === team)
  }

  return (
    <div className="page">
      <h2>📅 Schedule & Results</h2>

      <div className="filter-bar">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        {GROUPS.map(g => (
          <button key={g} className={filter === g ? 'active' : ''} onClick={() => setFilter(g)}>
            Grp {g}
          </button>
        ))}
        {STAGE_ORDER.filter(s => s !== 'Group Stage').map(s => (
          <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
      </div>

      {STAGE_ORDER.map(stage => {
        const stageMatches = grouped[stage]
        if (!stageMatches || stageMatches.length === 0) return null
        return (
          <div key={stage} className="stage-section">
            <h3 className="stage-title">{stage}</h3>
            <div className="matches-grid">
              {stageMatches.map(m => {
                const homeGoals = getMatchGoals(m.id, m.home_team)
                const awayGoals = getMatchGoals(m.id, m.away_team)
                return (
                  <div key={m.id} className={`match-card ${m.status === 'finished' ? 'finished' : m.status === 'live' ? 'live' : ''}`}>
                    {m.group_name && <span className="match-group">Group {m.group_name}</span>}
                    <span className="match-date">
                      {m.match_date ? new Date(m.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                    </span>
                    {m.venue && <span className="match-venue">{m.venue}</span>}
                    <div className="match-teams">
                      <div className="match-team home">
                        <span className="team-flag">{getTeamFlag(m.home_team)}</span>
                        <span className="team-name">{m.home_team || 'TBD'}</span>
                      </div>
                      <div className="match-score">
                        {m.status === 'finished' || m.status === 'live' ? (
                          <span className="score">{m.home_score} — {m.away_score}</span>
                        ) : (
                          <span className="score-vs">vs</span>
                        )}
                        {m.status === 'live' && <span className="live-badge">LIVE</span>}
                      </div>
                      <div className="match-team away">
                        <span className="team-flag">{getTeamFlag(m.away_team)}</span>
                        <span className="team-name">{m.away_team || 'TBD'}</span>
                      </div>
                    </div>
                    {m.status === 'finished' && (homeGoals.length > 0 || awayGoals.length > 0) && (
                      <div className="match-events">
                        {homeGoals.map((g, i) => (
                          <span key={`h${i}`} className="goal-event">⚽ {g.player_name} {g.minute}'</span>
                        ))}
                        {awayGoals.map((g, i) => (
                          <span key={`a${i}`} className="goal-event">⚽ {g.player_name} {g.minute}'</span>
                        ))}
                      </div>
                    )}
                    {m.status === 'finished' && (m.home_yellows > 0 || m.away_yellows > 0) && (
                      <div className="match-cards-info">
                        🟨 {m.home_team}: {m.home_yellows || 0} | {m.away_team}: {m.away_yellows || 0}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Nation cumulative stats */}
      {Object.keys(nationStats).length > 0 && (
        <div className="nation-stats-section">
          <h3>Nation Cumulative Stats</h3>
          <div className="table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Nation</th>
                  <th>GP</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>YC</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(nationStats)
                  .sort((a, b) => b[1].gf - a[1].gf)
                  .map(([nation, s]) => (
                    <tr key={nation}>
                      <td>{getTeamFlag(nation)} {nation}</td>
                      <td>{s.gp}</td>
                      <td>{s.gf}</td>
                      <td>{s.ga}</td>
                      <td>{s.yc}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
