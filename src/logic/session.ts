// The rules of a session from start to finish, as pure functions over its state.
// The server runs these for every action, so the app and the server always agree on the plan.
// Imports carry .ts extensions so the server (Deno) can load these files as they are.
import { config } from '../config.ts'
import type { Match, Round } from './pairing.ts'
import { replayRatings, type ScoredMatch } from './rating.ts'
import { planRounds, roundCount } from './schedule.ts'

export type RoundState = 'locked' | 'planned' | 'done'
export type MatchStatus = 'planned' | 'live' | 'done'

export type MatchRecord = Match & { id: string; gamesA: number | null; gamesB: number | null; status: MatchStatus }
export type RoundRecord = { number: number; state: RoundState; resting: string[]; matches: MatchRecord[] }

/** A player as the plan sees them: their rating before any match (survey, or base until answered). */
export type PlanPlayer = { id: string; startRating: number }

export type SessionState = {
  courts: number
  minutes: number
  /** In join order, which breaks ties for who rests. */
  players: PlanPlayer[]
  /** Empty until the host starts the game. */
  rounds: RoundRecord[]
}

/** New match ids come from the caller (database uuids on the server, counters in tests). */
export type NewId = () => string

export const MIN_PLAYERS = 4 // one court of doubles

/** Why a final games score can't be saved, or null when it can. */
export function scoreError(gamesA: number, gamesB: number): string | null {
  const { gamesPerMatch } = config.schedule
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= gamesPerMatch
  if (!valid(gamesA) || !valid(gamesB)) return `Scores run from 0 to ${gamesPerMatch} games.`
  if (gamesA + gamesB > gamesPerMatch) return `A match has ${gamesPerMatch} games in total.`
  if (gamesA + gamesB === 0) return 'Enter at least one game.'
  return null
}

export function scoredMatches(rounds: readonly RoundRecord[]): ScoredMatch[] {
  return rounds.flatMap((r) =>
    r.matches.flatMap((m) =>
      m.status === 'done' ? [{ id: m.id, teamA: m.teamA, teamB: m.teamB, gamesA: m.gamesA!, gamesB: m.gamesB! }] : [],
    ),
  )
}

/** Current ratings from everyone's starting rating plus every saved score, in play order. */
export function ratingsOf(state: SessionState) {
  return replayRatings(
    state.players.map((p) => ({ id: p.id, rating: p.startRating })),
    scoredMatches(state.rounds),
  )
}

/** The host starts: every round is planned from the players there now, and round 1 is current. */
export function startSession(state: SessionState, newId: NewId): SessionState {
  if (state.rounds.length) throw new Error('This game has already started.')
  if (state.players.length < MIN_PLAYERS) throw new Error(`At least ${MIN_PLAYERS} players are needed to start.`)
  return locked(replan(state, newId, { keepResting: false }))
}

/** Someone joins. Once playing, a round already under way goes on without them; the rest is planned again. */
export function addPlayer(state: SessionState, player: PlanPlayer, newId: NewId): SessionState {
  const next = { ...state, players: [...state.players, player] }
  if (!next.rounds.length) return next
  const reopened = reopenUnstarted(next)
  const rounds = reopened.rounds.map((r) => (r.state === 'locked' ? { ...r, resting: [...r.resting, player.id] } : r))
  return locked(replan({ ...reopened, rounds }, newId, { keepResting: false }))
}

/** A player answered the survey: their starting rating changes, so whatever hasn't started is planned again. */
export function setStartRating(state: SessionState, playerId: string, rating: number, newId: NewId): SessionState {
  const next = { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, startRating: rating } : p)) }
  if (!next.rounds.length) return next
  return locked(replan(reopenUnstarted(next), newId, { keepResting: false }))
}

/** The first live point marks a match as started, so its round stops changing. */
export function markLive(state: SessionState, matchId: string): SessionState {
  return mapMatch(state, matchId, (m) => (m.status === 'planned' ? { ...m, status: 'live' } : m))
}

/**
 * Saves a final games score. A round is done once all its courts are, and the next one becomes
 * current. Planned rounds are re-paired with the new ratings; who rests in them stays fixed.
 * Done rounds can be corrected: ratings are replayed, so the change carries through.
 */
export function saveScore(state: SessionState, matchId: string, gamesA: number, gamesB: number, newId: NewId): SessionState {
  const error = scoreError(gamesA, gamesB)
  if (error) throw new Error(error)
  const round = state.rounds.find((r) => r.matches.some((m) => m.id === matchId))
  if (!round) throw new Error('That match is not in this game.')
  if (round.state === 'planned') throw new Error('This match cannot be scored yet.')
  return replan({ ...state, rounds: recordScore(state.rounds, matchId, gamesA, gamesB) }, newId, { keepResting: true })
}

/**
 * The score itself, without re-pairing: the match is done, and once every court in the current
 * round is done the next round becomes current. The app applies this the moment a score is
 * entered, so the active round moves on before the server's re-plan arrives.
 */
export function recordScore(rounds: readonly RoundRecord[], matchId: string, gamesA: number, gamesB: number): RoundRecord[] {
  const scored = rounds.map((r) =>
    r.matches.some((m) => m.id === matchId)
      ? { ...r, matches: r.matches.map((m) => (m.id === matchId ? { ...m, gamesA, gamesB, status: 'done' as const } : m)) }
      : r,
  )
  const finished = scored.map((r) =>
    r.state === 'locked' && r.matches.every((m) => m.status === 'done') ? { ...r, state: 'done' as const } : r,
  )
  return lockNext(finished)
}

function mapMatch(state: SessionState, matchId: string, f: (m: MatchRecord) => MatchRecord): SessionState {
  return {
    ...state,
    rounds: state.rounds.map((r) =>
      r.matches.some((m) => m.id === matchId) ? { ...r, matches: r.matches.map((m) => (m.id === matchId ? f(m) : m)) } : r,
    ),
  }
}

/** Until a match in the current round has started, that round can still change like a planned one. */
function reopenUnstarted(state: SessionState): SessionState {
  return {
    ...state,
    rounds: state.rounds.map((r) =>
      r.state === 'locked' && r.matches.every((m) => m.status === 'planned') ? { ...r, state: 'planned' } : r,
    ),
  }
}

/** The first round not yet played becomes the current one. */
function lockNext(rounds: RoundRecord[]): RoundRecord[] {
  if (rounds.some((r) => r.state === 'locked')) return rounds
  const next = rounds.find((r) => r.state === 'planned')
  return next ? rounds.map((r) => (r === next ? { ...r, state: 'locked' } : r)) : rounds
}

const locked = (state: SessionState): SessionState => ({ ...state, rounds: lockNext(state.rounds) })

/** Re-pairs every planned round (or plans all of them before the start) with current ratings. */
function replan(state: SessionState, newId: NewId, { keepResting }: { keepResting: boolean }): SessionState {
  const fixed = state.rounds.filter((r) => r.state !== 'planned')
  const planned = state.rounds.filter((r) => r.state === 'planned')
  const numbers = state.rounds.length
    ? planned.map((r) => r.number)
    : Array.from({ length: roundCount(state.minutes) }, (_, i) => i + 1)
  if (!numbers.length) return state
  const { players } = ratingsOf(state)
  const rounds: Round[] = planRounds({
    players: state.players.map((p) => ({ id: p.id, rating: players.get(p.id)!.rating })),
    courts: state.courts,
    history: fixed,
    numbers,
    resting: keepResting ? planned.map((r) => r.resting) : undefined,
  })
  const replanned: RoundRecord[] = rounds.map((r) => ({
    ...r,
    state: 'planned',
    matches: r.matches.map((m) => ({ ...m, id: newId(), gamesA: null, gamesB: null, status: 'planned' })),
  }))
  return { ...state, rounds: [...fixed, ...replanned] }
}
