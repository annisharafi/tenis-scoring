import { describe, expect, it } from 'vitest'
import { addPlayer, markLive, ratingsOf, recordScore, saveScore, scoreError, setStartRating, startSession, type SessionState } from './session'

const ids = () => {
  let n = 0
  return () => `m${++n}`
}
const lobby = (ratings: number[]): SessionState => ({
  courts: 1,
  minutes: 120,
  players: ratings.map((startRating, i) => ({ id: `p${i + 1}`, startRating })),
  rounds: [],
})
const current = (s: SessionState) => s.rounds.find((r) => r.state === 'locked')!
const everyone = (s: SessionState, number: number) => {
  const r = s.rounds.find((x) => x.number === number)!
  return [...r.matches.flatMap((m) => [...m.teamA, ...m.teamB]), ...r.resting].sort()
}

describe('session', () => {
  it('plans nothing in the lobby, then every round on start with round 1 current', () => {
    const newId = ids()
    const s = addPlayer(lobby([1500, 1300, 1200, 1100]), { id: 'p5', startRating: 1000 }, newId)
    expect(s.rounds).toEqual([])
    const started = startSession(s, newId)
    expect(started.rounds).toHaveLength(7)
    expect(started.rounds.map((r) => r.state)).toEqual(['locked', ...Array(6).fill('planned')])
    expect(everyone(started, 1)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  it('needs 4 players and can only start once', () => {
    const newId = ids()
    expect(() => startSession(lobby([1500, 1300, 1200]), newId)).toThrow('At least 4')
    const started = startSession(lobby([1500, 1300, 1200, 1100]), newId)
    expect(() => startSession(started, newId)).toThrow('already started')
  })

  it('re-plans an unstarted current round for a late joiner', () => {
    const newId = ids()
    const s = addPlayer(startSession(lobby([1500, 1300, 1200, 1100]), newId), { id: 'p5', startRating: 1200 }, newId)
    expect(everyone(s, 1)).toContain('p5')
    expect(current(s).number).toBe(1)
  })

  it('keeps a started round as it is and rests the late joiner in it', () => {
    const newId = ids()
    let s = startSession(lobby([1500, 1300, 1200, 1100]), newId)
    const before = current(s).matches.map((m) => [m.teamA, m.teamB])
    s = markLive(s, current(s).matches[0].id)
    s = addPlayer(s, { id: 'p5', startRating: 1200 }, newId)
    expect(current(s).matches.map((m) => [m.teamA, m.teamB])).toEqual(before)
    expect(current(s).resting).toEqual(['p5'])
    expect(everyone(s, 2)).toContain('p5')
  })

  it('re-plans with a new survey rating', () => {
    const newId = ids()
    const s = startSession(lobby([1000, 1000, 1000, 1000, 1000]), newId)
    const rerated = setStartRating(s, 'p5', 1500, newId)
    expect(rerated.players.find((p) => p.id === 'p5')!.startRating).toBe(1500)
    expect(rerated.rounds.map((r) => r.matches[0].id)).not.toEqual(s.rounds.map((r) => r.matches[0].id))
  })

  it('saves a score, moves to the next round and keeps who rests in planned rounds', () => {
    const newId = ids()
    const s = startSession(lobby([1500, 1300, 1200, 1100, 1000]), newId)
    const resting = s.rounds.slice(1).map((r) => r.resting)
    const saved = saveScore(s, current(s).matches[0].id, 4, 2, newId)
    expect(saved.rounds[0]).toMatchObject({ state: 'done', matches: [{ gamesA: 4, gamesB: 2, status: 'done' }] })
    expect(current(saved).number).toBe(2)
    expect(saved.rounds.slice(1).map((r) => r.resting)).toEqual(resting)
    expect(ratingsOf(saved).players.get(s.rounds[0].matches[0].teamA[0])!.matchesRated).toBe(1)
  })

  it('lets a done score be corrected and replays ratings', () => {
    const newId = ids()
    let s = startSession(lobby([1200, 1200, 1200, 1200]), newId)
    const match = current(s).matches[0]
    s = saveScore(s, match.id, 4, 2, newId)
    s = saveScore(s, match.id, 2, 4, newId)
    expect(ratingsOf(s).players.get(match.teamA[0])!.rating).toBe(1190)
  })

  it('refuses planned matches and impossible scores', () => {
    const newId = ids()
    const s = startSession(lobby([1500, 1300, 1200, 1100]), newId)
    expect(() => saveScore(s, s.rounds[1].matches[0].id, 4, 2, newId)).toThrow('cannot be scored yet')
    expect(scoreError(4, 3)).toMatch('6 games in total')
    expect(scoreError(0, 0)).toMatch('at least one')
    expect(scoreError(-1, 2)).toMatch('0 to 6')
    expect(scoreError(3, 3)).toBeNull()
  })

  it('moves the current round on only when every court has a score', () => {
    const newId = ids()
    const s = startSession({ ...lobby([1500, 1400, 1300, 1300, 1200, 1100, 1000, 1000]), courts: 2 }, newId)
    const [court1, court2] = current(s).matches
    const one = recordScore(s.rounds, court1.id, 4, 2)
    expect(one.map((r) => r.state).slice(0, 2)).toEqual(['locked', 'planned'])
    const both = recordScore(one, court2.id, 3, 3)
    expect(both.map((r) => r.state).slice(0, 2)).toEqual(['done', 'locked'])
  })
})
