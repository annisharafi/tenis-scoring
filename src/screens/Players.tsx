import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { getGame, startGame, type GameView } from '../data/game'

const MIN_PLAYERS = 4 // one court of doubles

/** 5.0 Game player: the lobby. Everyone who has joined, until the host starts the game. */
export function Players() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameView>()
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let current = true
    getGame(code).then((g) => {
      if (!current) return
      // Not joined, or already playing: the join link sends them where they belong.
      if (!g.me.id || g.session.status !== 'open') navigate(`/s/${code}`, { replace: true })
      else setGame(g)
    })
    return () => {
      current = false
    }
  }, [code, navigate])

  if (!game) return null
  const enough = game.players.length >= MIN_PLAYERS

  async function start() {
    setStarting(true)
    try {
      await startGame(code)
      navigate(`/s/${code}/game`)
    } finally {
      setStarting(false)
    }
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col">
        <PageHeader
          title="game player"
          subtitle="Everyone who has joined so far. Start the game once your group is here."
        />
        {/* Full bleed to the right edge with its own left rule, like the result table. */}
        <div className="-mr-gutter-r mt-4 flex flex-1 flex-col border-l-[0.5px] border-line">
          <table className="w-full table-fixed border-collapse text-left text-small">
            <colgroup>
              <col className="w-10" />
              <col />
            </colgroup>
            <thead>
              <tr className="border-y-[0.5px] border-line [&>th]:py-2.5 [&>th]:font-light [&>th]:opacity-50 [&>th+th]:pl-4">
                <th scope="col" className="pl-5">No.</th>
                <th scope="col">Player</th>
              </tr>
            </thead>
            <tbody>
              {game.players.map((player, i) => (
                <tr
                  key={player.id}
                  aria-current={player.id === game.me.id || undefined}
                  className={`border-b-[0.5px] border-line font-medium [&>td]:py-2.5 [&>td+td]:pl-4 ${player.id === game.me.id ? 'bg-primary/10' : ''}`}
                >
                  <td className="pl-5 font-light opacity-50">{String(i + 1).padStart(2, '0')}.</td>
                  <td className="truncate">{player.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-2 pt-5 pr-gutter-r pb-10">
            {game.me.isHost ? (
              <>
                <Button onClick={start} disabled={!enough || starting}>
                  Start game
                </Button>
                {!enough && (
                  <p className="text-center text-small font-light lowercase opacity-50">
                    At least {MIN_PLAYERS} players are needed to start
                  </p>
                )}
              </>
            ) : (
              <p className="flex h-12 items-center justify-center text-small font-light lowercase opacity-50">
                Waiting for the host to start
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
