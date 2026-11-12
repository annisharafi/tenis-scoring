import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')

export const supabase = createClient(url, key)

let signingIn: Promise<string> | undefined

/**
 * This browser's user id. Guests sign in anonymously, so typing only a name still gives them an
 * id; it stays in the browser, which is how they are recognised when they open the link again.
 */
export function userId(): Promise<string> {
  signingIn ??= (async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session.user.id
    const { data: signedIn, error } = await supabase.auth.signInAnonymously()
    if (error || !signedIn.user) {
      signingIn = undefined
      throw error ?? new Error('Could not sign in.')
    }
    return signedIn.user.id
  })()
  return signingIn
}

/** A refusal from the game server (name taken, session finished...) worth showing as it is. */
export class GameError extends Error {}

/** Runs a game action on the server (supabase/functions/game). */
export async function act<T = unknown>(body: Record<string, unknown>): Promise<T> {
  await userId()
  const { data, error } = await supabase.functions.invoke<T>('game', { body })
  if (error) {
    const message = await (error.context as Response | undefined)
      ?.json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined)
    throw new GameError(message ?? 'Something went wrong. Please try again.')
  }
  return data as T
}

/** Unwraps a query result, throwing its error. */
export function must<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error
  return data as T
}
