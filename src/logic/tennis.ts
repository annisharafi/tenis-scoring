import { config } from '../config'

export type Side = 'a' | 'b'
export type GameSystem = 'sudden' | 'advantage'

/** What the live counter shows for one game in progress. */
export type CountState = {
  games: Record<Side, number>
  points: Record<Side, string>
  /** 'deuce' (advantage), 'deciding point' (sudden death at 40–40), or 'match over'. */
  status: 'deuce' | 'deciding point' | 'match over' | null
  matchOver: boolean
}

const CALLS = ['0', '15', '30', '40']

/**
 * Replays live taps (in order) into games won and the current game's call.
 * Games go 0, 15, 30, 40, then game. Advantage needs a two-point lead from deuce ("AD");
 * sudden death makes the point at 40–40 decide the game. Taps after the last game are ignored.
 */
export function countPoints(taps: readonly Side[], system: GameSystem): CountState {
  const games = { a: 0, b: 0 }
  let won = { a: 0, b: 0 }
  const matchOver = () => games.a + games.b >= config.schedule.gamesPerMatch

  for (const side of taps) {
    if (matchOver()) break
    won = { ...won, [side]: won[side] + 1 }
    const other = side === 'a' ? 'b' : 'a'
    const gameWon = system === 'sudden' ? won[side] >= 4 : won[side] >= 4 && won[side] - won[other] >= 2
    if (gameWon) {
      games[side]++
      won = { a: 0, b: 0 }
    }
  }

  if (matchOver()) return { games, points: { a: '0', b: '0' }, status: 'match over', matchOver: true }

  const atForty = won.a >= 3 && won.b >= 3
  if (atForty && won.a === won.b) {
    return { games, points: { a: '40', b: '40' }, status: system === 'sudden' ? 'deciding point' : 'deuce', matchOver: false }
  }
  if (atForty) {
    const ahead: Side = won.a > won.b ? 'a' : 'b'
    const points = ahead === 'a' ? { a: 'AD', b: '40' } : { a: '40', b: 'AD' }
    return { games, points, status: null, matchOver: false }
  }
  return { games, points: { a: CALLS[won.a], b: CALLS[won.b] }, status: null, matchOver: false }
}
