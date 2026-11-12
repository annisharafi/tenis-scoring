import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { GameError, startGame } from '../data/game'
import { useGame, useRefetchGame } from '../data/useGame'
import { MIN_PLAYERS } from '../logic/session'

/**
 * 5.0 Game player: the lobby. Everyone who has joined, live, until the host starts the game;
 * then every phone moves on to the game by itself.
 */
export function Players() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { data: game } = useGame(code)
  const refetch = useRefetchGame(code)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string>()

  // Not joined, or the game has started: the join link sends them where they belong.
  useEffect(() => {
    if (game && (!game.me.id || game.session.status !== 'open')) navigate(`/s/${code}`, { replace: true })
  }, [game, code, navigate])

  if (!game?.me.id || game.session.status !== 'open') return null
  const me = game.me.id
  const enough = game.players.length >= MIN_PLAYERS

  async function start() {
    setStarting(true)
    setError(undefined)
    try {
      await startGame(code)
      await refetch()
    } catch (e) {
      setError(e instanceof GameError ? e.message : 'Something went wrong. Please try again.')
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
                  aria-current={player.id === me || undefined}
                  className={`border-b-[0.5px] border-line font-medium [&>td]:py-2.5 [&>td+td]:pl-4 ${player.id === me ? 'bg-primary/10' : ''}`}
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
                {error && (
                  <p role="alert" className="text-center text-small font-light text-accent">
                    {error}
                  </p>
                )}
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
