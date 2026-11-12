// In-memory stand-in for the Supabase players/rounds/matches tables until the backend step.
// It runs the same logic the backend will: replay ratings, then re-pair planned rounds.
import { config } from '../config'
import { replayRatings } from '../logic/rating'
import type { Match, Round } from '../logic/pairing'
import { planRounds, roundCount } from '../logic/schedule'
import { startingRating, surveyPoints, type Survey } from '../logic/survey'
import { currentUserId } from './auth'
import { createSessionRecord, getSession, type Session } from './sessions'

export type RoundState = 'locked' | 'planned' | 'done'
export type MatchStatus = 'planned' | 'live' | 'done'

export type MatchRecord = Match & { id: string; gamesA: number | null; gamesB: number | null; status: MatchStatus }
export type RoundRecord = { number: number; state: RoundState; resting: string[]; matches: MatchRecord[] }

export type PlayerView = {
  id: string
  name: string
  rating: number
  surveyPoints: number
  matchesRated: number
}

export type GameView = {
  session: Session
  players: PlayerView[]
  rounds: RoundRecord[]
  /** `id` is null until this browser's user has joined the session. */
  me: { id: string | null; isHost: boolean; surveyDone: boolean }
  /** Per done match: ratings going in and each player's change. */
  ratingChanges: Map<string, { before: Map<string, number>; deltas: Map<string, number> }>
}

// `survey` is missing until the player answers it; until then they start at the base rating.
type StoredPlayer = { id: string; userId: string | null; name: string; survey?: Survey }
type Game = { players: StoredPlayer[]; rounds: RoundRecord[] }

const games = new Map<string, Game>()

const NAMES = 'Amanda Jane John Dimas Budi Sari Rina Tono Maya Eko Lina Agus Dewi Fajar Putri Rudi Wati Yoga Nina Bayu Tari Hadi Intan Joko'
const ANSWERS: Survey[] = [
  { lastPlayed: 'thisWeek', serve: 'powerOrPlacement', ret: 'usuallyBack' },
  { lastPlayed: 'lastWeek', serve: 'usuallyIn', ret: 'usuallyBack' },
  { lastPlayed: 'longAgo', serve: 'usuallyIn', ret: 'usuallyBack' },
  { lastPlayed: 'thisWeek', serve: 'usuallyIn', ret: 'oftenMiss' },
  { lastPlayed: 'never', serve: 'doubleFault', ret: 'oftenMiss' },
]

let nextId = 1
const newId = (prefix: string) => `${prefix}${nextId++}`

/**
 * Fills a roster of fake players, enough for every court, so this browser's user can join as one more.
 * Sessions created here belong to this browser's user and wait in the lobby for them to start.
 * Sample sessions belong to a fake host (the first player) and are already playing, so their link
 * shows the guest's join card and then the game.
 */
function seed(session: Session, sample: boolean): Game {
  const players: StoredPlayer[] = NAMES.split(' ')
    .slice(0, session.courts * 4)
    .map((name, i) => ({
      id: newId('p'),
      userId: sample && i === 0 ? session.hostUserId : null,
      name,
      survey: ANSWERS[i % ANSWERS.length],
    }))
  const game: Game = { players, rounds: [] }
  if (sample) begin(game, session)
  return game
}

/** Plans every round from the roster as it is now and makes round 1 the current one. */
function begin(game: Game, session: Session) {
  replan(game, session, { keepResting: false })
  lockNext(game)
  session.status = 'playing'
}

/** Once playing, a roster or rating change re-plans what hasn't started; in the lobby there is no plan yet. */
function replanForRoster(game: Game, session: Session) {
  if (session.status !== 'playing') return
  reopenUnstarted(game)
  replan(game, session, { keepResting: false })
  lockNext(game)
}

/** Until a match in the current round has started, that round can still change like a planned one. */
function reopenUnstarted(game: Game) {
  const current = game.rounds.find((r) => r.state === 'locked')
  if (current?.matches.every((m) => m.status === 'planned')) current.state = 'planned'
}

/** The first round not yet played becomes the current one. */
function lockNext(game: Game) {
  if (game.rounds.some((r) => r.state === 'locked')) return
  const next = game.rounds.find((r) => r.state === 'planned')
  if (next) next.state = 'locked'
}

const ratingOf = (p: StoredPlayer) => (p.survey ? startingRating(p.survey) : config.rating.base)

/**
 * Re-pairs every planned round with current ratings. After a score, who rests stays fixed;
 * after someone joins or answers the survey, resting is planned again too.
 */
function replan(game: Game, session: Session, { keepResting }: { keepResting: boolean }) {
  const fixed = game.rounds.filter((r) => r.state !== 'planned')
  const planned = game.rounds.filter((r) => r.state === 'planned')
  const numbers = game.rounds.length
    ? planned.map((r) => r.number)
    : Array.from({ length: roundCount(session.minutes) }, (_, i) => i + 1)
  if (!numbers.length) return
  const { players } = rate(game)
  const replanned = toRecords(
    planRounds({
      players: game.players.map((p) => ({ id: p.id, rating: players.get(p.id)!.rating })),
      courts: session.courts,
      history: fixed,
      numbers,
      resting: keepResting ? planned.map((r) => r.resting) : undefined,
    }),
  )
  game.rounds = [...fixed, ...replanned]
}

function toRecords(rounds: Round[]): RoundRecord[] {
  return rounds.map((r) => ({
    ...r,
    state: 'planned',
    matches: r.matches.map((m) => ({ ...m, id: newId('m'), gamesA: null, gamesB: null, status: 'planned' })),
  }))
}

function doneMatches(game: Game) {
  return game.rounds.flatMap((r) =>
    r.matches.flatMap((m) =>
      m.status === 'done' ? [{ id: m.id, teamA: m.teamA, teamB: m.teamB, gamesA: m.gamesA!, gamesB: m.gamesB! }] : [],
    ),
  )
}

function rate(game: Game) {
  return replayRatings(
    game.players.map((p) => ({ id: p.id, rating: ratingOf(p) })),
    doneMatches(game),
  )
}

const loads = new Map<string, Promise<{ session: Session; game: Game }>>()

/** Loads a session and its game once; screens loading at the same time share that one load. */
function load(code: string): Promise<{ session: Session; game: Game }> {
  let loading = loads.get(code)
  if (!loading) {
    loading = firstLoad(code)
    loads.set(code, loading)
  }
  return loading
}

async function firstLoad(code: string): Promise<{ session: Session; game: Game }> {
  // Links opened without creating a session here (or after a reload) get a sample one.
  let session = await getSession(code)
  const sample = !session
  session ??= createSessionRecord(
    code,
    { name: 'Fun Fun Tennis', courts: 1, minutes: 120, gameSystem: 'sudden' },
    'sample-host',
  )
  const game = seed(session, sample)
  games.set(code, game)
  return { session, game }
}

function view(session: Session, game: Game): GameView {
  const { players, perMatch } = rate(game)
  const userId = currentUserId()
  const mine = game.players.find((p) => p.userId === userId)
  return {
    session,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      rating: players.get(p.id)!.rating,
      matchesRated: players.get(p.id)!.matchesRated,
      surveyPoints: p.survey ? surveyPoints(p.survey) : 0,
    })),
    rounds: structuredClone(game.rounds),
    me: { id: mine?.id ?? null, isHost: session.hostUserId === userId, surveyDone: Boolean(mine?.survey) },
    ratingChanges: perMatch,
  }
}

export async function getGame(code: string): Promise<GameView> {
  const { session, game } = await load(code)
  return view(session, game)
}

/**
 * Saves a final games score, rates it, and re-pairs every planned round with the new ratings.
 * Who rests in planned rounds stays fixed. A round is done once all its courts are.
 */
export async function saveScore(code: string, matchId: string, gamesA: number, gamesB: number): Promise<GameView> {
  const { session, game } = await load(code)
  const round = game.rounds.find((r) => r.matches.some((m) => m.id === matchId))
  const match = round?.matches.find((m) => m.id === matchId)
  if (!round || !match || round.state === 'planned') throw new Error('This match cannot be scored yet.')
  Object.assign(match, { gamesA, gamesB, status: 'done' })

  if (round.state === 'locked' && round.matches.every((m) => m.status === 'done')) {
    round.state = 'done'
    lockNext(game)
  }

  replan(game, session, { keepResting: true })
  return view(session, game)
}

export class JoinError extends Error {}

/**
 * Adds this browser's user to the session by name; once playing, the remaining rounds are planned again.
 * Names are unique per session, ignoring case and spaces at the ends.
 */
export async function joinSession(code: string, name: string): Promise<void> {
  const { session, game } = await load(code)
  if (session.status === 'finished') throw new JoinError('This session has finished. Ask the host for a new link.')
  const trimmed = name.trim()
  if (game.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new JoinError('Someone here already uses that name. Add an initial, like Amanda K.')
  }
  const player: StoredPlayer = { id: newId('p'), userId: currentUserId(), name: trimmed }
  game.players.push(player)
  if (session.status === 'playing') {
    reopenUnstarted(game)
    // A round already under way goes on without them.
    game.rounds.find((r) => r.state === 'locked')?.resting.push(player.id)
  }
  replanForRoster(game, session)
}

/** Saves this player's answers; their starting rating changes, so the remaining rounds are planned again. */
export async function saveSurvey(code: string, survey: Survey): Promise<void> {
  const { session, game } = await load(code)
  const me = game.players.find((p) => p.userId === currentUserId())
  if (!me) throw new Error('Join the session before answering the survey.')
  me.survey = survey
  replanForRoster(game, session)
}

/** The host starts the session from the lobby: rounds are planned for everyone who has joined. */
export async function startGame(code: string): Promise<void> {
  const { session, game } = await load(code)
  if (session.hostUserId !== currentUserId()) throw new Error('Only the host can start the game.')
  if (session.status === 'open') begin(game, session)
}

/** The first live tap marks a match as started, so the current round stops changing. */
export function markLive(matchId: string) {
  for (const game of games.values()) {
    const match = game.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId)
    if (match?.status === 'planned') match.status = 'live'
  }
}

export async function finishSession(code: string): Promise<void> {
  const { session } = await load(code)
  session.status = 'finished'
}
