import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode, type Ref } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { config } from '../config'
import { finishSession, GameError, type GameView, type MatchRecord, type RoundRecord } from '../data/game'
import { useGame, useRefetchGame, useSaveScore } from '../data/useGame'
import { expectedScore } from '../logic/rating'
import { scoreError } from '../logic/session'

const { gamesPerMatch } = config.schedule
const AUTO_SAVE_MS = 700

/** 5.0 Game played: every round's pairings, score entry and the way into live counting. */
export function GamePlayed() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { data: game } = useGame(code)
  const refetch = useRefetchGame(code)
  const save = useSaveScore(code)
  const activeRef = useRef<HTMLElement>(null)

  // Not joined, still in the lobby, or finished by the host: the join link routes them.
  const away = game && (!game.me.id || game.session.status !== 'playing')
  useEffect(() => {
    if (away) navigate(`/s/${code}`, { replace: true })
  }, [away, code, navigate])

  // Open at the current round, and follow it as rounds finish.
  const activeRound = game?.rounds.find((r) => r.state === 'locked')?.number
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeRound])

  if (!game || away) return null

  async function finish() {
    if (!window.confirm('Finish the session for everyone?')) return
    await finishSession(code)
    await refetch()
  }

  return (
    <AppShell>
      <PageHeader
        title="game played"
        subtitle="Each round pairs stronger and newer players so both teams have a fair chance. Enter the final score or count it live."
      />
      <div className="mt-6 flex flex-col gap-5 pb-10">
        {game.rounds.map((round) => (
          <RoundBlock
            key={round.number}
            ref={round.state === 'locked' ? activeRef : undefined}
            round={round}
            game={game}
            onSave={save}
          />
        ))}
        {game.me.isHost ? (
          <Button onClick={finish}>Finished</Button>
        ) : (
          <p className="flex h-12 items-center justify-center text-small font-light lowercase opacity-50">
            Waiting for the host to finish
          </p>
        )}
      </div>
    </AppShell>
  )
}

function RoundBlock({
  ref,
  round,
  game,
  onSave,
}: {
  ref?: Ref<HTMLElement>
  round: RoundRecord
  game: GameView
  onSave: (matchId: string, gamesA: number, gamesB: number) => Promise<void>
}) {
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? ''
  const active = round.state === 'locked'
  return (
    <section ref={ref} aria-label={`Round ${round.number}`} className="relative flex scroll-mt-5 flex-col gap-1">
      {/* The accent bar sits on the left rule beside the active round. */}
      {active && <div aria-hidden className="absolute inset-y-0 -left-5 w-0.5 bg-accent" />}
      <h2 className="text-small font-light opacity-50">Round {round.number}</h2>
      {round.matches.map((match) => (
        <CourtRow
          key={match.id}
          match={match}
          round={round}
          game={game}
          showCourt={round.matches.length > 1}
          nameOf={nameOf}
          onSave={onSave}
        />
      ))}
      {round.resting.length > 0 && (
        <p className="text-small font-light opacity-50">Resting: {round.resting.map(nameOf).join(', ')}</p>
      )}
    </section>
  )
}

function CourtRow({
  match,
  round,
  game,
  showCourt,
  nameOf,
  onSave,
}: {
  match: MatchRecord
  round: RoundRecord
  game: GameView
  showCourt: boolean
  nameOf: (id: string) => string
  onSave: (matchId: string, gamesA: number, gamesB: number) => Promise<void>
}) {
  const { code = '' } = useParams()
  const [a, setA] = useState(match.gamesA?.toString() ?? '')
  const [b, setB] = useState(match.gamesB?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<string>()

  // A newly saved score (from this phone, another phone, or a refusal rolling it back) replaces the inputs.
  const saved = `${match.gamesA}-${match.gamesB}`
  const [shown, setShown] = useState(saved)
  if (shown !== saved) {
    setShown(saved)
    setA(match.gamesA?.toString() ?? '')
    setB(match.gamesB?.toString() ?? '')
  }

  const active = round.state === 'locked'
  const onCourt = game.me.id !== null && [...match.teamA, ...match.teamB].includes(game.me.id)
  // Players score their own court; the host can fix any score. Planned rounds can't be scored yet.
  const canScore = round.state !== 'planned' && (game.me.isHost || onCourt)
  const canCountLive = active && canScore && match.status !== 'done'

  const gamesA = Number(a)
  const gamesB = Number(b)
  const filled = a !== '' && b !== ''
  const invalid = filled ? scoreError(gamesA, gamesB) : null
  const changed = gamesA !== match.gamesA || gamesB !== match.gamesB
  const message = invalid ?? refused

  async function save() {
    if (!filled || invalid || !changed || saving) return
    setSaving(true)
    setRefused(undefined)
    try {
      await onSave(match.id, gamesA, gamesB)
    } catch (e) {
      setRefused(e instanceof GameError ? e.message : 'Could not save the score. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // A complete, valid score saves itself once typing pauses; leaving the fields or Enter saves now.
  useEffect(() => {
    if (!filled || invalid || !changed) return
    const timer = setTimeout(save, AUTO_SAVE_MS)
    return () => clearTimeout(timer)
  })

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget
    if (!(next instanceof HTMLInputElement && event.currentTarget.contains(next))) save()
  }
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save()
  }

  const teamName = (team: readonly string[]) => team.map(nameOf).join(' • ')
  return (
    <form onSubmit={onSubmit} onBlur={onBlur} className="flex flex-col gap-1">
      {showCourt && <h3 className="text-small font-light opacity-50">Court {match.court}</h3>}
      <div className="flex items-end gap-2">
        <TeamScore name={teamName(match.teamA)} info={<RatingInfo team="a" match={match} game={game} />}>
          <ScoreInput label={`${teamName(match.teamA)} games`} value={a} onChange={setA} disabled={!canScore || saving} />
        </TeamScore>
        <span aria-hidden className="flex h-10 w-[5px] items-center text-small font-light">
          -
        </span>
        <TeamScore name={teamName(match.teamB)} info={<RatingInfo team="b" match={match} game={game} />}>
          <ScoreInput label={`${teamName(match.teamB)} games`} value={b} onChange={setB} disabled={!canScore || saving} />
        </TeamScore>
        {canCountLive ? (
          <Link
            to={`/s/${code}/match/${match.id}/live`}
            className="flex h-10 shrink-0 items-center border-[0.5px] border-accent px-2.5 text-small text-accent lowercase"
          >
            Live Count
          </Link>
        ) : (
          <span
            aria-disabled
            className={`flex h-10 shrink-0 items-center border-[0.5px] px-2.5 text-small lowercase ${active ? 'border-accent/50 text-accent/50' : 'border-accent-soft text-accent-soft'}`}
          >
            Live Count
          </span>
        )}
        {/* Hidden submit so Enter saves from either field. */}
        <button type="submit" hidden />
      </div>
      {message && (
        <p role="alert" className="text-small font-light text-accent">
          {message}
        </p>
      )}
    </form>
  )
}

function TeamScore({ name, info, children }: { name: string; info: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="truncate text-small font-medium">{name}</p>
      {info}
      {children}
    </div>
  )
}

function ScoreInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={gamesPerMatch}
      step={1}
      aria-label={label}
      placeholder="Input score"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full min-w-0 border-[0.5px] border-line bg-paper px-3 text-small font-light text-ink outline-none placeholder:text-ink/50 focus:border-primary focus:ring-[0.5px] focus:ring-primary disabled:bg-paper"
    />
  )
}

/**
 * Small grey rating details under a team name, when the server shares ratings with this player
 * (see `ratingVisibility`): in test mode ratings with survey points, team average, win chance and
 * the change after a match; in host mode ratings and the court's team gap.
 */
function RatingInfo({ team, match, game }: { team: 'a' | 'b'; match: MatchRecord; game: GameView }) {
  const ratings = game.ratings
  if (!ratings) return null
  const test = config.ratingVisibility === 'test'

  const change = ratings.changes.get(match.id)
  const ratingOf = (id: string) => change?.before.get(id) ?? ratings.players.get(id)?.rating ?? config.rating.base
  const avg = (ids: readonly string[]) => ids.reduce((s, id) => s + ratingOf(id), 0) / ids.length
  const [mine, theirs] = team === 'a' ? [match.teamA, match.teamB] : [match.teamB, match.teamA]

  const perPlayer = mine
    .map((id) => {
      const points = ratings.players.get(id)?.surveyPoints
      return test && points != null ? `${Math.round(ratingOf(id))} (${points})` : `${Math.round(ratingOf(id))}`
    })
    .join(' • ')
  const delta = change?.deltas.get(mine[0])
  const details = test
    ? [
        `avg ${Math.round(avg(mine))}`,
        `${Math.round(expectedScore(avg(mine), avg(theirs)) * 100)}%`,
        ...(delta === undefined ? [] : [`${delta >= 0 ? '+' : ''}${delta}`]),
      ]
    : [`gap ${Math.round(Math.abs(avg(mine) - avg(theirs)))}`]

  return (
    <p className="truncate text-tiny font-light opacity-50">
      {perPlayer}
      <br />
      {details.join(' · ')}
    </p>
  )
}
