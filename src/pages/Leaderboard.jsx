import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getTeamStats, scoreParticipant } from '../scoring'
import { getTeam } from '../data/teams'

export default function Leaderboard() {
  const [participants, setParticipants] = useState([])
  const [matches, setMatches] = useState([])
  const [events, setEvents] = useState([])
  const [positions, setPositions] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [pRes, mRes, eRes, posRes] = await Promise.all([
        supabase.from('participants').select('*'),
        supabase.from('matches').select('*'),
        supabase.from('match_events').select('*'),
        supabase.from('team_positions').select('*')
      ])
      setParticipants(pRes.data || [])
      setMatches(mRes.data || [])
      setEvents(eRes.data || [])
      const posMap = {}
      ;(posRes.data || []).forEach(p => { posMap[p.team] = p.final_position })
      setPositions(posMap)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Loading leaderboard...</div>
  if (participants.length === 0) return (
    <div className="empty">
      <h2>No participants yet</h2>
      <p>Add participants in the Admin panel to get started.</p>
    </div>
  )

  const scored = participants.map(p => {
    const team = getTeam(p.nation)
    const stats = getTeamStats(p.nation, matches, events, p.top_scorer_name)
    const pos = positions[p.nation] !== undefined ? positions[p.nation] : null
    const scores = scoreParticipant(p, stats, pos)
    return { ...p, team, stats, scores }
  })

  scored.sort((a, b) => {
    if (b.scores.total !== a.scores.total) return b.scores.total - a.scores.total
    if (a.scores.tiebreakerDiff !== null && b.scores.tiebreakerDiff !== null) {
      return a.scores.tiebreakerDiff - b.scores.tiebreakerDiff
    }
    return 0
  })

  const finishedCount = matches.filter(m => m.status === 'finished').length

  return (
    <>
      <div className="page-title">🏆 Leaderboard</div>
      <div className="alert alert-info">
        {finishedCount} of 104 matches completed. Scores update automatically as results are synced.
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Nation</th>
              <th>Position</th>
              <th>Goals For</th>
              <th>Goals Against</th>
              <th>Top Scorer</th>
              <th>Yellow Cards</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((p, i) => (
              <tr key={p.id} className={i < 3 ? `rank-${i + 1}` : ''}>
                <td><strong>{i + 1}</strong></td>
                <td><strong>{p.name}</strong></td>
                <td>{p.team.flag} {p.nation}</td>
                <td>
                  <ScoreCell score={p.scores.position} guess={p.position_guess}
                    actual={positions[p.nation]} suffix={ordinal(positions[p.nation])} />
                </td>
                <td>
                  <ScoreCell score={p.scores.goalsFor} guess={p.goals_for_guess}
                    actual={p.stats.goalsFor} />
                </td>
                <td>
                  <ScoreCell score={p.scores.goalsAgainst} guess={p.goals_against_guess}
                    actual={p.stats.goalsAgainst} />
                </td>
                <td>
                  <ScoreCell score={p.scores.topScorer} guess={p.top_scorer_goals_guess}
                    actual={p.stats.predictedScorerGoals} />
                  <div className="guess-vs">
                    {p.top_scorer_name}
                    {p.stats.topScorer.name !== '-' && p.stats.topScorer.name !== p.top_scorer_name && (
                      <> · actual leader: {p.stats.topScorer.name} ({p.stats.topScorer.goals})</>
                    )}
                  </div>
                </td>
                <td>
                  <ScoreCell score={p.scores.yellowCards} guess={p.yellow_cards_guess}
                    actual={p.stats.yellowCards} />
                </td>
                <td>
                  <span className="pts">{p.scores.total}</span>
                  <span className="pts-detail"> / 100</span>
                  {p.scores.tiebreakerDiff !== null && (
                    <div className="guess-vs">TB: ±{p.scores.tiebreakerDiff}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ScoreCell({ score, guess, actual, suffix }) {
  if (score === null) {
    return (
      <>
        <span className="pts-detail">—</span>
        <div className="guess-vs">Guess: {guess}</div>
      </>
    )
  }
  return (
    <>
      <span className="pts">{score}</span><span className="pts-detail">/20</span>
      <div className="guess-vs">{guess} → {suffix || actual}</div>
    </>
  )
}

function ordinal(n) {
  if (n === null || n === undefined) return null
  const s = ["th","st","nd","rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
