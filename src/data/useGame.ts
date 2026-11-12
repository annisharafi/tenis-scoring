import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { recordScore } from '../logic/session'
import { getGame, saveScore, type GameView } from './game'
import { supabase } from './supabase'

export const gameKey = (code: string) => ['game', code] as const

const REFRESH_BATCH_MS = 250

/**
 * The session as this player sees it, kept current: any change to its session, players, rounds
 * or matches (from any phone) refetches it. Screens showing the same session share one query.
 */
export function useGame(code: string) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: gameKey(code), queryFn: () => getGame(code), retry: false })
  const sessionId = query.data?.session.id

  useEffect(() => {
    if (!sessionId) return
    // One action changes several rows (a join adds a player, then saves the plan), so a burst of
    // changes is gathered into one reload.
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => queryClient.invalidateQueries({ queryKey: gameKey(code) }), REFRESH_BATCH_MS)
    }
    const inSession = { schema: 'public', filter: `session_id=eq.${sessionId}` } as const
    const channel = supabase
      .channel(`game:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, refresh)
      .on('postgres_changes', { event: '*', table: 'players', ...inSession }, refresh)
      .on('postgres_changes', { event: '*', table: 'rounds', ...inSession }, refresh)
      .on('postgres_changes', { event: '*', table: 'matches', ...inSession }, refresh)
      // Re-pairing deletes matches, and deletes can't be filtered by session.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'matches' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [code, sessionId, queryClient])

  return query
}

/** After an action, fetch the session again now (rather than waiting for realtime). */
export function useRefetchGame(code: string) {
  const queryClient = useQueryClient()
  return () => queryClient.refetchQueries({ queryKey: gameKey(code) })
}

/**
 * Saves a final games score. The screen shows it at once (the match done, the active round moved
 * on when its last court finishes); the server's re-plan then replaces it, or undoes it on a refusal.
 */
export function useSaveScore(code: string) {
  const queryClient = useQueryClient()
  return async (matchId: string, gamesA: number, gamesB: number) => {
    await queryClient.cancelQueries({ queryKey: gameKey(code) })
    queryClient.setQueryData<GameView>(gameKey(code), (game) =>
      game && { ...game, rounds: recordScore(game.rounds, matchId, gamesA, gamesB) },
    )
    try {
      await saveScore(code, matchId, gamesA, gamesB)
    } finally {
      await queryClient.invalidateQueries({ queryKey: gameKey(code) })
    }
  }
}
