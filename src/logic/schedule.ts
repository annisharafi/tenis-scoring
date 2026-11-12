import { config } from '../config'
import { pairRound, type PairingPlayer, type Round } from './pairing'

/** Session minutes ÷ minutes per round, rounded down (120 ÷ 17 = 7). */
export function roundCount(minutes: number): number {
  return Math.floor(minutes / config.schedule.minutesPerRound)
}

/** Players on court each round: 4 per court, as many full courts as the roster fills. */
export function courtSpots(playerCount: number, courts: number): number {
  return Math.min(courts, Math.floor(playerCount / 4)) * 4
}

/**
 * Who sits out the next round. `players` is in join order.
 * Avoid resting anyone who rested last round, then rest whoever played the most matches,
 * then whoever played most recently, then the latest joiner.
 */
export function chooseResting(players: readonly PairingPlayer[], courts: number, before: readonly Round[]): string[] {
  const restCount = players.length - courtSpots(players.length, courts)
  if (restCount <= 0) return []
  const restedLast = new Set(before.at(-1)?.resting ?? [])
  const played = new Map<string, number>()
  const lastPlayed = new Map<string, number>()
  for (const round of before) {
    for (const m of round.matches) {
      for (const id of [...m.teamA, ...m.teamB]) {
        played.set(id, (played.get(id) ?? 0) + 1)
        lastPlayed.set(id, round.number)
      }
    }
  }
  return players
    .map((p, joinIndex) => ({ id: p.id, joinIndex }))
    .sort(
      (a, b) =>
        Number(restedLast.has(a.id)) - Number(restedLast.has(b.id)) ||
        (played.get(b.id) ?? 0) - (played.get(a.id) ?? 0) ||
        (lastPlayed.get(b.id) ?? 0) - (lastPlayed.get(a.id) ?? 0) ||
        b.joinIndex - a.joinIndex,
    )
    .slice(0, restCount)
    .map((p) => p.id)
}

/**
 * Plans rounds `numbers` after the fixed `history` (done and locked rounds, in order).
 * Pass `resting` (one list per planned round) to keep who rests and only re-pair partners and
 * opponents, as after a saved score. Leave it out for a full re-plan, as after a join or leave.
 */
export function planRounds({
  players,
  courts,
  history,
  numbers,
  resting,
}: {
  players: readonly PairingPlayer[]
  courts: number
  history: readonly Round[]
  numbers: readonly number[]
  resting?: readonly (readonly string[])[]
}): Round[] {
  const rounds: Round[] = []
  numbers.forEach((number, i) => {
    const before = [...history, ...rounds]
    const out = resting ? [...resting[i]] : chooseResting(players, courts, before)
    const active = players.filter((p) => !out.includes(p.id))
    rounds.push({ number, resting: out, matches: pairRound(active, before) })
  })
  return rounds
}
