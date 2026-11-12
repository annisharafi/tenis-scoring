import { CheckCheck, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getGame, saveScore, type GameView, type MatchRecord } from '../data/game'
import { addPoint, getTaps, subscribeTaps, undoPoint } from '../data/points'
import { countPoints, type Side } from '../logic/tennis'

/** 6.0 Score counter: one phone on court taps a half to give that team the point. */
export function ScoreCounter() {
  const { code = '', matchId = '' } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameView>()
  const [taps, setTaps] = useState<Side[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let current = true
    getGame(code).then((g) => current && setGame(g))
    getTaps(matchId).then((t) => current && setTaps(t))
    const unsubscribe = subscribeTaps(matchId, setTaps)
    return () => {
      current = false
      unsubscribe()
    }
  }, [code, matchId])

  const match = game?.rounds.flatMap((r) => r.matches).find((m) => m.id === matchId)
  if (!game || !match) return null

  const count = countPoints(taps, game.session.gameSystem)
  const teamName = (team: MatchRecord['teamA']) =>
    team.map((id) => game.players.find((p) => p.id === id)?.name).join(' • ')

  async function complete() {
    setSaving(true)
    try {
      await saveScore(code, matchId, count.games.a, count.games.b)
      navigate(`/s/${code}/game`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-paper text-ink select-none">
      <h1 className="sr-only">score counter</h1>
      <div className="relative grid flex-1 grid-cols-2">
        <TeamHalf name={teamName(match.teamA)} call={count.points.a} disabled={count.matchOver} onTap={() => addPoint(matchId, 'a')} />
        <TeamHalf
          name={teamName(match.teamB)}
          call={count.points.b}
          disabled={count.matchOver}
          onTap={() => addPoint(matchId, 'b')}
          className="border-l-[0.5px] border-line"
        />
        <p aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-small font-light opacity-50">
          {count.status}
        </p>
      </div>
      <div className="flex h-[102px] flex-col items-center justify-center gap-2 border-t-[0.5px] border-line">
        <p className="text-small font-light opacity-50">Games</p>
        <p className="font-display text-title" aria-live="polite">
          {count.games.a}–{count.games.b}
        </p>
      </div>
      <footer className="flex h-14 items-center justify-center gap-10 border-t-[0.5px] border-line text-button font-medium">
        <button
          type="button"
          onClick={() => undoPoint(matchId)}
          disabled={taps.length === 0}
          className="flex items-center gap-2 lowercase disabled:opacity-50"
        >
          <Undo2 aria-hidden className="size-5" strokeWidth={1.5} />
          Undo
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={saving || count.games.a + count.games.b === 0}
          className="flex items-center gap-2 text-accent lowercase disabled:opacity-50"
        >
          <CheckCheck aria-hidden className="size-5" strokeWidth={1.5} />
          Complete game
        </button>
      </footer>
    </main>
  )
}

function TeamHalf({
  name,
  call,
  disabled,
  onTap,
  className = '',
}: {
  name: string
  call: string
  disabled: boolean
  onTap: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={`Point to ${name}, now ${call}`}
      className={`flex min-w-0 flex-col items-center justify-center px-2 active:bg-line/30 ${className}`}
    >
      <span className="max-w-full truncate text-small font-medium">{name}</span>
      <span className="font-display text-live tracking-[2px]">{call}</span>
    </button>
  )
}
