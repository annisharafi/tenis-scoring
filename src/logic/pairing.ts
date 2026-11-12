import { config } from '../config'

export type Pair = readonly [string, string]
export type Match = { court: number; teamA: Pair; teamB: Pair }
export type Round = { number: number; matches: Match[]; resting: string[] }
export type PairingPlayer = { id: string; rating: number }

// Rating gap at which the favourite's win chance reaches maxWinChance (about 70 points at 60%).
const maxFairGap = 400 * Math.log10(config.pairing.maxWinChance / (1 - config.pairing.maxWinChance))
// Priorities, strongest first: every court fair (and when none can be, the least unfair split),
// then no partner from the previous round, then close averages and the repeat penalties in config.
const UNFAIR_COURT_COST = 1_000_000
const UNFAIR_POINT_COST = 1_000
const LAST_ROUND_PARTNER_COST = 10_000

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** How often each two players partnered and faced each other in the given rounds. */
export function meetingCounts(rounds: readonly Round[]) {
  const partners = new Map<string, number>()
  const opponents = new Map<string, number>()
  const bump = (m: Map<string, number>, a: string, b: string) => m.set(key(a, b), (m.get(key(a, b)) ?? 0) + 1)
  for (const round of rounds) {
    for (const { teamA, teamB } of round.matches) {
      bump(partners, ...teamA)
      bump(partners, ...teamB)
      for (const a of teamA) for (const b of teamB) bump(opponents, a, b)
    }
  }
  return { partners, opponents }
}

/**
 * Splits `active` (a multiple of 4) into courts of two teams so the team averages on each court
 * are as close as possible, with penalties for repeat partners and opponents from `history`.
 * Courts outside the fair win-chance band cost far more than any repeat, so repeats only happen
 * when no balanced alternative exists, and an unbalanced court is as close as the ratings allow.
 * Up to `exhaustiveMaxPlayers` every split is tried; above that a greedy high–low pairing is used.
 */
export function pairRound(active: readonly PairingPlayer[], history: readonly Round[]): Match[] {
  if (active.length % 4 !== 0) throw new Error(`pairRound needs a multiple of 4 players, got ${active.length}`)
  if (active.length === 0) return []
  const teams =
    active.length <= config.pairing.exhaustiveMaxPlayers ? exhaustive(active, history) : greedy(active)
  return teams.map(([teamA, teamB], i) => ({ court: i + 1, teamA, teamB }))
}

function exhaustive(players: readonly PairingPlayer[], history: readonly Round[]): [Pair, Pair][] {
  const { repeatPartnerPenalty, repeatOpponentPenalty } = config.pairing
  const { partners, opponents } = meetingCounts(history)
  const lastPartners = meetingCounts(history.slice(-1)).partners
  const n = players.length
  const ids = players.map((p) => p.id)
  const met = (m: Map<string, number>, i: number, j: number) => m.get(key(ids[i], ids[j])) ?? 0

  // Costs of every possible team, by player index.
  const avg = (i: number, j: number) => (players[i].rating + players[j].rating) / 2
  const teamCost = (i: number, j: number) =>
    repeatPartnerPenalty * met(partners, i, j) + LAST_ROUND_PARTNER_COST * met(lastPartners, i, j)
  const courtCost = ([a, b]: number[], [c, d]: number[]) => {
    const gap = Math.abs(avg(a, b) - avg(c, d))
    return (
      gap +
      (gap > maxFairGap ? UNFAIR_COURT_COST + (gap - maxFairGap) * UNFAIR_POINT_COST : 0) +
      repeatOpponentPenalty * (met(opponents, a, c) + met(opponents, a, d) + met(opponents, b, c) + met(opponents, b, d))
    )
  }

  let best = Infinity
  let bestCourts: number[][][] = []
  const used: boolean[] = new Array(n).fill(false)
  const teams: number[][] = []

  // Choose teams first, then pair the teams onto courts. Costs never go negative, so prune at `best`;
  // ties keep the first split found, which keeps results deterministic.
  function chooseTeams(cost: number) {
    if (cost >= best) return
    const i = used.indexOf(false)
    if (i === -1) return chooseCourts(cost, new Array(teams.length).fill(false), [])
    used[i] = true
    for (let j = i + 1; j < n; j++) {
      if (used[j]) continue
      used[j] = true
      teams.push([i, j])
      chooseTeams(cost + teamCost(i, j))
      teams.pop()
      used[j] = false
    }
    used[i] = false
  }

  function chooseCourts(cost: number, taken: boolean[], courts: number[][][]) {
    if (cost >= best) return
    const a = taken.indexOf(false)
    if (a === -1) {
      best = cost
      bestCourts = courts.slice()
      return
    }
    taken[a] = true
    for (let b = a + 1; b < teams.length; b++) {
      if (taken[b]) continue
      taken[b] = true
      courts.push([teams[a], teams[b]])
      chooseCourts(cost + courtCost(teams[a], teams[b]), taken, courts)
      courts.pop()
      taken[b] = false
    }
    taken[a] = false
  }

  chooseTeams(0)
  const pair = ([i, j]: number[]): Pair => [ids[i], ids[j]]
  return bestCourts.map(([a, b]) => [pair(a), pair(b)])
}

/** Highest with lowest, then teams with the closest averages share a court. */
function greedy(players: readonly PairingPlayer[]): [Pair, Pair][] {
  const sorted = [...players].sort((a, b) => b.rating - a.rating)
  const teams = sorted
    .slice(0, sorted.length / 2)
    .map((high, i) => {
      const low = sorted[sorted.length - 1 - i]
      return { pair: [high.id, low.id] as Pair, avg: (high.rating + low.rating) / 2 }
    })
    .sort((a, b) => b.avg - a.avg)
  const courts: [Pair, Pair][] = []
  for (let i = 0; i < teams.length; i += 2) courts.push([teams[i].pair, teams[i + 1].pair])
  return courts
}
