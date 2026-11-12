import { describe, expect, it } from 'vitest'
import { expectedScore, kFactor, rateMatch, replayRatings } from './rating'

const p = (id: string, rating: number, matchesRated = 0) => ({ id, rating, matchesRated })

describe('rating', () => {
  it('drops K by 10 per rated match to a floor of 20', () => {
    expect([0, 1, 2, 3, 4, 9].map(kFactor)).toEqual([60, 50, 40, 30, 20, 20])
  })

  it('expects 50% between equal teams and favours the higher team', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5)
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 3)
  })

  it('scores by share of games: 4–2 between equal teams gives +10 / −10 at K 60', () => {
    const deltas = rateMatch([p('a', 1200), p('b', 1200)], [p('c', 1200), p('d', 1200)], 4, 2)
    expect(Object.fromEntries(deltas)).toEqual({ a: 10, b: 10, c: -10, d: -10 })
  })

  it('gives both partners the same change, using the mean K of the team', () => {
    // Team A K = (60 + 20) / 2 = 40; S = 1, E = 0.5 → +20
    const deltas = rateMatch([p('a', 1200, 0), p('b', 1200, 5)], [p('c', 1200), p('d', 1200)], 6, 0)
    expect(deltas.get('a')).toBe(20)
    expect(deltas.get('b')).toBe(20)
  })

  it('changes nothing for a 0–0 score', () => {
    const deltas = rateMatch([p('a', 1500), p('b', 1000)], [p('c', 1100), p('d', 1300)], 0, 0)
    expect([...deltas.values()].every((d) => d === 0)).toBe(true)
  })

  it('replays matches in order, lowering K as players get rated', () => {
    const start = ['a', 'b', 'c', 'd'].map((id) => ({ id, rating: 1200 }))
    const first = { id: 'm1', teamA: ['a', 'b'], teamB: ['c', 'd'], gamesA: 4, gamesB: 2 }
    const second = { id: 'm2', teamA: ['a', 'c'], teamB: ['b', 'd'], gamesA: 3, gamesB: 3 }
    const { players, perMatch } = replayRatings(start, [first, second])
    expect(perMatch.get('m1')!.deltas.get('a')).toBe(10)
    expect(perMatch.get('m2')!.before.get('a')).toBe(1210)
    expect(players.get('a')).toEqual({ id: 'a', rating: 1210, matchesRated: 2 })
    expect(players.get('d')).toEqual({ id: 'd', rating: 1190, matchesRated: 2 })
  })

  it('reflects a corrected earlier score when replayed', () => {
    const start = ['a', 'b', 'c', 'd'].map((id) => ({ id, rating: 1200 }))
    const fixed = replayRatings(start, [{ id: 'm1', teamA: ['a', 'b'], teamB: ['c', 'd'], gamesA: 2, gamesB: 4 }])
    expect(fixed.players.get('a')!.rating).toBe(1190)
  })
})
