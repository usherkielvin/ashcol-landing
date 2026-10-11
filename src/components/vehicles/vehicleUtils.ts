import type { Vehicle } from '../../utils/vehicleApi'

const CODING_BY_LAST_DIGIT: Record<string, string> = {
  '1': 'Monday', '2': 'Monday',
  '3': 'Tuesday', '4': 'Tuesday',
  '5': 'Wednesday', '6': 'Wednesday',
  '7': 'Thursday', '8': 'Thursday',
  '9': 'Friday', '0': 'Friday',
}

/** Number-coding day from the plate's last digit: 1-2 Mon, 3-4 Tue, 5-6 Wed, 7-8 Thu, 9-0 Fri. 'None' if the plate doesn't end in a digit. */
export function codingDayFromPlate(plate?: string | null): string {
  const last = (plate || '').trim().slice(-1)
  return CODING_BY_LAST_DIGIT[last] || 'None'
}

/** The coding day to show/save: always plate-derived; only falls back to a legacy stored value when there is no plate. */
export function effectiveCodingDay(v: Pick<Vehicle, 'plateNumber' | 'codingDay'>): string {
  if (v.plateNumber?.trim()) return codingDayFromPlate(v.plateNumber)
  return v.codingDay || 'None'
}

/** Colour tokens shared by every vehicle surface (explicit tokens, matching the rest of the portal). */
export function vehicleTheme(isLight: boolean) {
  return {
    isLight,
    cardBg: isLight ? '#ffffff' : '#0A1120',
    panelBg: isLight ? '#f8fafc' : '#080f1c',
    border: isLight ? '#e2e8f0' : '#1E2D48',
    textPrimary: isLight ? '#0f172a' : '#E2E8F0',
    textMuted: isLight ? '#64748b' : '#7A95B8',
    inputBg: isLight ? '#f8fafc' : '#0F1A2E',
    inputBorder: isLight ? '#cbd5e1' : '#243452',
    accent: '#10B981',
  }
}
export type VehicleTheme = ReturnType<typeof vehicleTheme>

export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

/** Today's weekday in Manila — number-coding is a Metro Manila rule, so don't depend on the viewer's timezone. */
export function todayWeekday(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Manila' })
}

export function isCodingToday(v: Pick<Vehicle, 'plateNumber' | 'codingDay'>): boolean {
  const day = effectiveCodingDay(v)
  return day !== 'None' && day === todayWeekday()
}

export function initials(name?: string | null): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Every vehicle photo is stored in this exact frame, so it fills the card/modal with no gaps and no cropping at view time. */
export const PHOTO_ASPECT = 16 / 9
const OUTPUT_WIDTH = 1600

/**
 * Renders the framed area chosen in the editor (pixels are relative to the rotated image, as react-easy-crop
 * reports them) into a 16:10 JPEG — exactly what the card will show.
 */
export async function cropPhoto(
  src: string,
  area: { x: number; y: number; width: number; height: number },
  rotation: number,
): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read this image.'))
    img.src = src
  })

  const rad = (rotation * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const boxW = Math.round(image.width * cos + image.height * sin)
  const boxH = Math.round(image.width * sin + image.height * cos)

  const rotated = document.createElement('canvas')
  rotated.width = boxW
  rotated.height = boxH
  const rctx = rotated.getContext('2d')
  if (!rctx) throw new Error('Could not process this image.')
  rctx.translate(boxW / 2, boxH / 2)
  rctx.rotate(rad)
  rctx.drawImage(image, -image.width / 2, -image.height / 2)

  const outW = Math.min(OUTPUT_WIDTH, Math.round(area.width))
  const outH = Math.round(outW / PHOTO_ASPECT)
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const octx = out.getContext('2d')
  if (!octx) throw new Error('Could not process this image.')
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, outW, outH)
  octx.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, outW, outH)

  return new Promise<Blob>((resolve, reject) =>
    out.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process this image.'))), 'image/jpeg', 0.92),
  )
}

export const MAX_PHOTO_INPUT_BYTES = 25 * 1024 * 1024
const MAX_EDGE = 2000

/**
 * Decodes a picked photo (EXIF rotation applied) and downsizes it to at most {@link MAX_EDGE}px on the
 * longest side so the editor stays fast. Always re-encoded, which also bakes in the orientation.
 */
export async function preparePhoto(file: File): Promise<{ blob: Blob; filename: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (file.size > MAX_PHOTO_INPUT_BYTES) throw new Error('Image must be under 25MB.')

  let bitmap: ImageBitmap
  try {
    // 'from-image' applies the EXIF rotation so phone photos come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error("This image format can't be read by the browser. Try a JPG, PNG or WebP.")
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) { bitmap.close(); throw new Error('Could not process this image.') }
  ctx.fillStyle = '#ffffff' // PNG transparency would turn black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process this image.'))), 'image/jpeg', 0.9),
  )
  const base = file.name.replace(/\.[^.]+$/, '') || 'vehicle'
  return { blob, filename: `${base}.jpg` }
}
