// In-memory stand-in for the Supabase `sessions` table until the backend step.

import type { GameSystem } from '../logic/tennis'
import { currentUserId } from './auth'

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
  createdAt: string
}

export type NewSession = Pick<Session, 'name' | 'courts' | 'minutes' | 'gameSystem'>

const sessions = new Map<string, Session>()

// No 0/o, 1/l/i, so codes read aloud and type cleanly.
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Short readable session code such as `fun-4k7q`. */
export function newSessionCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `fun-${Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('')}`
}

export async function createSession(input: NewSession): Promise<Session> {
  let code = newSessionCode()
  while (sessions.has(code)) code = newSessionCode()
  return createSessionRecord(code, input, currentUserId())
}

/** Stores a session under a given code (mock only: also used for sample sessions). */
export function createSessionRecord(code: string, input: NewSession, hostUserId: string): Session {
  const session: Session = {
    ...input,
    id: crypto.randomUUID(),
    code,
    status: 'open',
    hostUserId,
    createdAt: new Date().toISOString(),
  }
  sessions.set(code, session)
  return session
}

export async function getSession(code: string): Promise<Session | undefined> {
  return sessions.get(code)
}
