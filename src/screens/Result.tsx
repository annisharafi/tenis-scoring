import { useRef, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { finishSession } from '../data/game'
import { useGame } from '../data/useGame'
import { scoredMatches } from '../logic/session'
import { standings } from '../logic/standings'

/** 7.0 Result: everyone's record, then sharing a photo card of the day. */
export function Result() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { data: game } = useGame(code)
  const photoInput = useRef<HTMLInputElement>(null)

  if (!game) return null

  const rows = standings(game.players, scoredMatches(game.rounds))

  // The photo picker offers the library or the camera; the chosen file travels to the share card.
  function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const photo = event.target.files?.[0]
    if (photo) navigate(`/s/${code}/share-card`, { state: { photo } })
  }

  async function complete() {
    await finishSession(code)
    navigate('/')
  }

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col">
        <PageHeader title="result" subtitle="Here's how everyone did today. Thanks for playing fair and having fun." />
        {/* Full bleed to the right edge, with its own rule down the left. */}
        <div className="-mr-gutter-r mt-4 flex flex-1 flex-col border-l-[0.5px] border-line">
          <table className="w-full table-fixed border-collapse text-left text-small">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[46px]" />
              <col className="w-[46px]" />
              <col className="w-[46px]" />
              <col />
            </colgroup>
            <thead>
              <tr className="border-y-[0.5px] border-line font-light [&>th]:py-2.5 [&>th]:font-light [&>th]:opacity-50 [&>th+th]:pl-4">
                <th scope="col" className="pl-5">No.</th>
                <th scope="col">Player</th>
                <th scope="col"><abbr title="Won" className="no-underline">W</abbr></th>
                <th scope="col"><abbr title="Lost" className="no-underline">L</abbr></th>
                <th scope="col"><abbr title="Tied" className="no-underline">T</abbr></th>
                <th scope="col">Games</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  aria-current={row.id === game.me.id || undefined}
                  className={`border-b-[0.5px] border-line font-medium [&>td]:py-2.5 [&>td+td]:pl-4 ${row.id === game.me.id ? 'bg-primary/10' : ''}`}
                >
                  <td className="pl-5 font-light opacity-50">{String(i + 1).padStart(2, '0')}.</td>
                  <td className="truncate">{row.name}</td>
                  <td>{row.won}</td>
                  <td>{row.lost}</td>
                  <td>{row.tied}</td>
                  <td>{row.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-auto flex flex-col gap-2 pt-10 pr-gutter-r pb-5">
            <input ref={photoInput} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <Button onClick={() => photoInput.current?.click()}>Share today's match</Button>
            {game.me.isHost && (
              <button type="button" onClick={complete} className="h-12 text-button font-medium text-primary lowercase">
                Complete game
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
