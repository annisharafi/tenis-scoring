import type { GameSystem } from '../logic/tennis'
import { must, supabase, userId } from './supabase'

export type { GameSystem }
export type SessionStatus = 'open' | 'playing' | 'finished'

export type Session = {
  id: string
  code: string
  name: string
  courts: number
  minutes: number
  gameSystem: GameSystem
  status: SessionStatus
  hostUserId: string
}

export type NewSession = Pick<Session, 'name' | 'courts' | 'minutes' | 'gameSystem'>

type SessionRow = {
  id: string
  code: string
  name: string
  courts: number
  minutes: number
  game_system: GameSystem
  status: SessionStatus
  host_user_id: string
}

const COLUMNS = 'id, code, name, courts, minutes, game_system, status, host_user_id'

const fromRow = (r: SessionRow): Session => ({
  id: r.id,
  code: r.code,
  name: r.name,
  courts: r.courts,
  minutes: r.minutes,
  gameSystem: r.game_system,
  status: r.status,
  hostUserId: r.host_user_id,
})

// No 0/o, 1/l/i, so codes read aloud and type cleanly.
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Short readable session code such as `fun-4k7q`. */
export function newSessionCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `fun-${Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`
}

/** Creates the session with this browser's user as host; a code already taken is simply redrawn. */
export async function createSession(input: NewSession): Promise<Session> {
  const host = await userId()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        code: newSessionCode(),
        name: input.name,
        courts: input.courts,
        minutes: input.minutes,
        game_system: input.gameSystem,
        host_user_id: host,
      })
      .select(COLUMNS)
      .single<SessionRow>()
    if (error?.code === '23505') continue
    return fromRow(must({ data, error }))
  }
  throw new Error('Could not create a session code. Please try again.')
}

export async function getSession(code: string): Promise<Session | null> {
  await userId()
  const row = must(await supabase.from('sessions').select(COLUMNS).eq('code', code).maybeSingle<SessionRow>())
  return row && fromRow(row)
}
