// Every game action that changes the plan or touches ratings runs here, never in the browser:
// join, survey, start, score, finish, and reading ratings when the visibility level allows it.
// The rules themselves are the app's own (src/logic); this file only loads, checks and saves.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { config } from '../../../src/config.ts'
import {
  addPlayer,
  ratingsOf,
  saveScore,
  setStartRating,
  startSession,
  type RoundRecord,
  type SessionState,
} from '../../../src/logic/session.ts'
import { startingRating, surveyPoints, type Survey } from '../../../src/logic/survey.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** A refusal the player should read, as opposed to a server fault. */
class Refusal extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

const FINISHED = 'This session has finished. Ask the host for a new link.'
const NAME_TAKEN = 'Someone here already uses that name. Add an initial, like Amanda K.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const { data } = await admin.auth.getUser(token)
    if (!data.user) throw new Refusal('Please open the link again to sign in.', 401)
    const result = await handle(data.user.id, await req.json())
    return json(result ?? { ok: true })
  } catch (error) {
    if (error instanceof Refusal) return json({ error: error.message }, error.status)
    console.error(error)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Body =
  | { action: 'join'; code: string; name: string }
  | { action: 'survey'; code: string; survey: Survey }
  | { action: 'start'; code: string }
  | { action: 'score'; code: string; matchId: string; gamesA: number; gamesB: number }
  | { action: 'finish'; code: string }
  | { action: 'ratings'; code: string }

async function handle(userId: string, body: Body) {
  const session = await sessionByCode(body.code)
  const isHost = session.host_user_id === userId
  const me = await playerOf(session.id, userId)

  switch (body.action) {
    case 'join': {
      if (session.status === 'finished') throw new Refusal(FINISHED)
      const name = String(body.name ?? '').trim()
      if (name.length < 1 || name.length > 30) throw new Refusal('Use a name of 1 to 30 characters.')
      const playerId = me?.id ?? (await insertPlayer(session.id, userId, name))
      // Joining during play puts them into whatever hasn't started yet (safe to repeat).
      return plan(session.id, (state) => ({ state: includePlayer(state, playerId) }))
    }

    case 'survey': {
      if (!me) throw new Refusal('Join the session before answering the survey.')
      const survey = validSurvey(body.survey)
      const rating = startingRating(survey)
      await ok(admin.from('player_secrets').update({ survey, start_rating: rating }).eq('player_id', me.id))
      await ok(admin.from('players').update({ survey_done: true }).eq('id', me.id))
      return plan(session.id, (state) => ({ state: state.rounds.length ? setStartRating(state, me.id, rating, newId) : state }))
    }

    case 'start': {
      if (!isHost) throw new Refusal('Only the host can start the game.', 403)
      return plan(session.id, (state, status) =>
        status === 'open' ? { state: startSession(state, newId), status: 'playing' } : { state },
      )
    }

    case 'score': {
      if (!isHost && !me) throw new Refusal('Join the session to enter scores.', 403)
      return plan(session.id, (state, status) => {
        if (status !== 'playing') throw new Refusal(status === 'finished' ? FINISHED : 'The game has not started yet.')
        const match = state.rounds.flatMap((r) => r.matches).find((m) => m.id === body.matchId)
        // Players score their own court; the host can fix any score.
        if (!isHost && !(match && [...match.teamA, ...match.teamB].includes(me!.id))) {
          throw new Refusal('You can only enter scores for your own court.', 403)
        }
        return { state: saveScore(state, body.matchId, Number(body.gamesA), Number(body.gamesB), newId) }
      })
    }

    case 'finish': {
      if (!isHost) throw new Refusal('Only the host can finish the session.', 403)
      return plan(session.id, (state) => ({ state, status: 'finished' }))
    }

    case 'ratings':
      return ratings(session.id, isHost, Boolean(me))

    default:
      throw new Refusal('Unknown action.')
  }
}

type SessionRow = { id: string; host_user_id: string; status: string; version: number; courts: number; minutes: number }

async function sessionByCode(code: string): Promise<SessionRow> {
  const { data } = await admin
    .from('sessions')
    .select('id, host_user_id, status, version, courts, minutes')
    .eq('code', String(code ?? ''))
    .maybeSingle()
  if (!data) throw new Refusal('This link does not match a session. Ask the host for a new link.', 404)
  return data
}

async function playerOf(sessionId: string, userId: string): Promise<{ id: string } | null> {
  const { data } = await admin
    .from('players')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()
  return data
}

async function insertPlayer(sessionId: string, userId: string, name: string): Promise<string> {
  const { data, error } = await admin
    .from('players')
    .insert({ session_id: sessionId, user_id: userId, name })
    .select('id')
    .single()
  if (error?.code === '23505') throw new Refusal(NAME_TAKEN)
  if (error) throw error
  // Everyone starts at the base rating until they answer the survey.
  const base = config.rating.base
  await ok(admin.from('player_secrets').insert({ player_id: data.id, session_id: sessionId, start_rating: base, rating: base }))
  return data.id
}

/** A player already in the plan stays as they are; one missing from it joins late. */
function includePlayer(state: SessionState, playerId: string): SessionState {
  if (!state.rounds.length) return state
  const planned = state.rounds.some(
    (r) => r.resting.includes(playerId) || r.matches.some((m) => [...m.teamA, ...m.teamB].includes(playerId)),
  )
  if (planned) return state
  const player = state.players.find((p) => p.id === playerId)!
  return addPlayer({ ...state, players: state.players.filter((p) => p.id !== playerId) }, player, newId)
}

function validSurvey(survey: Survey): Survey {
  const ok =
    survey &&
    Object.hasOwn(config.survey.lastPlayed, survey.lastPlayed) &&
    Object.hasOwn(config.survey.serve, survey.serve) &&
    Object.hasOwn(config.survey.ret, survey.ret)
  if (!ok) throw new Refusal('Please answer all three questions.')
  return { lastPlayed: survey.lastPlayed, serve: survey.serve, ret: survey.ret }
}

const newId = () => crypto.randomUUID()

/**
 * Loads the session as one state, applies a change and saves it with apply_plan.
 * If anything else was saved in between, the version no longer matches: reload and try again.
 */
async function plan(
  sessionId: string,
  change: (state: SessionState, status: string) => { state: SessionState; status?: string },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, status, version } = await loadState(sessionId)
    let next: { state: SessionState; status?: string }
    try {
      next = change(state, status)
    } catch (error) {
      // Rule violations from src/logic (bad score, too few players...) are for the player to read.
      if (error instanceof Refusal || !(error instanceof Error)) throw error
      throw new Refusal(error.message)
    }
    const { players } = ratingsOf(next.state)
    const { data: saved, error } = await admin.rpc('apply_plan', {
      p_session: sessionId,
      expected_version: version,
      p_status: next.status ?? status,
      p_rounds: next.state.rounds,
      p_ratings: [...players.values()].map((p) => ({ id: p.id, rating: p.rating, matchesRated: p.matchesRated })),
    })
    if (error) throw error
    if (saved) return
  }
  throw new Refusal('A lot is happening at once. Please try again.', 409)
}

async function loadState(sessionId: string): Promise<{ state: SessionState; status: string; version: number }> {
  const session = await must<{ status: string; version: number; courts: number; minutes: number }>(
    admin.from('sessions').select('status, version, courts, minutes').eq('id', sessionId).single(),
  )
  const [players, secrets, rounds, matches] = await Promise.all([
    must(admin.from('players').select('id').eq('session_id', sessionId).is('left_at', null).order('joined_at').order('id')),
    must(admin.from('player_secrets').select('player_id, start_rating').eq('session_id', sessionId)),
    must(admin.from('rounds').select('id, number, state, resting').eq('session_id', sessionId).order('number')),
    must(admin.from('matches').select('id, round_id, court, team_a, team_b, games_a, games_b, status').eq('session_id', sessionId).order('court')),
  ])
  const startRating = new Map(secrets.map((s) => [s.player_id, Number(s.start_rating)]))
  const state: SessionState = {
    courts: session.courts,
    minutes: session.minutes,
    players: players.map((p) => ({ id: p.id, startRating: startRating.get(p.id) ?? config.rating.base })),
    rounds: rounds.map(
      (r): RoundRecord => ({
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
      }),
    ),
  }
  return { state, status: session.status, version: session.version }
}

/**
 * Ratings by `ratingVisibility`: nobody when hidden, the host only with 'host', everyone in
 * the session with 'test' (plus survey points and each match's rating change).
 */
async function ratings(sessionId: string, isHost: boolean, isMember: boolean) {
  const level = config.ratingVisibility as 'hidden' | 'host' | 'test'
  if (!isMember && !isHost) throw new Refusal('Join the session first.', 403)
  if (level === 'hidden' || (level === 'host' && !isHost)) return { visible: false }

  const { state } = await loadState(sessionId)
  const surveys = await must(admin.from('player_secrets').select('player_id, survey').eq('session_id', sessionId))
  const points = new Map(surveys.map((s) => [s.player_id, s.survey ? surveyPoints(s.survey) : 0]))
  const { players, perMatch } = ratingsOf(state)
  return {
    visible: true,
    players: [...players.values()].map((p) => ({
      id: p.id,
      rating: p.rating,
      matchesRated: p.matchesRated,
      surveyPoints: level === 'test' ? (points.get(p.id) ?? 0) : null,
    })),
    matches: level === 'test'
      ? [...perMatch].map(([matchId, change]) => ({
          matchId,
          before: Object.fromEntries(change.before),
          deltas: Object.fromEntries(change.deltas),
        }))
      : [],
  }
}

/** Runs a Supabase write (which returns no rows), throwing its error. */
async function ok(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query
  if (error) throw error
}

/** Unwraps a Supabase read, throwing its error (or a missing row). */
async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await query
  if (error) throw error
  if (data == null) throw new Error('Expected a row but found none.')
  return data
}
