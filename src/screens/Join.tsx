import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../components/Button'
import { TextInput } from '../components/Field'
import { Modal } from '../components/Modal'
import { getGame, joinSession, JoinError, type GameView } from '../data/game'
import { Splash } from './Splash'

const FINISHED = 'This session has finished. Ask the host for a new link.'

/**
 * 1.1 Join invitation, the screen behind every join link.
 * Anyone already in the session (the host included) skips it: to the survey if they haven't
 * answered it, then to the lobby before the game starts, the game while it is playing, or the
 * result once it has finished. Other screens send people here to be routed the same way.
 */
export function Join() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameView>()

  useEffect(() => {
    let current = true
    getGame(code).then((g) => {
      if (!current) return
      if (!g.me.id) return setGame(g)
      const next = !g.me.surveyDone
        ? 'about-you'
        : { open: 'players', playing: 'game', finished: 'result' }[g.session.status]
      navigate(`/s/${code}/${next}`, { replace: true })
    })
    return () => {
      current = false
    }
  }, [code, navigate])

  if (!game) return null
  return (
    <>
      <Splash />
      <Modal label="Join today's match on" title={game.session.name}>
        {game.session.status === 'finished' ? (
          <p role="alert" className="text-small font-light">
            {FINISHED}
          </p>
        ) : (
          <JoinForm code={code} onJoined={() => navigate(`/s/${code}/about-you`)} />
        )}
      </Modal>
    </>
  )
}

function JoinForm({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await joinSession(code, name)
      onJoined()
    } catch (e) {
      if (!(e instanceof JoinError)) throw e
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextInput
        aria-label="Your name"
        aria-describedby={error ? 'join-error' : undefined}
        aria-invalid={Boolean(error)}
        placeholder="Your name"
        autoComplete="given-name"
        required
        maxLength={30}
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          setError(undefined)
        }}
      />
      {error && (
        <p id="join-error" role="alert" className="text-small font-light text-accent">
          {error}
        </p>
      )}
      <Button compact type="submit" disabled={saving || !name.trim()} className="w-full">
        Join
      </Button>
    </form>
  )
}
