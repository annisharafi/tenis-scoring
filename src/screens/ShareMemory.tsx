import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { useGame } from '../data/useGame'
import { scoredMatches } from '../logic/session'
import { standings } from '../logic/standings'
import { CARD_FONTS, drawCard, loadImage, TEMPLATES, type CardData } from '../share/drawCard'

const CARD_STEP = 294 + 20 // card width + gap
const DEFAULT_PHOTOS = Array.from({ length: TEMPLATES }, (_, i) => `/images/share-0${i + 1}.jpg`)

// iPhone/iPad Safari saves downloads to Files, so the card also opens full screen there.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

/** 8.0 Share your memory: pick a card, set a photo, download it as a 1080 × 1920 PNG. */
export function ShareMemory() {
  const { code = '' } = useParams()
  const location = useLocation()
  const { data: game } = useGame(code)
  const [photo, setPhoto] = useState<File | undefined>((location.state as { photo?: File } | null)?.photo)
  const [images, setImages] = useState<(HTMLImageElement | null)[]>()
  const [active, setActive] = useState(0)
  const [savedUrl, setSavedUrl] = useState<string>()
  const canvases = useRef<(HTMLCanvasElement | null)[]>([])
  const track = useRef<HTMLDivElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  // The chosen photo backs every card; without one, each card shows its own default photo.
  useEffect(() => {
    let current = true
    const url = photo && URL.createObjectURL(photo)
    Promise.all([
      Promise.all(DEFAULT_PHOTOS.map((src) => loadImage(url ?? src))),
      ...CARD_FONTS.map((font) => document.fonts.load(font)),
    ]).then(([loaded]) => current && setImages(loaded))
    return () => {
      current = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [photo])

  const rows = useMemo(() => (game ? standings(game.players, scoredMatches(game.rounds)) : []), [game])
  const rank = rows.findIndex((r) => r.id === game?.me.id) + 1
  const me = rows[rank - 1]

  useEffect(() => {
    if (!game || !images || !me) return
    images.forEach((img, i) => {
      const canvas = canvases.current[i]
      const data: CardData = {
        photo: img,
        rank,
        total: rows.length,
        record: { won: me.won, tied: me.tied, lost: me.lost },
        label: rank === 1 ? 'Winner' : me.name,
        sessionName: game.session.name,
      }
      if (canvas) drawCard(canvas, i, data)
    })
  }, [game, images, me, rank, rows.length])

  useEffect(
    () => () => {
      if (savedUrl) URL.revokeObjectURL(savedUrl)
    },
    [savedUrl],
  )

  function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) setPhoto(file)
    event.target.value = ''
  }

  function showCard(index: number) {
    track.current?.scrollTo({ left: index * CARD_STEP, behavior: 'smooth' })
  }

  function download() {
    canvases.current[active]?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${code}-card-0${active + 1}.png`
      link.click()
      if (isIOS()) setSavedUrl(url)
      else setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return (
    <AppShell>
      <PageHeader
        title="share your memory"
        subtitle="Pick a card, add a photo from today and share your match with friends."
      />
      <input ref={photoInput} type="file" accept="image/*" hidden onChange={changePhoto} />
      <div
        ref={track}
        onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / CARD_STEP))}
        className="-mr-gutter-r mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: TEMPLATES }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => photoInput.current?.click()}
            aria-label={`Card ${i + 1}. Tap to change the photo`}
            className="w-[294px] shrink-0 snap-start border-[0.5px] border-line bg-line"
          >
            <canvas
              ref={(el) => {
                canvases.current[i] = el
              }}
              className="block aspect-[9/16] w-full"
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {Array.from({ length: TEMPLATES }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => showCard(i)}
            aria-label={`Show card ${i + 1}`}
            aria-current={i === active || undefined}
            className={`size-3 ${i === active ? 'bg-accent' : 'bg-accent-soft'}`}
          />
        ))}
      </div>
      <div className="mt-14 pb-10">
        <Button onClick={download} disabled={!images || !me}>
          Download image
        </Button>
      </div>

      {savedUrl && (
        <div role="dialog" aria-label="Your card" className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black p-5">
          <button type="button" onClick={() => setSavedUrl(undefined)} aria-label="Close" className="absolute top-5 right-5 text-white">
            <X className="size-6" strokeWidth={1.5} />
          </button>
          <img src={savedUrl} alt="Your share card" className="max-h-[80dvh] max-w-full object-contain" />
          <p className="text-small font-light text-white lowercase">Press and hold to save to Photos</p>
        </div>
      )}
    </AppShell>
  )
}
