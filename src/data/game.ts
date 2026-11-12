import { config } from '../config'
import type { MatchRecord, RoundRecord } from '../logic/session'
import type { Survey } from '../logic/survey'
import { getSession, type Session } from './sessions'
import { act, GameError, must, supabase, userId } from './supabase'

export type { MatchRecord, RoundRecord }
export { GameError }

export type PlayerView = { id: string; name: string; surveyDone: boolean }

/** Present only when `ratingVisibility` lets this player see ratings (see the game function). */
export type RatingsView = {
  players: Map<string, { rating: number; matchesRated: number; surveyPoints: number | null }>
  /** Test mode only: per done match, ratings going in and each player's change. */
  changes: Map<string, { before: Map<string, number>; deltas: Map<string, number> }>
}

export type GameView = {
  session: Session
  /** Visible to members only (row-level security), in join order. */
  players: PlayerView[]
  rounds: RoundRecord[]
  /** `id` is null until this browser's user has joined the session. */
  me: { id: string | null; isHost: boolean; surveyDone: boolean }
  ratings: RatingsView | null
}

type RatingsResponse =
  | { visible: false }
  | {
      visible: true
      players: { id: string; rating: number; matchesRated: number; surveyPoints: number | null }[]
      matches: { matchId: string; before: Record<string, number>; deltas: Record<string, number> }[]
    }

export async function getGame(code: string): Promise<GameView> {
  const uid = await userId()
  const session = await getSession(code)
  if (!session) throw new GameError('This link does not match a session. Ask the host for a new link.')

  // Ratings only matter once rounds exist, and come from the (slower) game function, so they
  // load alongside the tables instead of after them. A refusal (not a member yet) just means none.
  const isHost = session.hostUserId === uid
  const ratingsWanted =
    session.status !== 'open' && (config.ratingVisibility === 'test' || (config.ratingVisibility === 'host' && isHost))
  const ratings = ratingsWanted ? getRatings(code).catch(() => null) : Promise.resolve(null)

  const [playerRows, roundRows, matchRows] = await Promise.all([
    supabase.from('players').select('id, user_id, name, survey_done').eq('session_id', session.id).is('left_at', null).order('joined_at').order('id'),
    supabase.from('rounds').select('id, number, state, resting').eq('session_id', session.id).order('number'),
    supabase.from('matches').select('id, round_id, court, team_a, team_b, games_a, games_b, status').eq('session_id', session.id).order('court'),
  ])
  const players = must(playerRows) as { id: string; user_id: string; name: string; survey_done: boolean }[]
  const rounds = must(roundRows) as { id: string; number: number; state: RoundRecord['state']; resting: string[] }[]
  const matches = must(matchRows) as {
    id: string
    round_id: string
    court: number
    team_a: [string, string]
    team_b: [string, string]
    games_a: number | null
    games_b: number | null
    status: MatchRecord['status']
  }[]

  const mine = players.find((p) => p.user_id === uid)

  return {
    session,
    players: players.map((p) => ({ id: p.id, name: p.name, surveyDone: p.survey_done })),
    rounds: rounds.map((r) => ({
      number: r.number,
      state: r.state,
      resting: r.resting,
      matches: matches
        .filter((m) => m.round_id === r.id)
        .map((m) => ({
          id: m.id,
          court: m.court,
          teamA: m.team_a,
          teamB: m.team_b,
          gamesA: m.games_a,
          gamesB: m.games_b,
          status: m.status,
        })),
    })),
    me: { id: mine?.id ?? null, isHost, surveyDone: Boolean(mine?.survey_done) },
    ratings: mine || isHost ? await ratings : null,
  }
}

async function getRatings(code: string): Promise<RatingsView | null> {
  const response = await act<RatingsResponse>({ action: 'ratings', code })
  if (!response.visible) return null
  return {
    players: new Map(response.players.map(({ id, ...rest }) => [id, rest])),
    changes: new Map(
      response.matches.map((m) => [
        m.matchId,
        { before: new Map(Object.entries(m.before)), deltas: new Map(Object.entries(m.deltas)) },
      ]),
    ),
  }
}

/** Joins by name. Refusals (name taken, session finished) arrive as a GameError to show as is. */
export const joinSession = (code: string, name: string) => act({ action: 'join', code, name })
export const saveSurvey = (code: string, survey: Survey) => act({ action: 'survey', code, survey })
/** Host only: plans every round for everyone who has joined. */
export const startGame = (code: string) => act({ action: 'start', code })
export const saveScore = (code: string, matchId: string, gamesA: number, gamesB: number) =>
  act({ action: 'score', code, matchId, gamesA, gamesB })
export const finishSession = (code: string) => act({ action: 'finish', code })
