// In-memory stand-in for the Supabase `points` table and its realtime channel until the backend step.
// One row per live tap; undo deletes the last row. Listeners get the full tap list after each change.
import type { Side } from '../logic/tennis'
import { markLive } from './game'

type PointRow = { matchId: string; team: Side; seq: number; createdAt: string }

const rows = new Map<string, PointRow[]>()
const listeners = new Map<string, Set<(taps: Side[]) => void>>()

const tapsOf = (matchId: string) => (rows.get(matchId) ?? []).map((r) => r.team)

function publish(matchId: string) {
  for (const listener of listeners.get(matchId) ?? []) listener(tapsOf(matchId))
}

export async function getTaps(matchId: string): Promise<Side[]> {
  return tapsOf(matchId)
}

export async function addPoint(matchId: string, team: Side): Promise<void> {
  const list = rows.get(matchId) ?? []
  list.push({ matchId, team, seq: list.length + 1, createdAt: new Date().toISOString() })
  rows.set(matchId, list)
  markLive(matchId)
  publish(matchId)
}

export async function undoPoint(matchId: string): Promise<void> {
  rows.get(matchId)?.pop()
  publish(matchId)
}

/** Calls `listener` with every change to the match's taps; returns the unsubscribe. */
export function subscribeTaps(matchId: string, listener: (taps: Side[]) => void): () => void {
  const set = listeners.get(matchId) ?? new Set()
  set.add(listener)
  listeners.set(matchId, set)
  return () => set.delete(listener)
}
