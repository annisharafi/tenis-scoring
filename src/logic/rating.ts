import { config } from '../config'

export type RatedPlayer = { id: string; rating: number; matchesRated: number }

/** Chance that a team rated `ratingA` beats one rated `ratingB` (Elo expectation). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400))
}

export function teamAverage(team: readonly { rating: number }[]): number {
  return team.reduce((sum, p) => sum + p.rating, 0) / team.length
}

/** K starts at kStart and drops by kStep per rated match, down to kMin. */
export function kFactor(matchesRated: number): number {
  const { kStart, kStep, kMin } = config.rating
  return Math.max(kMin, kStart - kStep * matchesRated)
}

/**
 * Doubles Elo on team averages, scored by the share of games won.
 * Both players on a team get the same change, so the team uses the mean of its players' K.
 * Returns the rounded rating change per player id; a 0–0 score changes nothing.
 */
export function rateMatch(
  teamA: readonly RatedPlayer[],
  teamB: readonly RatedPlayer[],
  gamesA: number,
  gamesB: number,
): Map<string, number> {
  const deltas = new Map<string, number>()
  const total = gamesA + gamesB
  const expectedA = expectedScore(teamAverage(teamA), teamAverage(teamB))
  const scoreA = total === 0 ? expectedA : gamesA / total
  const teamK = (team: readonly RatedPlayer[]) => team.reduce((s, p) => s + kFactor(p.matchesRated), 0) / team.length

  const deltaA = Math.round(teamK(teamA) * (scoreA - expectedA))
  const deltaB = Math.round(teamK(teamB) * (1 - scoreA - (1 - expectedA)))
  for (const p of teamA) deltas.set(p.id, deltaA)
  for (const p of teamB) deltas.set(p.id, deltaB)
  return deltas
}

export type ScoredMatch = {
  id: string
  teamA: readonly string[]
  teamB: readonly string[]
  gamesA: number
  gamesB: number
}

/**
 * Rates every scored match in play order, starting from each player's starting rating.
 * Replaying (rather than adjusting) keeps ratings right when an earlier score is corrected.
 * Returns current ratings plus, per match, the ratings going in and each player's change.
 */
export function replayRatings(
  starting: readonly { id: string; rating: number }[],
  matches: readonly ScoredMatch[],
): {
  players: Map<string, RatedPlayer>
  perMatch: Map<string, { before: Map<string, number>; deltas: Map<string, number> }>
} {
  const players = new Map(starting.map((p) => [p.id, { id: p.id, rating: p.rating, matchesRated: 0 }]))
  const perMatch = new Map<string, { before: Map<string, number>; deltas: Map<string, number> }>()
  for (const m of matches) {
    const teamA = m.teamA.map((id) => players.get(id)!)
    const teamB = m.teamB.map((id) => players.get(id)!)
    const before = new Map([...teamA, ...teamB].map((p) => [p.id, p.rating]))
    const deltas = rateMatch(teamA, teamB, m.gamesA, m.gamesB)
    for (const [id, delta] of deltas) {
      const p = players.get(id)!
      players.set(id, { ...p, rating: p.rating + delta, matchesRated: p.matchesRated + 1 })
    }
    perMatch.set(m.id, { before, deltas })
  }
  return { players, perMatch }
}
