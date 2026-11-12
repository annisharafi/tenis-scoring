import { describe, expect, it } from 'vitest'
import { countPoints, type Side } from './tennis'

const taps = (s: string) => [...s] as Side[]

describe('countPoints', () => {
  it('calls 0, 15, 30, 40 then game', () => {
    expect(countPoints([], 'advantage').points).toEqual({ a: '0', b: '0' })
    expect(countPoints(taps('ab'), 'advantage').points).toEqual({ a: '15', b: '15' })
    expect(countPoints(taps('aab'), 'advantage').points).toEqual({ a: '30', b: '15' })
    expect(countPoints(taps('aaa'), 'advantage').points).toEqual({ a: '40', b: '0' })
    const game = countPoints(taps('aaaa'), 'advantage')
    expect(game.games).toEqual({ a: 1, b: 0 })
    expect(game.points).toEqual({ a: '0', b: '0' })
  })

  it('plays advantage from deuce: AD, back to deuce, then two clear points', () => {
    expect(countPoints(taps('aaabbb'), 'advantage')).toMatchObject({ points: { a: '40', b: '40' }, status: 'deuce' })
    expect(countPoints(taps('aaabbbb'), 'advantage').points).toEqual({ a: '40', b: 'AD' })
    expect(countPoints(taps('aaabbbba'), 'advantage').status).toBe('deuce')
    expect(countPoints(taps('aaabbbbaaa'), 'advantage').games).toEqual({ a: 1, b: 0 })
  })

  it('lets the point at 40–40 decide the game under sudden death', () => {
    expect(countPoints(taps('aaabbb'), 'sudden')).toMatchObject({ points: { a: '40', b: '40' }, status: 'deciding point' })
    expect(countPoints(taps('aaabbbb'), 'sudden').games).toEqual({ a: 0, b: 1 })
  })

  it('stops counting once all 6 games are played', () => {
    const sixGames = taps('aaaa'.repeat(4) + 'bbbb'.repeat(2))
    const done = countPoints([...sixGames, 'a', 'a'], 'sudden')
    expect(done).toMatchObject({ games: { a: 4, b: 2 }, matchOver: true, status: 'match over' })
  })
})
