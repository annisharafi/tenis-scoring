// Live points: one row per tap, written straight from the phone (row-level security checks it's
// the host or a player on that court) and shared to every phone through realtime.
import type { Side } from '../logic/tennis'
import { must, supabase } from './supabase'

export async function getTaps(matchId: string): Promise<Side[]> {
  const rows = must(await supabase.from('points').select('team').eq('match_id', matchId).order('id'))
  return (rows as { team: Side }[]).map((r) => r.team)
}

export async function addPoint(sessionId: string, matchId: string, team: Side): Promise<void> {
  must(await supabase.from('points').insert({ session_id: sessionId, match_id: matchId, team }))
}

export async function undoPoint(matchId: string): Promise<void> {
  const last = must(
    await supabase.from('points').select('id').eq('match_id', matchId).order('id', { ascending: false }).limit(1).maybeSingle(),
  ) as { id: number } | null
  if (last) must(await supabase.from('points').delete().eq('id', last.id))
}

/** Calls `listener` with the match's taps after every change from any phone; returns the unsubscribe. */
export function subscribeTaps(matchId: string, listener: (taps: Side[]) => void): () => void {
  const refresh = () => getTaps(matchId).then(listener)
  const channel = supabase
    .channel(`points:${matchId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'points', filter: `match_id=eq.${matchId}` }, refresh)
    // Deletes can't be filtered by match, so any undo refreshes.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'points' }, refresh)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
