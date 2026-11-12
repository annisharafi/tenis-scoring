import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { RadioGroup, type RadioOption } from '../components/RadioGroup'
import { GameError, saveSurvey } from '../data/game'
import { useGame, useRefetchGame } from '../data/useGame'
import type { Survey as SurveyAnswers } from '../logic/survey'

// Copy and order from the brief (serve and return run weakest to strongest); points live in config.
const lastPlayedOptions: RadioOption<SurveyAnswers['lastPlayed']>[] = [
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'longAgo', label: 'A long time ago' },
  { value: 'never', label: 'Never played before' },
]

const serveOptions: RadioOption<SurveyAnswers['serve']>[] = [
  { value: 'doubleFault', label: 'Often a double fault' },
  { value: 'usuallyIn', label: 'Usually goes in' },
  { value: 'powerOrPlacement', label: 'Goes in with power or placement' },
]

const returnOptions: RadioOption<SurveyAnswers['ret']>[] = [
  { value: 'oftenMiss', label: 'I often miss the ball' },
  { value: 'usuallyBack', label: 'I usually get it back' },
  { value: 'backWithPlacement', label: 'I get it back with placement' },
]

/** 4.0 Survey: three questions that set the player's hidden starting rating. */
export function Survey() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const [lastPlayed, setLastPlayed] = useState<SurveyAnswers['lastPlayed']>()
  const [serve, setServe] = useState<SurveyAnswers['serve']>()
  const [ret, setRet] = useState<SurveyAnswers['ret']>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const complete = lastPlayed && serve && ret
  const { data: game } = useGame(code)
  const refetch = useRefetchGame(code)

  // Answers belong to a player, so anyone who hasn't joined goes to the join card first.
  useEffect(() => {
    if (game && !game.me.id) navigate(`/s/${code}`, { replace: true })
  }, [game, code, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!lastPlayed || !serve || !ret) return
    setSaving(true)
    setError(undefined)
    try {
      await saveSurvey(code, { lastPlayed, serve, ret })
      await refetch()
      // The join link routes on: the lobby before the game starts, otherwise the game.
      navigate(`/s/${code}`, { replace: true })
    } catch (e) {
      setError(e instanceof GameError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="let us know you"
        subtitle="Three quick questions so we can find you a fair partner. Nobody sees your answers or your level."
      />
      <form onSubmit={submit} className="mt-11 flex flex-col gap-5 pb-10">
        <RadioGroup label="When did you last play?" options={lastPlayedOptions} value={lastPlayed} onChange={setLastPlayed} />
        <RadioGroup label="How is your serve?" options={serveOptions} value={serve} onChange={setServe} />
        <RadioGroup label="How is your return?" options={returnOptions} value={ret} onChange={setRet} />
        {error && (
          <p role="alert" className="text-small font-light text-accent">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!complete || saving}>
          Submit
        </Button>
      </form>
    </AppShell>
  )
}
