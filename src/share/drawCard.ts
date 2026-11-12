// Draws the three share-card templates onto a 1080 × 1920 canvas.
// Layout is in Figma units (cards are 294 wide) and scaled up, so the preview and the PNG match.

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1920
export const TEMPLATES = 3

const DESIGN_WIDTH = 294
const SCALE = CARD_WIDTH / DESIGN_WIDTH
const W = DESIGN_WIDTH
const H = CARD_HEIGHT / SCALE // ≈ 523: 9:16 at the design width

const DISPLAY = '"Special Gothic Expanded One"'
const BODY = '"Google Sans Flex"'
export const CARD_FONTS = [`20px ${DISPLAY}`, `400 12px ${BODY}`]

export type CardData = {
  photo: HTMLImageElement | null
  rank: number
  total: number
  record: { won: number; tied: number; lost: number }
  /** "Winner" for first place, otherwise the player's name. */
  label: string
  sessionName: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Reads a colour token from the stylesheet so cards use the same tokens as the screens. */
function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}

/** Text with letter spacing, drawn per character (canvas letterSpacing isn't on every phone yet). */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'center' = 'left') {
  const chars = [...text]
  const width = chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + spacing * (chars.length - 1)
  let cursor = align === 'center' ? x - width / 2 : x
  for (const c of chars) {
    ctx.fillText(c, cursor, y)
    cursor += ctx.measureText(c).width + spacing
  }
}

/** Fills the area like CSS object-fit: cover; a plain grey box while there is no photo. */
function photo(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, w: number, h: number) {
  if (!img) {
    ctx.fillStyle = token('line')
    ctx.fillRect(0, 0, w, h)
    return
  }
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h)
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function drawCard(canvas: HTMLCanvasElement, template: number, data: CardData) {
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  ctx.textBaseline = 'top'
  const { won, tied, lost } = data.record
  const white = token('paper')
  const ink = token('ink')

  if (template === 0) {
    // 01: full photo, position top left, record bottom left.
    photo(ctx, data.photo, W, H)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = white
    ctx.font = `400 12px ${BODY}`
    ctx.fillText('Position', 20, 20)
    ctx.fillText('W / T / L', 20, H - 61)
    ctx.font = `20px ${DISPLAY}`
    spaced(ctx, `${pad(data.rank)}/${pad(data.total)}`, 20, 35, 2)
    spaced(ctx, `${pad(won)} / ${pad(tied)} / ${pad(lost)}`, 20, H - 46, 2)
  } else if (template === 1) {
    // 02: photo on top, white panel with label, record and session name, thin rules.
    photo(ctx, data.photo, W, H - 128)
    ctx.fillStyle = white
    ctx.fillRect(0, H - 128, W, 128)
    ctx.strokeStyle = token('line')
    ctx.lineWidth = 0.5
    line(ctx, 20, 0, 20, H)
    line(ctx, W - 20, 0, W - 20, H)
    line(ctx, 0, H - 20, W, H - 20)
    // The short rule leading into the session name takes the text colour.
    ctx.strokeStyle = ink
    line(ctx, 0, H - 43, 43, H - 43)
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.5
    ctx.font = `400 12px ${BODY}`
    ctx.fillText(data.label, 40, H - 118)
    ctx.globalAlpha = 1
    ctx.font = `12px ${DISPLAY}`
    spaced(ctx, `W ${pad(won)} / T ${pad(tied)} / L ${pad(lost)}`, 40, H - 103, 2)
    ctx.font = `20px ${DISPLAY}`
    spaced(ctx, data.sessionName, 40, H - 56, 0.5)
  } else {
    // 03: full photo, label and record centred.
    photo(ctx, data.photo, W, H)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = white
    ctx.font = `400 12px ${BODY}`
    ctx.textAlign = 'center'
    ctx.fillText(data.label, W / 2, H / 2 - 17)
    ctx.textAlign = 'left'
    ctx.font = `15px ${DISPLAY}`
    spaced(ctx, `W ${pad(won)} / T ${pad(tied)} / L ${pad(lost)}`, W / 2, H / 2 - 2, 2, 'center')
  }
}

/** Resolves to null when the image can't load (e.g. a default photo not added yet). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}
