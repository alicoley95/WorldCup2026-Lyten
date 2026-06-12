/**
 * Calculate score for a single prediction.
 * 20 points max, minus 1 per unit of error, floored at 0.
 */
export function calcScore(predicted, actual) {
  if (actual === null || actual === undefined) return null;
  if (predicted === null || predicted === undefined) return null;
  return Math.max(0, 20 - Math.abs(predicted - actual));
}

/**
 * Calculate all scores for a participant given actual nation stats.
 * Returns { position, goalsFor, goalsAgainst, topScorer, yellowCards, total }
 */
export function calcAllScores(participant, nationStats) {
  if (!nationStats) {
    return { position: null, goalsFor: null, goalsAgainst: null, topScorer: null, yellowCards: null, total: 0 };
  }

  const position = calcScore(participant.predicted_position, nationStats.final_position);
  const goalsFor = calcScore(participant.predicted_goals_for, nationStats.goals_for);
  const goalsAgainst = calcScore(participant.predicted_goals_against, nationStats.goals_against);
  const topScorer = calcScore(participant.predicted_top_scorer_goals, nationStats.top_scorer_goals);
  const yellowCards = calcScore(participant.predicted_yellow_cards, nationStats.yellow_cards);

  const scores = [position, goalsFor, goalsAgainst, topScorer, yellowCards];
  const total = scores.reduce((sum, s) => sum + (s ?? 0), 0);

  return { position, goalsFor, goalsAgainst, topScorer, yellowCards, total };
}

/**
 * Compute nation stats from matches data.
 * Returns { goals_for, goals_against, yellow_cards, games_played, top_scorer_goals, final_position }
 */
export function computeNationStats(nationName, matches, goalScorers, nationPositions) {
  let goalsFor = 0;
  let goalsAgainst = 0;
  let yellowCards = 0;
  let gamesPlayed = 0;

  for (const match of matches) {
    if (match.status !== 'finished') continue;

    if (match.home_team === nationName) {
      goalsFor += match.home_score || 0;
      goalsAgainst += match.away_score || 0;
      yellowCards += match.home_yellows || 0;
      gamesPlayed++;
    } else if (match.away_team === nationName) {
      goalsFor += match.away_score || 0;
      goalsAgainst += match.home_score || 0;
      yellowCards += match.away_yellows || 0;
      gamesPlayed++;
    }
  }

  // Compute top scorer for this nation
  const nationGoals = goalScorers.filter(g => g.team === nationName && !g.is_own_goal);
  const playerGoals = {};
  for (const g of nationGoals) {
    playerGoals[g.player_name] = (playerGoals[g.player_name] || 0) + 1;
  }
  const topScorerGoals = Object.values(playerGoals).length > 0
    ? Math.max(...Object.values(playerGoals))
    : 0;

  const topScorerName = Object.entries(playerGoals)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Final position comes from manual admin entry or computed from elimination stage
  const finalPosition = nationPositions?.[nationName] ?? null;

  return {
    goals_for: gamesPlayed > 0 ? goalsFor : null,
    goals_against: gamesPlayed > 0 ? goalsAgainst : null,
    yellow_cards: gamesPlayed > 0 ? yellowCards : null,
    games_played: gamesPlayed,
    top_scorer_goals: gamesPlayed > 0 ? topScorerGoals : null,
    top_scorer_name: topScorerName,
    final_position: finalPosition
  };
}
