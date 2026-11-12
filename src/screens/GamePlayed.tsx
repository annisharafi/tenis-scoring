import { useEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode, type Ref } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { config } from '../config'
import { finishSession, getGame, saveScore, type GameView, type MatchRecord, type RoundRecord } from '../data/game'
import { expectedScore } from '../logic/rating'

const { gamesPerMatch } = config.schedule

/** 5.0 Game played: every round's pairings, score entry and the way into live counting. */
export function GamePlayed() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameView>()
  const activeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let current = true
    getGame(code).then((g) => {
      if (!current) return
      // Not joined yet, or still in the lobby: the join link routes them.
      if (!g.me.id || g.session.status === 'open') navigate(`/s/${code}`, { replace: true })
      else setGame(g)
    })
    return () => {
      current = false
    }
  }, [code, navigate])

  // Open at the current round.
  const hasGame = Boolean(game)
  useEffect(() => {
    if (hasGame) activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [hasGame])

  if (!game) return null

  async function finish() {
    if (!window.confirm('Finish the session for everyone?')) return
    await finishSession(code)
    navigate(`/s/${code}/result`)
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
            onSave={async (matchId, a, b) => setGame(await saveScore(code, matchId, a, b))}
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
      <div className="flex items-center justify-between">
        <h2 className="text-small font-light opacity-50">Round {round.number}</h2>
        {round.state === 'planned' && (
          <span className="border-[0.5px] border-accent-soft px-1.5 text-tiny text-accent">planned</span>
        )}
      </div>
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

  const active = round.state === 'locked'
  const onCourt = game.me.id !== null && [...match.teamA, ...match.teamB].includes(game.me.id)
  // Players score their own court; the host can fix any score. Planned rounds can't be scored yet.
  const canScore = round.state !== 'planned' && (game.me.isHost || onCourt)
  const canCountLive = active && canScore && match.status !== 'done'

  const gamesA = Number(a)
  const gamesB = Number(b)
  const tooMany = a !== '' && b !== '' && gamesA + gamesB > gamesPerMatch
  const valid = a !== '' && b !== '' && !tooMany && gamesA + gamesB > 0
  const changed = gamesA !== match.gamesA || gamesB !== match.gamesB

  async function save() {
    if (!valid || !changed || saving) return
    setSaving(true)
    try {
      await onSave(match.id, gamesA, gamesB)
    } finally {
      setSaving(false)
    }
  }

  // Save once focus leaves both score fields (or on Enter).
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
          <ScoreInput label={`${teamName(match.teamA)} games`} value={a} onChange={setA} disabled={!canScore} />
        </TeamScore>
        <span aria-hidden className="flex h-10 w-[5px] items-center text-small font-light">
          -
        </span>
        <TeamScore name={teamName(match.teamB)} info={<RatingInfo team="b" match={match} game={game} />}>
          <ScoreInput label={`${teamName(match.teamB)} games`} value={b} onChange={setB} disabled={!canScore} />
        </TeamScore>
        {canCountLive ? (
          <Link
            to={`/s/${code}/match/${match.id}/live`}
            className="flex h-10 shrink-0 items-center bg-accent px-2.5 text-small text-white lowercase"
          >
            Live Count
          </Link>
        ) : (
          <span
            aria-disabled
            className={`flex h-10 shrink-0 items-center px-2.5 text-small text-white lowercase ${active ? 'bg-accent/50' : 'bg-accent-soft'}`}
          >
            Live Count
          </span>
        )}
        {/* Hidden submit so Enter saves from either field. */}
        <button type="submit" hidden />
      </div>
      {tooMany && <p className="text-small font-light text-accent">A match has {gamesPerMatch} games in total.</p>}
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
 * Small grey rating details under a team name, by `ratingVisibility`:
 * test shows ratings, survey points, team average, win chance and the change after a match;
 * host shows ratings and the court's team gap to the host only.
 */
function RatingInfo({ team, match, game }: { team: 'a' | 'b'; match: MatchRecord; game: GameView }) {
  const level = config.ratingVisibility as 'hidden' | 'host' | 'test'
  if (level === 'hidden' || (level === 'host' && !game.me.isHost)) return null

  const change = game.ratingChanges.get(match.id)
  const ratingOf = (id: string) => change?.before.get(id) ?? game.players.find((p) => p.id === id)!.rating
  const avg = (ids: readonly string[]) => ids.reduce((s, id) => s + ratingOf(id), 0) / ids.length
  const [mine, theirs] = team === 'a' ? [match.teamA, match.teamB] : [match.teamB, match.teamA]

  const ratings = mine
    .map((id) => {
      const points = game.players.find((p) => p.id === id)!.surveyPoints
      return level === 'test' ? `${ratingOf(id)} (${points})` : `${ratingOf(id)}`
    })
    .join(' • ')
  const delta = change?.deltas.get(mine[0])
  const details =
    level === 'test'
      ? [
          `avg ${Math.round(avg(mine))}`,
          `${Math.round(expectedScore(avg(mine), avg(theirs)) * 100)}%`,
          ...(delta === undefined ? [] : [`${delta >= 0 ? '+' : ''}${delta}`]),
        ]
      : [`gap ${Math.round(Math.abs(avg(mine) - avg(theirs)))}`]

  return (
    <p className="truncate text-tiny font-light opacity-50">
      {ratings}
      <br />
      {details.join(' · ')}
    </p>
  )
}
