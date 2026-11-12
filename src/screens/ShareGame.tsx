import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { getSession, type Session } from '../data/sessions'
import { GameSettings } from './GameSettings'

const COPIED_MS = 2000

/** 3.0 Share game: the join link over the created session's settings. */
export function ShareGame() {
  const { code = '' } = useParams()
  const [session, setSession] = useState<Session | null>()

  useEffect(() => {
    let current = true
    getSession(code).then((s) => current && setSession(s ?? null))
    return () => {
      current = false
    }
  }, [code])

  if (session === undefined) return null
  return (
    <>
      <GameSettings key={session?.id} initial={session ?? undefined} />
      <ShareDialog code={code} sessionName={session?.name} />
    </>
  )
}

function ShareDialog({ code, sessionName }: { code: string; sessionName?: string }) {
  const linkRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const joinUrl = `${location.origin}/s/${code}`

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
    } catch {
      // Clipboard blocked: select the link so it can be copied by hand.
      linkRef.current?.select()
    }
  }

  async function share() {
    if (!navigator.share) return linkRef.current?.select()
    try {
      await navigator.share({
        title: sessionName,
        text: sessionName ? `Join today's match on ${sessionName}` : undefined,
        url: joinUrl,
      })
    } catch {
      // Closing the share sheet rejects; nothing to do.
    }
  }

  return (
    <Modal title="share game" subtitle="Invite your friends to join the game">
      <div className="flex gap-2">
        <input
          ref={linkRef}
          readOnly
          aria-label="Join link"
          value={joinUrl.replace(/^https?:\/\//, '')}
          onClick={share}
          className="h-10 min-w-0 flex-1 cursor-pointer truncate border-[0.5px] border-line bg-paper px-3 text-small font-light text-ink outline-none focus:border-primary focus:ring-[0.5px] focus:ring-primary"
        />
        <Button compact onClick={copy} disabled={copied} aria-live="polite">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {/* Inside the card: white text on the 50% overlay would be too faint to read.
          The host plays too, so they join by name (the join card) before the survey. */}
      <Link to={`/s/${code}`} className="self-start text-small font-medium lowercase underline underline-offset-4">
        Continue to the survey
      </Link>
    </Modal>
  )
}
