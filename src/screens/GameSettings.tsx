import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { Field, Select, TextInput } from '../components/Field'
import { PageHeader } from '../components/PageHeader'
import { createSession, type GameSystem, type NewSession } from '../data/sessions'

const MIN_PLAYERS = 4
const MAX_PLAYERS = 24

const timeOptions = [60, 90, 120, 150, 180].map((minutes) => ({
  value: String(minutes),
  label: minutes === 60 ? '1 hour' : `${minutes / 60} hours`,
}))

const gameTypeOptions = [
  { value: 'doubles', label: 'Doubles' },
  { value: 'singles', label: 'Singles (coming soon)', disabled: true },
]

const gameSystemOptions: { value: GameSystem; label: string }[] = [
  { value: 'sudden', label: 'Sudden death at deuce' },
  { value: 'advantage', label: 'Advantage' },
]

/** `initial` fills the form with a created session, as shown behind the share overlay. */
export function GameSettings({ initial }: { initial?: NewSession }) {
  const navigate = useNavigate()
  const [name, setName] = useState(initial?.name ?? '')
  const [players, setPlayers] = useState(initial ? String(initial.playerLimit) : '')
  const [courts, setCourts] = useState(String(initial?.courts ?? 1))
  const [minutes, setMinutes] = useState(String(initial?.minutes ?? 120))
  const [gameSystem, setGameSystem] = useState<GameSystem>(initial?.gameSystem ?? 'sudden')
  const [saving, setSaving] = useState(false)

  // A court needs 4 players, so more courts than that would never be used.
  const maxCourts = Math.max(1, Math.floor((Number(players) || MIN_PLAYERS) / 4))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const session = await createSession({
        name: name.trim(),
        playerLimit: Number(players),
        courts: Number(courts),
        minutes: Number(minutes),
        gameSystem,
      })
      navigate(`/s/${session.code}/share`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="game settings"
        subtitle="Set up today's session. We'll build balanced rounds so every team gets a fair chance to win."
      />
      <form onSubmit={submit} className="mt-11 flex flex-col gap-5 pb-10">
        <Field label="Game Name">
          {(id) => (
            <TextInput
              id={id}
              required
              maxLength={40}
              placeholder="Fun Fun Tennis"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Number of Players">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              required
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              step={1}
              placeholder={`${MIN_PLAYERS} to ${MAX_PLAYERS}`}
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
            />
          )}
        </Field>
        <Field label="Courts">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={maxCourts}
              step={1}
              value={courts}
              onChange={(e) => setCourts(e.target.value)}
            />
          )}
        </Field>
        <Field label="Time Session">
          {(id) => (
            <Select id={id} options={timeOptions} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          )}
        </Field>
        <Field label="Game Type">{(id) => <Select id={id} options={gameTypeOptions} defaultValue="doubles" />}</Field>
        <Field label="Game System">
          {(id) => (
            <Select
              id={id}
              options={gameSystemOptions}
              value={gameSystem}
              onChange={(e) => setGameSystem(e.target.value as GameSystem)}
            />
          )}
        </Field>
        <Button type="submit" disabled={saving}>
          Create game
        </Button>
      </form>
    </AppShell>
  )
}
