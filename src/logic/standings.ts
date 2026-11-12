import type { ScoredMatch } from './rating.ts'

export type Standing = { id: string; name: string; won: number; lost: number; tied: number; games: number }

/**
 * Win / loss / tie record and games won per player, sorted by matches won, then games won
 * (then name, so equal records keep a stable order). A tie is an even score such as 3–3.
 */
export function standings(players: readonly { id: string; name: string }[], matches: readonly ScoredMatch[]): Standing[] {
  const rows = new Map(players.map((p) => [p.id, { id: p.id, name: p.name, won: 0, lost: 0, tied: 0, games: 0 }]))
  for (const m of matches) {
    for (const [team, own, other] of [
      [m.teamA, m.gamesA, m.gamesB],
      [m.teamB, m.gamesB, m.gamesA],
    ] as const) {
      for (const id of team) {
        const row = rows.get(id)
        if (!row) continue
        row.games += own
        if (own > other) row.won++
        else if (own < other) row.lost++
        else row.tied++
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.won - a.won || b.games - a.games || a.name.localeCompare(b.name))
}
