import React from 'react'
import { TEAMS } from '../lib/teams'

export default function Leaderboard({ leaderboard, matches }) {
  const finishedMatches = matches.filter(m => m.status === 'finished').length

  if (leaderboard.length === 0) {
    return (
      <div className="page">
        <h2>🏆 Leaderboard</h2>
        <div className="empty-state">
          <p>No entries yet. Add participants in the Entries tab to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <h2>🏆 Leaderboard</h2>
      <p className="page-subtitle">{finishedMatches} of 104 matches played</p>

      <div className="leaderboard-cards">
        {leaderboard.map((entry, i) => {
          const team = TEAMS.find(t => t.name === entry.nation)
          const s = entry.scores
          const rank = i + 1

          return (
            <div key={entry.id} className={`lb-card ${rank <= 3 ? 'lb-top' : ''}`}>
              <div className="lb-rank">
                {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
              </div>
              <div className="lb-info">
                <div className="lb-name-row">
                  <span className="lb-flag">{team?.flag || '🏳️'}</span>
                  <span className="lb-player-name">{entry.name}</span>
                  <span className="lb-nation">{entry.nation}</span>
                </div>
                <div className="lb-scores">
                  <div className="lb-score-item" title="Final Position">
                    <span className="lb-score-label">Pos</span>
                    <span className="lb-score-val">{s.position ?? '—'}</span>
                  </div>
                  <div className="lb-score-item" title="Goals For">
                    <span className="lb-score-label">GF</span>
                    <span className="lb-score-val">{s.goalsFor ?? '—'}</span>
                  </div>
                  <div className="lb-score-item" title="Goals Against">
                    <span className="lb-score-label">GA</span>
                    <span className="lb-score-val">{s.goalsAgainst ?? '—'}</span>
                  </div>
                  <div className="lb-score-item" title="Top Scorer Goals">
                    <span className="lb-score-label">TS</span>
                    <span className="lb-score-val">{s.topScorer ?? '—'}</span>
                  </div>
                  <div className="lb-score-item" title="Yellow Cards">
                    <span className="lb-score-label">YC</span>
                    <span className="lb-score-val">{s.yellowCards ?? '—'}</span>
                  </div>
                </div>
                <div className="lb-predictions">
                  <span>Predictions: Pos {entry.predicted_position}, GF {entry.predicted_goals_for}, GA {entry.predicted_goals_against}, TS {entry.predicted_top_scorer_goals}, YC {entry.predicted_yellow_cards}</span>
                </div>
                {entry.stats && entry.stats.games_played > 0 && (
                  <div className="lb-actuals">
                    <span>Actuals: {entry.stats.final_position ? `Pos ${entry.stats.final_position}, ` : ''}GF {entry.stats.goals_for}, GA {entry.stats.goals_against}, TS {entry.stats.top_scorer_goals}{entry.stats.top_scorer_name ? ` (${entry.stats.top_scorer_name})` : ''}, YC {entry.stats.yellow_cards}</span>
                  </div>
                )}
              </div>
              <div className="lb-total">
                <span className="lb-total-num">{s.total}</span>
                <span className="lb-total-label">/ 100</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="scoring-key">
        <h3>Scoring Key</h3>
        <p>Each question: 20 points max, minus 1 per unit away from correct answer. Pos = Final Position, GF = Goals For, GA = Goals Against, TS = Top Scorer Goals, YC = Yellow Cards.</p>
      </div>
    </div>
  )
}
