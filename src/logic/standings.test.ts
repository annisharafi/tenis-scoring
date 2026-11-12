import { describe, expect, it } from 'vitest'
import { standings } from './standings'

const players = ['Amanda', 'Jane', 'John', 'Dimas', 'Budi'].map((name) => ({ id: name, name }))

describe('standings', () => {
  it('counts wins, losses, ties and games, sorted by wins then games', () => {
    const rows = standings(players, [
      { id: 'm1', teamA: ['Amanda', 'Jane'], teamB: ['John', 'Dimas'], gamesA: 4, gamesB: 2 },
      { id: 'm2', teamA: ['Amanda', 'Budi'], teamB: ['Jane', 'John'], gamesA: 3, gamesB: 3 },
      { id: 'm3', teamA: ['Jane', 'Budi'], teamB: ['Dimas', 'Amanda'], gamesA: 5, gamesB: 1 },
    ])
    expect(rows.map((r) => [r.name, r.won, r.lost, r.tied, r.games])).toEqual([
      ['Jane', 2, 0, 1, 12],
      // Equal wins and games: name decides.
      ['Amanda', 1, 1, 1, 8],
      ['Budi', 1, 0, 1, 8],
      ['John', 0, 1, 1, 5],
      ['Dimas', 0, 2, 0, 3],
    ])
  })

  it('lists players without a match yet at the bottom', () => {
    const rows = standings(players, [{ id: 'm1', teamA: ['Amanda', 'Jane'], teamB: ['John', 'Dimas'], gamesA: 1, gamesB: 5 }])
    expect(rows.at(-1)).toMatchObject({ name: 'Budi', won: 0, lost: 0, tied: 0, games: 0 })
  })
})
