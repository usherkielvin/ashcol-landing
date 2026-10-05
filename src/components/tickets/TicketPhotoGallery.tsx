import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ClipboardPaste,
  ImagePlus,
  Loader2,
  Trash2,
  AlertCircle,
  RotateCcw,
  X,
  Pencil,
  Check,
  Upload,
  MessageSquare,
  FileText,
} from 'lucide-react'
import type { AuthUser } from '../../contexts/AuthContext'
import type { Ticket } from '../../utils/ticketTypes'
import { isTempTicketId } from '../../utils/ticketDisplay'
import {
  MAX_TICKET_PHOTOS,
  type TicketPhoto,
  parseTicketPhotos,
  getTicketPhotosRaw,
  fetchLatestTicketPhotos,
  updateTicketPhotos,
  formatBytes,
} from '../../utils/ticketPhotos'
import {
  uploadTicketPhoto,
  removeTicketPhotoFiles,
  type UploadTicketPhotoResult,
} from '../../services/supabaseStorage'
import { ImageLightbox } from '../ImageLightbox'
import ConfirmDialog, { type ConfirmDialogState } from '../ConfirmDialog'

// ─── types & constants ────────────────────────────────────────────────────────

export const INSTALL_PHOTO_PRESETS = [
  'PR/SALES INVOICE',
  'SCHEMATIC',
  'QUOTATION FORM',
  'COCA',
  'NOA',
  'START UP',
  'STICKER',
  'INDOOR UNIT',
  'OUTDOOR UNIT',
  'SERVICE REPORT',
] as const

export const SERVICES_PHOTO_PRESETS = [
  'JOB ORDER',
  'SERVICE REPORT',
] as const

export function isInstallTicket(ticket?: Partial<Ticket> | null): boolean {
  if (!ticket) return false
  const cat = (ticket.ticketCategory || ticket.ticket_category || '').toUpperCase().trim()
  const st = (ticket.serviceType || ticket.service_type || '').toUpperCase().trim()
  const phase = ((ticket as any).schedulePhase || '').toUpperCase().trim()

  // Explicit non-install categories / service types
  if (['SERVICES', 'SURVEY', 'CLAIMS', 'HR_TASKS', 'ADMIN_TASK', 'PAYROLL_TASKS', 'REQUEST_FOR_FUND'].includes(cat)) return false
  if (st.includes('CLEANING') || st.includes('CHECKUP') || st.includes('REPAIR') || st.includes('SURVEY ONLY')) return false

  if (cat === 'INSTALLATION' || cat.includes('INSTALL') || cat === 'S/I' || cat === 'SI' || cat === 'SURVEY_AND_INSTALL' || cat === 'SURVEY_&_INSTALL') return true
  if (st.includes('INSTALL') || st.includes('S/I') || st.includes('SURVEY & INSTALL') || st.includes('SURVEY AND INSTALL')) return true
  if (phase.includes('INSTALL')) return true

  // Default for field tickets if category and service type are unassigned
  return !cat && !st
}

export function isServiceTicket(ticket?: Partial<Ticket> | null): boolean {
  if (!ticket) return false
  return !isInstallTicket(ticket)
}

/**
 * Which fixed holder each photo sits in. Photos remember their holder (`slot`); older photos
 * without one are matched to the preset with the same label, then to the first free holder.
 */
function assignPhotoSlots(list: TicketPhoto[], presets?: readonly string[]): Map<number, TicketPhoto> {
  const map = new Map<number, TicketPhoto>()
  const rest: TicketPhoto[] = []
  for (const p of list) {
    const s = p.slot
    if (typeof s === 'number' && Number.isInteger(s) && s >= 0 && s < MAX_TICKET_PHOTOS && !map.has(s)) map.set(s, p)
    else rest.push(p)
  }
  const leftover: TicketPhoto[] = []
  for (const p of rest) {
    const label = (p.description || '').trim().toUpperCase()
    const idx = presets && label ? presets.findIndex((preset, i) => !map.has(i) && (preset === label || label.startsWith(preset))) : -1
    if (idx >= 0) map.set(idx, p)
    else leftover.push(p)
  }
  for (const p of leftover) {
    for (let i = 0; i < MAX_TICKET_PHOTOS; i += 1) {
      if (!map.has(i)) { map.set(i, p); break }
    }
  }
  return map
}

/** Writes the resolved holder onto every photo, so deleting one never shifts the others. */
function withSlots(list: TicketPhoto[], presets?: readonly string[]): TicketPhoto[] {
  const slotOf = new Map<TicketPhoto, number>()
  assignPhotoSlots(list, presets).forEach((photo, slot) => slotOf.set(photo, slot))
  return list.map(p => (slotOf.has(p) ? { ...p, slot: slotOf.get(p) } : p))
}

type PendingStatus = 'uploading' | 'saving' | 'error'

interface PendingUpload {
  key: string
  /** The fixed holder this upload is filling. */
  slotIndex: number
  file: File
  previewUrl: string
  status: PendingStatus
  error?: string
  description?: string
}

/** An image the user has dropped/pasted but not yet uploaded. */
interface StagedSlot {
  key: string
  file: File
  previewUrl: string
  description: string
  slotIndex?: number
  validationError?: string
}

const IMAGE_NAME_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
const UPLOAD_CONCURRENCY = 4

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_NAME_RE.test(file.name)
}

/** True below Tailwind's `sm` breakpoint (the same point the photo grid drops to 2 columns). */
function useIsMobile(): boolean {
  const query = '(max-width: 639px)'
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

function formatUploadedAt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * Unified 10-slot photo grid for ticket attachments.
 * - For INSTALL tickets, slots are preset with standard required documentation:
 *   1. PR/SALES INVOICE, 2. SCHEMATIC, 3. QUOTATION FORM, 4. COCA, 5. NOA,
 *   6. START UP, 7. STICKER, 8. INDOOR UNIT, 9. OUTDOOR UNIT, 10. SERVICE REPORT.
 * - For SERVICES tickets (cleaning, checkup, repair, dismantle), slots #1 and #2 are pre-encoded
 *   as: 1. JOB ORDER, 2. SERVICE REPORT. Additional slots are available for extra job photos.
 */
export function TicketPhotoGallery({
  ticket,
  isLight,
  canManage,
  addOnly = false,
  user,
  branchLabel,
  onPhotosChange,
  variant = 'details',
  subtitle,
  isInstall: isInstallProp,
}: {
  ticket: Ticket
  isLight: boolean
  canManage: boolean
  /**
   * Empty holders still take uploads, but photos already attached can't be renamed or deleted —
   * the closed-ticket rule for non-admins (mirrors TicketService.onlyAddsPhotos on the backend).
   */
  addOnly?: boolean
  user: AuthUser | null
  branchLabel?: string
  onPhotosChange?: (photos: TicketPhoto[]) => void
  variant?: 'details' | 'form'
  subtitle?: string
  isInstall?: boolean
}) {
  const isInstall = isInstallProp !== undefined ? isInstallProp : isInstallTicket(ticket)
  const rawPhotos = getTicketPhotosRaw(ticket)

  const [photos, setPhotos] = useState<TicketPhoto[]>(() => parseTicketPhotos(rawPhotos))
  const [loading, setLoading] = useState(rawPhotos == null)
  const [staged, setStaged] = useState<StagedSlot[]>([])
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [editingPhoto, setEditingPhoto] = useState<TicketPhoto | null>(null)
  const [editDescDraft, setEditDescDraft] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null)
  const [globalDragOver, setGlobalDragOver] = useState(false)
  const isMobile = useIsMobile()

  const inputRef = useRef<HTMLInputElement>(null)
  /** The holder Ctrl+V pastes into. It stays put: once filled, pasting again is blocked, not advanced. */
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const activeSlotRef = useRef<number | null>(null)
  /** Holders reserved by uploads that are still running (updated synchronously, unlike state). */
  const claimedSlotsRef = useRef(new Set<number>())
  const photosRef = useRef(photos)
  const pendingRef = useRef(pending)
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => { pendingRef.current = pending }, [pending])

  // theme tokens
  const border = isLight ? '#cbd5e1' : '#1e293b'
  const cardBg = isLight ? '#ffffff' : '#0a1120'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const ticketId = ticket.id
  const slotPresets = isInstall ? INSTALL_PHOTO_PRESETS : SERVICES_PHOTO_PRESETS
  const ticketKey = ticket.ticketNumber || ticket.ticket_number || ticketId
  const canUpload = canManage && !!ticketId && !isTempTicketId(ticketId)
  const activePending = pending.filter(p => p.status !== 'error').length

  // ── fetch latest photos on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!ticketId || isTempTicketId(ticketId)) { setLoading(false); return }
    let cancelled = false
    setLoading(photosRef.current.length === 0)
    fetchLatestTicketPhotos(ticketId)
      .then(latest => { if (!cancelled && latest) setPhotos(latest) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticketId])

  // adopt payload handed in from outside (e.g. after another save)
  useEffect(() => {
    if (typeof rawPhotos === 'string') setPhotos(parseTicketPhotos(rawPhotos))
  }, [rawPhotos])

  // revoke preview URLs on unmount
  useEffect(() => () => {
    pendingRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl))
    staged.forEach(s => URL.revokeObjectURL(s.previewUrl))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // auto-hide success messages
  useEffect(() => {
    if (message?.kind !== 'ok') return
    const t = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(t)
  }, [message])

  // ── internal helpers ──────────────────────────────────────────────────────
  const applySaved = (saved: TicketPhoto[]) => {
    setPhotos(saved)
    onPhotosChange?.(saved)
  }

  const patchPending = (keys: string[], patch: Partial<PendingUpload>) =>
    setPending(prev => prev.map(p => keys.includes(p.key) ? { ...p, ...patch } : p))

  const dropPending = (keys: string[]) =>
    setPending(prev => {
      prev.filter(p => keys.includes(p.key)).forEach(p => {
        URL.revokeObjectURL(p.previewUrl)
        claimedSlotsRef.current.delete(p.slotIndex)
      })
      return prev.filter(p => !keys.includes(p.key))
    })

  // ── core upload logic (shared by all upload paths) ────────────────────────
  const processUploads = async (entries: PendingUpload[]) => {
    if (!entries.length) return
    patchPending(entries.map(e => e.key), { status: 'uploading', error: undefined })

    const results = new Map<string, UploadTicketPhotoResult>()
    const queue = [...entries]
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          results.set(entry.key, await uploadTicketPhoto(entry.file, { ticketKey, branch: branchLabel }))
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed'
          patchPending([entry.key], {
            status: 'error',
            error: /decode/i.test(msg) ? "This image format can't be read here — try a JPG or PNG." : msg,
          })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, entries.length) }, worker))

    const uploadedKeys = entries.map(e => e.key).filter(k => results.has(k))
    if (!uploadedKeys.length) return
    patchPending(uploadedKeys, { status: 'saving' })

    const now = new Date().toISOString()
    const newPhotos: TicketPhoto[] = uploadedKeys.map(key => {
      const r = results.get(key)!
      const orig = entries.find(e => e.key === key)
      return {
        id: r.path,
        url: r.url,
        thumbUrl: r.thumbUrl,
        path: r.path,
        thumbPath: r.thumbPath,
        size: r.size,
        originalSize: r.originalSize,
        width: r.width,
        height: r.height,
        uploadedAt: now,
        uploadedBy: user?.name || undefined,
        uploadedById: user?.id || undefined,
        description: orig?.description?.trim() || undefined,
        slot: orig?.slotIndex,
      }
    })

    let overflow: TicketPhoto[] = []
    try {
      const saved = await updateTicketPhotos(ticketId, photosRef.current, current => {
        const room = Math.max(0, MAX_TICKET_PHOTOS - current.length)
        overflow = newPhotos.slice(room)
        const base = withSlots(current, slotPresets)
        const taken = new Set(base.map(p => p.slot))
        const added = newPhotos.slice(0, room).map(p => {
          // Someone else filled this holder while we were uploading — take the next free one.
          if (p.slot != null && !taken.has(p.slot)) { taken.add(p.slot); return p }
          const free = Array.from({ length: MAX_TICKET_PHOTOS }, (_, i) => i).find(i => !taken.has(i))
          if (free != null) taken.add(free)
          return { ...p, slot: free }
        })
        return [...base, ...added]
      })
      applySaved(saved)
      if (overflow.length) void removeTicketPhotoFiles(overflow.flatMap(p => [p.path || '', p.thumbPath || '']))
      const keptCount = newPhotos.length - overflow.length
      const before = newPhotos.slice(0, keptCount).reduce((s, p) => s + (p.originalSize || 0), 0)
      const after  = newPhotos.slice(0, keptCount).reduce((s, p) => s + (p.size || 0), 0)
      dropPending(uploadedKeys)
      setMessage(overflow.length
        ? { kind: 'error', text: `Only ${keptCount} photo${keptCount === 1 ? '' : 's'} added — reached the ${MAX_TICKET_PHOTOS}-photo limit.` }
        : { kind: 'ok',   text: `${keptCount} photo${keptCount === 1 ? '' : 's'} added · ${formatBytes(before)} → ${formatBytes(after)}` })
    } catch (err) {
      void removeTicketPhotoFiles(newPhotos.flatMap(p => [p.path || '', p.thumbPath || '']))
      patchPending(uploadedKeys, { status: 'error', error: err instanceof Error ? err.message : 'Failed to save photos' })
    }
  }

  // ── auto-upload on attach or paste (no click upload button) ────────────────
  const slotLabel = (i: number) => (slotPresets?.[i] ? `#${i + 1} ${slotPresets[i]}` : `#${i + 1}`)

  /** Holders that already have a photo or an upload in flight. */
  const occupiedSlots = (): Set<number> => {
    const set = new Set<number>(assignPhotoSlots(photosRef.current, slotPresets).keys())
    claimedSlotsRef.current.forEach(i => set.add(i))
    return set
  }

  const selectSlot = (i: number | null) => {
    activeSlotRef.current = i
    setActiveSlot(i)
  }

  /**
   * Photo holders are fixed: a file goes into one specific holder and never shifts anything.
   *  - `targetSlotIndex`: the holder the person dropped on / clicked.
   *  - `fromPaste`: Ctrl+V goes to the selected holder (or the first free one). Pasting again while
   *    that holder is filled is blocked — it does NOT roll on into the next holder.
   */
  const addFiles = (fileList: FileList | File[] | null, targetSlotIndex?: number, fromPaste = false) => {
    const files = Array.from(fileList || []).filter(isImageFile)
    if (!files.length || !canUpload || !ticketId) return
    const occupied = occupiedSlots()
    const free = Array.from({ length: MAX_TICKET_PHOTOS }, (_, i) => i).filter(i => !occupied.has(i))

    const slots: number[] = []
    let first: number | null = targetSlotIndex ?? (fromPaste ? (activeSlotRef.current ?? free[0] ?? null) : null)
    if (first != null) {
      if (occupied.has(first)) {
        setMessage({ kind: 'error', text: `Holder ${slotLabel(first)} already has a photo. Select an empty holder, or delete that photo first.` })
        return
      }
      slots.push(first)
    }
    for (const i of free) {
      if (slots.length >= files.length) break
      if (!slots.includes(i)) slots.push(i)
    }
    if (!slots.length) {
      setMessage({ kind: 'error', text: `This ticket already has ${MAX_TICKET_PHOTOS} photos. Delete one to add more.` })
      return
    }
    const accepted = files.slice(0, slots.length)
    first = slots[0]

    const newEntries: PendingUpload[] = accepted.map((file, i) => {
      const slotIndex = slots[i]
      claimedSlotsRef.current.add(slotIndex)
      const presetDesc = slotPresets?.[slotIndex] || ''
      const defaultDesc = presetDesc || (isInstall ? 'PR/SALES INVOICE' : 'PHOTO')
      return {
        key: `up-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        slotIndex,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'uploading' as const,
        description: defaultDesc.toUpperCase(),
      }
    })
    // A paste/drop on a holder keeps that holder selected, so a repeat is blocked rather than moved on.
    if (targetSlotIndex != null || fromPaste) selectSlot(first)

    setPending(prev => [...prev, ...newEntries])
    if (files.length > accepted.length) {
      setMessage({ kind: 'error', text: `Only ${accepted.length} holder${accepted.length === 1 ? '' : 's'} free (max ${MAX_TICKET_PHOTOS}). Extra files were skipped.` })
    } else {
      setMessage(null)
    }

    void processUploads(newEntries)
  }

  // Auto-flush any remaining staged slots to upload immediately
  useEffect(() => {
    if (staged.length > 0 && canUpload && ticketId) {
      const entriesToUpload: PendingUpload[] = staged.map(slot => ({
        key: `up-${slot.key}`,
        slotIndex: slot.slotIndex ?? 0,
        file: slot.file,
        previewUrl: slot.previewUrl,
        status: 'uploading' as const,
        description: slot.description.trim().toUpperCase() || 'PHOTO',
      }))
      setStaged([])
      setPending(prev => [...prev, ...entriesToUpload])
      void processUploads(entriesToUpload)
    }
  }, [staged, canUpload, ticketId])

  // Global window paste handler so pressing Ctrl+V anywhere uploads immediately
  useEffect(() => {
    if (!canUpload || !ticketId) return
    const handleWindowPaste = (e: ClipboardEvent) => {
      // A holder that is focused handles its own paste (and calls preventDefault) — don't add it twice.
      if (e.defaultPrevented) return
      const items = Array.from(e.clipboardData?.items || [])
      const imageItems = items.filter(it => it.type.startsWith('image/'))
      if (!imageItems.length) return
      e.preventDefault()
      const files: File[] = []
      imageItems.forEach((it, idx) => {
        const file = it.getAsFile()
        if (file) {
          files.push(new File([file], `pasted-${Date.now()}-${idx}.${it.type.split('/')[1] || 'jpg'}`, { type: it.type }))
        }
      })
      if (files.length) {
        addFiles(files, undefined, true)
      }
    }
    window.addEventListener('paste', handleWindowPaste)
    return () => window.removeEventListener('paste', handleWindowPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUpload, ticketId, photos, pending, isInstall])

  const clearSlot = (key: string) => {
    setStaged(prev => {
      const found = prev.find(s => s.key === key)
      if (found) URL.revokeObjectURL(found.previewUrl)
      return prev.filter(s => s.key !== key)
    })
  }

  const uploadSlot = async (key: string) => {
    const slot = staged.find(s => s.key === key)
    if (!slot || !ticketId) return
    const entry: PendingUpload = {
      key: `up-${key}`,
      file: slot.file,
      previewUrl: slot.previewUrl,
      status: 'uploading',
      slotIndex: slot.slotIndex ?? 0,
      description: (slot.description.trim() || 'PHOTO').toUpperCase(),
    }
    setStaged(prev => prev.filter(s => s.key !== key))
    setPending(prev => [...prev, entry])
    await processUploads([entry])
  }

  // ── delete / edit description ──────────────────────────────────────────────
  const deletePhoto = async (photo: TicketPhoto) => {
    setDeletingId(photo.id)
    setMessage(null)
    try {
      const saved = await updateTicketPhotos(ticketId, photosRef.current, current =>
        withSlots(current, slotPresets).filter(p => p.id !== photo.id && p.url !== photo.url))
      applySaved(saved)
      void removeTicketPhotoFiles([photo.path || '', photo.thumbPath || ''])
      setLightboxIndex(null)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to delete photo' })
    } finally {
      setDeletingId(null)
    }
  }

  const askDelete = (photo: TicketPhoto) => {
    setConfirm({
      title: 'Delete photo?',
      message: 'This photo will be removed from the ticket for everyone.',
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: () => { void deletePhoto(photo) },
    })
  }

  const startEditDescription = (photo: TicketPhoto) => {
    setEditingPhoto(photo)
    setEditDescDraft(photo.description || (isInstall ? 'PR/SALES INVOICE' : (slotPresets?.[0] || '')))
  }

  /** Preset titles already on a different photo — each preset may only label one photo. */
  const presetsTakenByOthers = (photo: TicketPhoto): Set<string> => {
    const presets: readonly string[] = slotPresets
    const taken = new Set<string>()
    for (const p of photosRef.current) {
      if (p.id === photo.id || p.url === photo.url) continue
      const d = (p.description || '').trim().toUpperCase()
      if (d && presets.includes(d)) taken.add(d)
    }
    return taken
  }

  /** Saves a photo's title (shared by the inline title field and the edit modal). Resolves true on success. */
  const persistDescription = async (photo: TicketPhoto, raw: string): Promise<boolean> => {
    const nextDesc = raw.trim().toUpperCase() || undefined
    if (nextDesc && presetsTakenByOthers(photo).has(nextDesc)) {
      setMessage({ kind: 'error', text: `"${nextDesc}" is already used by another photo on this ticket.` })
      return false
    }
    try {
      const saved = await updateTicketPhotos(ticketId, photosRef.current, current =>
        withSlots(current, slotPresets).map(p => (p.id === photo.id || p.url === photo.url ? { ...p, description: nextDesc } : p)))
      applySaved(saved)
      setMessage({ kind: 'ok', text: nextDesc ? 'Description updated.' : 'Description removed.' })
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to save description' })
      return false
    }
  }

  const saveEditedDescription = async () => {
    if (!editingPhoto) return
    setSavingDesc(true)
    const ok = await persistDescription(editingPhoto, editDescDraft)
    setSavingDesc(false)
    if (ok) setEditingPhoto(null)
  }

  // ── global drop zone on the entire gallery ────────────────────────────────
  const globalDropProps = canUpload ? {
    onDragOver:  (e: React.DragEvent) => { e.preventDefault(); setGlobalDragOver(true) },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setGlobalDragOver(false) },
    onDrop:      (e: React.DragEvent) => { e.preventDefault(); setGlobalDragOver(false); addFiles(e.dataTransfer.files) },
  } : {}

  const tileStyle = { backgroundColor: inputBg, border: `1px solid ${border}` }

  // ── how many empty placeholder cells to show ──────────────────────────────
  const usedSlots = photos.length + staged.length + activePending
  const slotMap = assignPhotoSlots(photos, slotPresets)
  const pendingBySlot = new Map(pending.map(p => [p.slotIndex, p]))

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      {...globalDropProps}
      className={`rounded-xl transition-all ${globalDragOver ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5' : ''}`}
    >
      {/* ── section header ─────────────────────────────────────────────── */}
      {variant === 'form' ? (
        <div className="flex items-center justify-between gap-2 border-b pb-2.5 mb-4" style={{ borderColor: border }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">Photos</p>
                {isInstall ? (
                  <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
                    Installation Checklist Preset
                  </span>
                ) : (
                  <span className="text-[8.5px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25">
                    Services Preset (Job Order &amp; Service Report)
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[10px] font-semibold text-slate-400 leading-tight mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <span className="text-xs font-black px-2.5 py-0.5 rounded-lg border shrink-0"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10B981' }}>
            {photos.length}/{MAX_TICKET_PHOTOS}
          </span>
        </div>
      ) : (
        <div className="pt-2 border-b pb-2 mb-3 flex items-center justify-between gap-2" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">
              Photos <span style={{ color: textMuted }}>{photos.length}/{MAX_TICKET_PHOTOS}</span>
            </p>
            {isInstall ? (
              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 border border-emerald-500/25">
                Install Preset
              </span>
            ) : (
              <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/25">
                Services Preset (2 Holders)
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── hidden file input for click-to-browse ─────────────────────────── */}
      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
      )}

      {/* ── loading state ─────────────────────────────────────────────────── */}
      {loading && usedSlots === 0 ? (
        <div className="flex items-center gap-2 text-xs rounded-xl p-4" style={{ ...tileStyle, color: textMuted }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading photos…
        </div>
      ) : (
        <>
          {/* drag-hint strip */}
          {canUpload && (
            <p className="text-[10px] mb-2" style={{ color: textMuted }}>
              {isInstall
                ? 'Attach images to the corresponding preset slots below or drag and drop anywhere.'
                : 'Attach Job Order and Service Report to preset slots #1 and #2, or drag and drop anywhere.'}
              {addOnly && ' This ticket is closed — you can add photos, but only the administrator can rename or remove them.'}
            </p>
          )}

          {/* ── unified 10-slot grid ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

            {/* Fixed holders: every slot keeps its position — a photo never moves to another holder. */}
            {Array.from({ length: MAX_TICKET_PHOTOS }).map((_, slotIdx) => {
              const photo = slotMap.get(slotIdx)
              if (photo) {
                return (
                  <UploadedPhotoCell
                    key={`slot-${slotIdx}-${photo.id}`}
                    photo={photo}
                    index={Math.max(0, photos.indexOf(photo))}
                    canManage={canManage && !addOnly}
                    deletingId={deletingId}
                    tileStyle={tileStyle}
                    presets={slotPresets}
                    takenPresets={presetsTakenByOthers(photo)}
                    cardBg={cardBg}
                    border={border}
                    textPrimary={textPrimary}
                    textMuted={textMuted}
                    onView={() => setLightboxIndex(Math.max(0, photos.indexOf(photo)))}
                    onEdit={() => startEditDescription(photo)}
                    onDelete={() => askDelete(photo)}
                    onRename={(desc) => persistDescription(photo, desc)}
                  />
                )
              }
              const p = pendingBySlot.get(slotIdx)
              if (p) {
                return (
                  <div key={p.key} className="relative aspect-square rounded-xl overflow-hidden" style={tileStyle}>
                    <img src={p.previewUrl} alt="" className="w-full h-full object-cover opacity-40" draggable={false} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5 text-center">
                      {p.status === 'error' ? (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span className="text-[9px] font-bold text-red-500 line-clamp-3">{p.error}</span>
                          <div className="flex gap-1 mt-0.5">
                            <button type="button" onClick={() => void processUploads([p])}
                              className="w-6 h-6 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-emerald-600"
                              aria-label="Retry" title="Retry">
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            <button type="button" onClick={() => dropPending([p.key])}
                              className="w-6 h-6 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-red-600"
                              aria-label="Dismiss" title="Dismiss">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: textPrimary }}>
                            {p.status === 'saving' ? 'Saving…' : 'Uploading…'}
                          </span>
                          {p.description && (
                            <span className="text-[8.5px] font-semibold text-emerald-400/90 truncate max-w-[90%]">
                              {p.description}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              }
              const preset = slotPresets?.[slotIdx]
              if (canUpload) {
                return (
                  <EmptySlotCell
                    key={`empty-${slotIdx}`}
                    slotIndex={slotIdx}
                    presetLabel={preset}
                    active={activeSlot === slotIdx}
                    border={border}
                    textMuted={textMuted}
                    textPrimary={textPrimary}
                    onActivate={() => selectSlot(slotIdx)}
                    onFiles={(files) => addFiles(files, slotIdx)}
                  />
                )
              }
              // Read-only: keep the holder in place so photos sit in the same spot as when editing.
              return preset ? (
                <div
                  key={`empty-${slotIdx}`}
                  className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-0.5 p-1.5 text-center select-none"
                  style={{ borderColor: border, color: textMuted }}
                >
                  <span className="text-[8.5px] font-black uppercase tracking-wider">#{slotIdx + 1}</span>
                  <span className="text-[9.5px] font-black uppercase leading-tight line-clamp-2">{preset}</span>
                  <span className="text-[8px] font-bold uppercase opacity-60">No photo</span>
                </div>
              ) : null
            })}

            {/* Legacy staged uploads (normally flushed immediately) */}
            {staged.map((slot, i) => {
              const slotIdx = slot.slotIndex ?? (photos.length + i)
              const preset = slotPresets?.[slotIdx]
              return (
                <StagedSlotCell
                  key={slot.key}
                  slot={slot}
                  slotIndex={slotIdx}
                  presetLabel={preset}
                  tileStyle={tileStyle}
                  border={border}
                  cardBg={cardBg}
                  textPrimary={textPrimary}
                  onDescChange={(val) =>
                    setStaged(prev => prev.map(st => st.key === slot.key ? { ...st, description: val, validationError: undefined } : st))
                  }
                  onUpload={() => void uploadSlot(slot.key)}
                  onClear={() => clearSlot(slot.key)}
                />
              )
            })}
          </div>

          {/* ── global empty call-to-action (no photos at all yet) ─────────── */}
          {usedSlots === 0 && !canUpload && (
            <p className="text-xs rounded-xl p-4" style={{ ...tileStyle, color: textMuted }}>No photos attached.</p>
          )}
        </>
      )}

      {/* ── status message ────────────────────────────────────────────────── */}
      {message && (
        <p className={`mt-2 text-[11px] font-semibold ${message.kind === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {/* ── edit description modal (for already-uploaded photos) ──────────── */}
      {editingPhoto && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !savingDesc && setEditingPhoto(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-2xl flex flex-col gap-4 border"
            style={{ backgroundColor: cardBg, borderColor: border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: border }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <h4 className="text-xs font-black tracking-tight" style={{ color: textPrimary }}>
                  Edit Photo Description
                </h4>
              </div>
              <button
                type="button"
                disabled={savingDesc}
                onClick={() => setEditingPhoto(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                style={{ color: textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isMobile && (
              <div className="w-full h-32 shrink-0 rounded-xl overflow-hidden border flex items-center justify-center bg-black/80" style={{ borderColor: border }}>
                <img src={editingPhoto.url || editingPhoto.thumbUrl} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <div className="flex items-center gap-3">
              {!isMobile && (
                <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: border }}>
                  <img src={editingPhoto.thumbUrl || editingPhoto.url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate" style={{ color: textPrimary }}>
                  {editingPhoto.uploadedBy || 'Uploaded Photo'}
                </p>
                <p className="text-[10px]" style={{ color: textMuted }}>
                  {formatUploadedAt(editingPhoto.uploadedAt)} · {formatBytes(editingPhoto.size)}
                </p>
              </div>
            </div>

            {slotPresets && slotPresets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  {isInstall ? 'Quick Install Presets' : 'Quick Services Presets'}
                </label>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {slotPresets.map((p) => {
                    const taken = presetsTakenByOthers(editingPhoto).has(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        disabled={taken}
                        title={taken ? 'Already used by another photo' : undefined}
                        onClick={() => setEditDescDraft(p)}
                        className={`px-2 py-1 rounded text-[9.5px] font-bold border transition-colors ${
                          editDescDraft === p
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : taken
                              ? 'bg-slate-500/10 text-slate-400 border-slate-500/20 line-through cursor-not-allowed opacity-60'
                              : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>
                Description / Note
              </label>
              {isMobile ? (
                // contenteditable, not <input>: iOS only attaches its ▲▼✓ form-assistant bar to real form controls.
                // On phones the field isn't auto-focused so the keyboard doesn't cover the presets.
                <PlainEditable
                  value={editDescDraft}
                  onChange={setEditDescDraft}
                  onEnter={() => void saveEditedDescription()}
                  placeholder={isInstall ? 'e.g. PR/SALES INVOICE, SCHEMATIC, INDOOR UNIT…' : 'e.g. JOB ORDER, SERVICE REPORT…'}
                  className="w-full min-h-[2.75rem] text-base font-semibold p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 uppercase break-words"
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                />
              ) : (
                <input
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder={isInstall ? "e.g. PR/SALES INVOICE, SCHEMATIC, INDOOR UNIT…" : "e.g. JOB ORDER, SERVICE REPORT…"}
                  value={editDescDraft}
                  onChange={(e) => setEditDescDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveEditedDescription() } }}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 uppercase"
                  style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3" style={{ borderColor: border }}>
              <button
                type="button"
                disabled={savingDesc}
                onClick={() => setEditingPhoto(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors hover:bg-slate-500/10 disabled:opacity-50"
                style={{ color: textMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDesc}
                onClick={saveEditedDescription}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {savingDesc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── lightbox ──────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <ImageLightbox
          images={photos.map(p => ({
            src: p.url,
            placeholderSrc: p.thumbUrl,
            alt: p.description || 'Ticket photo',
            caption: [
              p.description ? `"${p.description}"` : '',
              p.uploadedBy ? `By ${p.uploadedBy}` : '',
              formatUploadedAt(p.uploadedAt),
              p.size ? formatBytes(p.size) : '',
            ].filter(Boolean).join(' · '),
          }))}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <ConfirmDialog dialog={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** Already-uploaded photo tile with hover overlay + edit/delete buttons. */
function UploadedPhotoCell({
  photo, index, canManage, deletingId,
  tileStyle, presets, takenPresets, cardBg, border, textPrimary, textMuted,
  onView, onEdit, onDelete, onRename,
}: {
  photo: TicketPhoto
  index: number
  canManage: boolean
  deletingId: string | null
  tileStyle: React.CSSProperties
  presets: readonly string[]
  takenPresets: ReadonlySet<string>
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  onView: () => void
  onEdit: () => void
  onDelete: () => void
  onRename: (description: string) => Promise<boolean>
}) {
  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden transition-all duration-200" style={tileStyle}>
      <button
        type="button"
        onClick={onView}
        className="w-full h-full cursor-zoom-in relative block"
        aria-label={`View photo ${index + 1}: ${photo.description || 'No description'}`}
      >
        <img
          src={photo.thumbUrl || photo.url}
          alt={photo.description || `Photo ${index + 1}`}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          draggable={false}
        />
        {!canManage && photo.description && (
          <div
            className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-emerald-400 flex items-center gap-1 border border-emerald-500/30 group-hover:opacity-0 transition-opacity max-w-[90%]"
            title={photo.description}
          >
            <MessageSquare className="w-2.5 h-2.5 shrink-0" />
            <span className="text-[8.5px] font-black uppercase truncate">{photo.description}</span>
          </div>
        )}
      </button>

      {/* Hover overlay */}
      <div
        onClick={onView}
        className={`absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none flex flex-col justify-end ${canManage ? 'pb-9' : ''}`}
      >
        {canManage ? null : photo.description ? (
          <div className="flex items-start gap-1">
            <FileText className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[10px] font-black leading-tight text-emerald-300 line-clamp-3 select-none uppercase">{photo.description}</p>
          </div>
        ) : (
          <p className="text-[9.5px] font-medium text-slate-300/80 italic select-none">No description</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-[8.5px] text-slate-400 select-none">
          {photo.uploadedBy && <span className="truncate">{photo.uploadedBy}</span>}
          {photo.size ? <span>· {formatBytes(photo.size)}</span> : null}
        </div>
      </div>

      {/* Editable title with preset picker */}
      {canManage && (
        <PhotoTitleField
          value={photo.description || ''}
          presets={presets}
          takenPresets={takenPresets}
          cardBg={cardBg}
          border={border}
          textPrimary={textPrimary}
          textMuted={textMuted}
          onCommit={onRename}
          onOpenPopup={onEdit}
        />
      )}

      {/* Action buttons */}
      {canManage && (
        <div className="absolute top-1 right-1 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-black/75 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-md ring-1 ring-white/20"
            title={photo.description ? "Edit photo title" : "Add photo title"} aria-label="Edit photo title"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={deletingId === photo.id}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-black/75 text-white hover:bg-red-600 active:scale-95 transition-all shadow-md ring-1 ring-white/20"
            title="Remove photo" aria-label="Remove photo"
          >
            {deletingId === photo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Photo title shown on the tile as an editable text field. Focusing it opens the preset list
 * (pick one, or type anything); Enter / blur / picking a preset saves, Escape cancels.
 */
function PhotoTitleField({
  value, presets, takenPresets, cardBg, border, textPrimary, textMuted, onCommit, onOpenPopup,
}: {
  value: string
  presets: readonly string[]
  /** Presets already labelling another photo — shown disabled. */
  takenPresets: ReadonlySet<string>
  cardBg: string
  border: string
  textPrimary: string
  textMuted: string
  onCommit: (description: string) => Promise<boolean>
  /** Mobile: tapping the title opens the centered edit popup instead of editing inline. */
  onOpenPopup: () => void
}) {
  const isMobile = useIsMobile()
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Set when a preset was picked or Escape pressed, so the blur that follows doesn't save the old draft. */
  const skipBlurRef = useRef(false)

  const commit = async (next: string) => {
    setOpen(false)
    const clean = next.trim().toUpperCase()
    if (clean === value.trim().toUpperCase()) return
    setSaving(true)
    await onCommit(clean)
    setSaving(false)
  }

  const shown = open ? draft : value

  if (isMobile) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenPopup() }}
        aria-label={`Edit photo title: ${value || 'none'}`}
        className="absolute bottom-1 inset-x-1 z-20 flex items-center gap-1 pl-1.5 pr-1.5 py-1 rounded-md bg-black/75 backdrop-blur-sm border border-emerald-500/30 text-left active:scale-[0.98] transition-transform"
      >
        <MessageSquare className="w-2.5 h-2.5 shrink-0 text-emerald-400" />
        <span className={`text-[9px] font-black truncate ${value ? 'uppercase text-emerald-400' : 'text-slate-400 font-semibold'}`}>
          {value || 'Add title…'}
        </span>
        <Pencil className="w-2.5 h-2.5 shrink-0 ml-auto text-slate-400" />
      </button>
    )
  }

  return (
    <div className="absolute bottom-1 inset-x-1 z-20" onClick={(e) => e.stopPropagation()}>
      {open && presets.length > 0 && (
        <div
          className="absolute bottom-full mb-1 inset-x-0 overflow-y-auto rounded-lg border shadow-xl p-1 flex flex-col gap-0.5"
          style={{ backgroundColor: cardBg, borderColor: border, maxHeight: '9rem' }}
          // keep focus in the input so a click on a preset isn't swallowed by the blur
          onMouseDown={(e) => e.preventDefault()}
        >
          {presets.map(p => {
            const taken = takenPresets.has(p)
            return (
              <button
                key={p}
                type="button"
                disabled={taken}
                title={taken ? 'Already used by another photo' : undefined}
                onClick={() => { skipBlurRef.current = true; inputRef.current?.blur(); void commit(p) }}
                className={`text-left px-2 py-1 rounded text-[9.5px] font-black uppercase tracking-tight transition-colors ${
                  value.trim().toUpperCase() === p ? 'bg-emerald-600 text-white'
                    : taken ? 'opacity-40 line-through cursor-not-allowed' : 'hover:bg-emerald-500/15'
                }`}
                style={value.trim().toUpperCase() === p ? undefined : { color: textPrimary }}
              >
                {p}
              </button>
            )
          })}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={shown}
          disabled={saving}
          placeholder="Add title…"
          aria-label="Photo title"
          onFocus={() => { setDraft(value); setOpen(true) }}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={() => {
            if (skipBlurRef.current) { skipBlurRef.current = false; setOpen(false); return }
            void commit(draft)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); inputRef.current?.blur() }
            else if (e.key === 'Escape') { skipBlurRef.current = true; inputRef.current?.blur() }
          }}
          className="w-full pl-1.5 pr-5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[8.5px] font-black uppercase text-emerald-400 placeholder:text-slate-400 placeholder:normal-case border border-emerald-500/30 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60"
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: textMuted }}>
          {saving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <MessageSquare className="w-2.5 h-2.5" />}
        </span>
      </div>
    </div>
  )
}

/**
 * Single-line plain-text field built on contenteditable. Used instead of <input> on iOS so the system
 * ▲▼✓ form-assistant bar doesn't appear above the keyboard. Display is uppercased with CSS (the saved
 * value is uppercased on save), so the caret never jumps while typing.
 */
function PlainEditable({
  value, onChange, onEnter, placeholder, className, style,
}: {
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  placeholder: string
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Push outside changes (e.g. a preset chip) into the DOM; skip when it already matches so typing isn't disturbed.
  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) ref.current.textContent = value
  }, [value])
  return (
    <div
      ref={ref}
      role="textbox"
      aria-label="Photo title"
      // "plaintext-only" strips pasted formatting; Safari 16+/Chrome support it
      contentEditable={'plaintext-only' as unknown as boolean}
      suppressContentEditableWarning
      spellCheck={false}
      autoCapitalize="characters"
      enterKeyHint="done"
      data-placeholder={placeholder}
      onInput={(e) => onChange((e.currentTarget.textContent || '').replace(/\s+/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter() } }}
      className={`${className ?? ''} empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:normal-case empty:before:font-normal`}
      style={style}
    />
  )
}

/** Staged slot: image dropped but not yet uploaded. Has inline text field + Upload button. */
function StagedSlotCell({
  slot, slotIndex, presetLabel, tileStyle, border, cardBg, textPrimary,
  onDescChange, onUpload, onClear,
}: {
  slot: StagedSlot
  slotIndex?: number
  presetLabel?: string
  tileStyle: React.CSSProperties
  border: string
  cardBg: string
  textPrimary: string
  onDescChange: (val: string) => void
  onUpload: () => void
  onClear: () => void
}) {
  const hasError = !!slot.validationError
  return (
    <div
      className="relative flex flex-col rounded-xl overflow-hidden border-2"
      style={{ borderColor: hasError ? '#ef4444' : 'rgba(16,185,129,0.4)', backgroundColor: tileStyle.backgroundColor }}
    >
      {/* Image preview */}
      <div className="relative aspect-square w-full overflow-hidden">
        <img src={slot.previewUrl} alt="" className="w-full h-full object-cover" draggable={false} />
        {/* X button */}
        <button
          type="button"
          onClick={onClear}
          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center bg-black/70 text-white hover:bg-red-600 transition-colors z-10"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
        {/* Badge */}
        <span className="absolute top-1 left-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-600 text-white truncate max-w-[85%]">
          {presetLabel ? `${slotIndex != null ? `#${slotIndex + 1} ` : ''}${presetLabel}` : 'New'}
        </span>
      </div>

      {/* Text field + validation */}
      <div className="flex flex-col gap-1 p-1.5">
        <input
          type="text"
          placeholder={presetLabel || "Add a description…"}
          value={slot.description}
          onChange={(e) => onDescChange(e.target.value)}
          className="w-full text-[10.5px] font-semibold px-2 py-1 rounded-lg border outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all uppercase"
          style={{
            backgroundColor: cardBg,
            borderColor: hasError ? '#ef4444' : border,
            color: textPrimary,
          }}
        />
        {hasError && (
          <p className="text-[9px] font-bold text-red-500 flex items-center gap-0.5">
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
            {slot.validationError}
          </p>
        )}

        {/* Upload button */}
        <button
          type="button"
          onClick={onUpload}
          className="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all"
        >
          <Upload className="w-2.5 h-2.5" />
          Upload
        </button>
      </div>
    </div>
  )
}

/** Empty slot — acts as a drop target and click-to-browse button with preset label for install tickets. */
function EmptySlotCell({
  slotIndex, presetLabel, active, border, textMuted, textPrimary, onActivate, onFiles,
}: {
  slotIndex?: number
  presetLabel?: string
  /** This is the holder Ctrl+V will paste into. */
  active?: boolean
  border: string
  textMuted: string
  textPrimary: string
  onActivate?: () => void
  onFiles: (files: FileList | File[]) => void
}) {
  const [over, setOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setOver(true) }
  const handleDragLeave = () => setOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    onFiles(e.dataTransfer.files)
  }
  const [pasteHint, setPasteHint] = useState('')
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imgItem = items.find(it => it.type.startsWith('image/'))
    if (imgItem) {
      const file = imgItem.getAsFile()
      e.preventDefault() // this holder owns the paste; the window-level handler must not add it again
      if (file) onFiles([file])
    }
  }
  // Button path: read the clipboard directly (needs a click + the browser's clipboard permission).
  const pasteFromClipboard = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setPasteHint('')
    try {
      const entries = await navigator.clipboard.read()
      for (const entry of entries) {
        const type = entry.types.find(t => t.startsWith('image/'))
        if (type) {
          const blob = await entry.getType(type)
          onFiles([new File([blob], `pasted-${Date.now()}.${type.split('/')[1] || 'png'}`, { type })])
          return
        }
      }
      setPasteHint('No image on clipboard')
    } catch {
      setPasteHint('Allow clipboard access, or press Ctrl+V')
    }
    window.setTimeout(() => setPasteHint(''), 3500)
  }
  const pasteBtn = (
    <button
      type="button"
      onClick={pasteFromClipboard}
      onKeyDown={e => e.stopPropagation()}
      className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-wider transition-colors hover:bg-emerald-500/10 hover:border-emerald-500 hover:text-emerald-600"
      style={{ borderColor: border, color: textMuted }}
      title="Paste an image from your clipboard"
    >
      <ClipboardPaste className="w-3 h-3" /> Paste
    </button>
  )
  const hintEl = pasteHint ? <span className="text-[8px] font-semibold text-red-500 text-center px-1 leading-tight">{pasteHint}</span> : null

  return (
    <div
      onClick={() => { onActivate?.(); fileInputRef.current?.click() }}
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
      className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-150 relative cursor-pointer group hover:border-emerald-500"
      style={{
        borderColor: over || active ? '#10B981' : border,
        backgroundColor: over ? 'rgba(16,185,129,0.08)' : 'transparent',
        boxShadow: active ? '0 0 0 2px rgba(16,185,129,0.25)' : undefined,
      }}
      aria-label={presetLabel ? `Attach photo: ${presetLabel}` : "Add photo"}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />
      {presetLabel ? (
        <div className="flex flex-col items-center justify-center p-1.5 text-center h-full w-full gap-0.5 select-none">
          <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 leading-none">
            {slotIndex != null ? `#${slotIndex + 1}` : ''}
          </span>
          <ImagePlus className="w-4 h-4 mt-0.5 transition-transform group-hover:scale-110" style={{ color: over ? '#10B981' : textMuted }} />
          <span className="text-[9.5px] font-black uppercase tracking-tight leading-tight px-1 text-center line-clamp-2" style={{ color: over ? '#10B981' : textPrimary }}>
            {presetLabel}
          </span>
          <span className="text-[8px] font-bold opacity-60 uppercase tracking-wider" style={{ color: textMuted }}>
            {over ? 'Drop here' : 'Attach'}
          </span>
          {pasteBtn}
          {hintEl}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1 select-none">
          <ImagePlus className="w-5 h-5 transition-transform group-hover:scale-110" style={{ color: over ? '#10B981' : textMuted }} />
          <span className="text-[9px] font-bold" style={{ color: over ? '#10B981' : textPrimary }}>
            {over ? 'Drop here' : 'Add photo'}
          </span>
          {pasteBtn}
          {hintEl}
        </div>
      )}
    </div>
  )
}
