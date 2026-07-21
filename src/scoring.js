const MAX_POINTS = 20

export function proximityScore(guess, actual) {
  if (actual === null || actual === undefined) return null
  return Math.max(0, MAX_POINTS - Math.abs(guess - actual))
}

export function getTeamStats(teamName, matches, events, predictedScorerName, teamCode, overrides) {
  // Scorer goals use teamName directly — match_events stores full names not codes
  const teamEvents = events.filter(e => e.team === teamName)
  const goalEvents = teamEvents.filter(e =>
    e.event_type === 'goal' || e.event_type === 'penalty_goal'
  )
  const scorerMap = {}
  goalEvents.forEach(e => {
    scorerMap[e.player_name] = (scorerMap[e.player_name] || 0) + 1
  })
  let topScorer = { name: '-', goals: 0 }
  Object.entries(scorerMap).forEach(([name, goals]) => {
    if (goals > topScorer.goals) topScorer = { name, goals }
  })
  const normalise = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const predictedScorerGoals = predictedScorerName
    ? Object.entries(scorerMap).find(([name]) => normalise(name) === normalise(predictedScorerName))?.[1] || 0
    : 0

  // GF, GA and yellow cards use verified overrides from team_stats table if available,
  // otherwise fall back to live calculation from match data
  let goalsFor = 0, goalsAgainst = 0, yellowCards = 0
  if (overrides) {
    goalsFor = overrides.goals_for
    goalsAgainst = overrides.goals_against
    yellowCards = overrides.yellow_cards
  } else {
    const finished = matches.filter(
      m => m.status === 'finished' && (m.home_team === teamName || m.away_team === teamName)
    )
    finished.forEach(m => {
      if (m.home_team === teamName) {
        goalsFor += m.home_score || 0
        goalsAgainst += m.away_score || 0
      } else {
        goalsFor += m.away_score || 0
        goalsAgainst += m.home_score || 0
      }
    })
    yellowCards = teamEvents.filter(e => e.event_type === 'yellow').length
  }

  return {
    goalsFor,
    goalsAgainst,
    yellowCards,
    topScorer,
    predictedScorerGoals,
    combinedGoals: goalsFor + goalsAgainst
  }
}

export function scoreParticipant(participant, teamStats, teamPosition) {
  const pos = teamPosition !== null ? proximityScore(participant.position_guess, teamPosition) : null
  const gf = proximityScore(participant.goals_for_guess, teamStats.goalsFor)
  const ga = proximityScore(participant.goals_against_guess, teamStats.goalsAgainst)
  const ts = proximityScore(participant.top_scorer_goals_guess, teamStats.predictedScorerGoals)
  const yc = proximityScore(participant.yellow_cards_guess, teamStats.yellowCards)
  const scores = { position: pos, goalsFor: gf, goalsAgainst: ga, topScorer: ts, yellowCards: yc }
  const available = Object.values(scores).filter(s => s !== null)
  scores.total = available.length > 0 ? available.reduce((a, b) => a + b, 0) : 0
  const tbActual = teamStats.combinedGoals
  scores.tiebreakerDiff = tbActual > 0 ? Math.abs(participant.tiebreaker_guess - tbActual) : null
  return scores
}
