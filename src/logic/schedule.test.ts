import { describe, expect, it } from 'vitest'
import { config } from '../config'
import { expectedScore, teamAverage } from './rating'
import { meetingCounts, pairRound, type Match, type PairingPlayer, type Round } from './pairing'
import { planRounds, roundCount } from './schedule'

// Fake rosters with survey ratings (1000–1500), in join order.
const roster = (ratings: number[]): PairingPlayer[] => ratings.map((rating, i) => ({ id: `p${i + 1}`, rating }))
const five = roster([1500, 1300, 1200, 1100, 1000])
const eight = roster([1500, 1400, 1300, 1300, 1200, 1100, 1000, 1000])
const twelve = roster([1500, 1500, 1400, 1300, 1300, 1200, 1200, 1100, 1100, 1000, 1000, 1000])

const fullPlan = (players: PairingPlayer[], courts: number, rounds = roundCount(120)) =>
  planRounds({ players, courts, history: [], numbers: Array.from({ length: rounds }, (_, i) => i + 1) })

const ratingOf = (players: PairingPlayer[]) => {
  const byId = new Map(players.map((p) => [p.id, p]))
  return (ids: readonly string[]) => teamAverage(ids.map((id) => byId.get(id)!))
}

function checkRound(players: PairingPlayer[], round: Round, courts: number) {
  const onCourt = round.matches.flatMap((m) => [...m.teamA, ...m.teamB])
  const everyone = [...onCourt, ...round.resting].sort()
  expect(everyone).toEqual(players.map((p) => p.id).sort())
  expect(new Set(onCourt).size).toBe(onCourt.length)
  expect(round.matches.length).toBe(Math.min(courts, Math.floor(players.length / 4)))
}

const key = (a: string, b: string) => [a, b].sort().join('|')
const isFair = (chance: number) => chance >= 0.4 && chance <= 0.6

/** The three ways to split a court's four players into two teams. */
function splits(m: Match): [string[], string[]][] {
  const [a, b] = m.teamA
  const [c, d] = m.teamB
  return [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ]
}

/** Whether the four players on this court had a balanced split with no partner from `last`. */
function balancedSplit(m: Match, last: Map<string, number>, avg: (ids: readonly string[]) => number) {
  return splits(m).some(
    ([x, y]) =>
      !last.has(key(x[0], x[1])) && !last.has(key(y[0], y[1])) && isFair(expectedScore(avg(x), avg(y))),
  )
}

describe('schedule', () => {
  it('fits 7 rounds of 17 minutes into 2 hours', () => {
    expect(roundCount(120)).toBe(7)
    expect(roundCount(60)).toBe(3)
  })

  for (const [name, players, courts] of [
    ['5 players, 1 court', five, 1],
    ['8 players, 2 courts', eight, 2],
    ['8 players, 1 court', eight, 1],
    ['12 players, 3 courts', twelve, 3],
  ] as const) {
    describe(name, () => {
      const plan = fullPlan([...players], courts)
      const avg = ratingOf([...players])

      it('puts every player on court or resting exactly once per round', () => {
        for (const round of plan) checkRound([...players], round, courts)
      })

      it('keeps every court between 40% and 60% predicted win chance when ratings allow', () => {
        for (const round of plan)
          for (const m of round.matches) {
            const gap = Math.abs(avg(m.teamA) - avg(m.teamB))
            if (!isFair(expectedScore(avg(m.teamA), avg(m.teamB)))) {
              expect(balancedSplit(m, new Map(), avg)).toBe(false)
              expect(gap).toBe(Math.min(...splits(m).map(([x, y]) => Math.abs(avg(x) - avg(y)))))
            }
          }
      })

      it('never repeats a partner in consecutive rounds while a balanced alternative exists', () => {
        for (let i = 1; i < plan.length; i++) {
          const last = meetingCounts([plan[i - 1]]).partners
          for (const m of plan[i].matches) {
            const repeats = [m.teamA, m.teamB].some(([a, b]) => last.has(key(a, b)))
            if (repeats) expect(balancedSplit(m, last, avg), `round ${i + 1}`).toBe(false)
          }
        }
      })

      it('rests players evenly and nobody twice in a row when avoidable', () => {
        const rests = new Map<string, number>()
        plan.forEach((round, i) => {
          for (const id of round.resting) {
            rests.set(id, (rests.get(id) ?? 0) + 1)
            const restCount = round.resting.length
            const avoidable = players.length - restCount >= restCount
            if (i > 0 && avoidable) expect(plan[i - 1].resting).not.toContain(id)
          }
        })
        const counts = players.map((p) => rests.get(p.id) ?? 0)
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
      })
    })
  }

  it('avoids last round\'s partners across courts when a balanced split exists', () => {
    // Regression: Jane • Rina partnered in rounds 1 and 2 although 22 balanced splits avoided it.
    const ratings = { Amanda: 1400, Jane: 1300, John: 1200, Dimas: 1200, Budi: 1000, Sari: 1400, Rina: 1300, Tono: 1200, Maya: 1200 }
    const players = Object.entries(ratings).map(([id, rating]) => ({ id, rating }))
    const plan = planRounds({ players, courts: 2, history: [], numbers: [1, 2, 3, 4, 5, 6, 7] })
    const avg = ratingOf(players)
    for (let i = 1; i < plan.length; i++) {
      const last = meetingCounts([plan[i - 1]]).partners
      for (const m of plan[i].matches) {
        for (const [a, b] of [m.teamA, m.teamB]) expect(last.has(key(a, b)), `round ${i + 1}: ${a} • ${b}`).toBe(false)
        expect(isFair(expectedScore(avg(m.teamA), avg(m.teamB)))).toBe(true)
      }
    }
  })

  it('mixes the strongest and weakest player as partners in a 4-player round', () => {
    const [m] = pairRound(roster([1500, 1400, 1100, 1000]), [])
    const teams = [m.teamA, m.teamB].map((t) => [...t].sort().join())
    expect(teams.sort()).toEqual(['p1,p4', 'p2,p3'])
  })

  it('re-pairs planned rounds after new ratings while keeping who rests', () => {
    const plan = fullPlan(five, 1)
    const [locked, ...planned] = plan
    const rerated = five.map((p) => (p.id === 'p5' ? { ...p, rating: 1600 } : p))
    const replanned = planRounds({
      players: rerated,
      courts: 1,
      history: [locked],
      numbers: planned.map((r) => r.number),
      resting: planned.map((r) => r.resting),
    })
    expect(replanned.map((r) => r.resting)).toEqual(planned.map((r) => r.resting))
    expect(replanned.map((r) => r.matches)).not.toEqual(planned.map((r) => r.matches))
  })

  it('re-plans everyone, resting included, when a late joiner arrives', () => {
    const [locked] = fullPlan(five, 1)
    const withJoiner = [...five, { id: 'p6', rating: 1200 }, { id: 'p7', rating: 1300 }, { id: 'p8', rating: 1000 }]
    const replanned = planRounds({ players: withJoiner, courts: 2, history: [locked], numbers: [2, 3, 4, 5, 6, 7] })
    for (const round of replanned) checkRound(withJoiner, round, 2)
    expect(replanned.every((r) => r.resting.length === 0)).toBe(true)
  })

  it('uses the greedy fallback above the exhaustive limit', () => {
    const sixteen = roster(Array.from({ length: 16 }, (_, i) => 1000 + i * 30))
    expect(sixteen.length).toBeGreaterThan(config.pairing.exhaustiveMaxPlayers)
    const matches = pairRound(sixteen, [])
    const avg = ratingOf(sixteen)
    expect(matches).toHaveLength(4)
    for (const m of matches) expect(Math.abs(avg(m.teamA) - avg(m.teamB))).toBeLessThanOrEqual(30)
  })
})
