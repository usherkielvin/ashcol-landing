import { useEffect, useRef, useState } from 'react'
import {
  Camera,
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

// ─── types ────────────────────────────────────────────────────────────────────

type PendingStatus = 'uploading' | 'saving' | 'error'

interface PendingUpload {
  key: string
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
  validationError?: string
}

const IMAGE_NAME_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i
const UPLOAD_CONCURRENCY = 2

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_NAME_RE.test(file.name)
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
 * Drop / paste / click any empty slot to stage an image.
 * Each staged slot shows a preview + required text field + Upload button.
 * Already-uploaded photos appear first with edit/delete controls.
 */
export function TicketPhotoGallery({
  ticket,
  isLight,
  canManage,
  user,
  branchLabel,
  onPhotosChange,
  variant = 'details',
  subtitle,
}: {
  ticket: Ticket
  isLight: boolean
  canManage: boolean
  user: AuthUser | null
  branchLabel?: string
  onPhotosChange?: (photos: TicketPhoto[]) => void
  variant?: 'details' | 'form'
  subtitle?: string
}) {
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

  const inputRef = useRef<HTMLInputElement>(null)
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
  const ticketKey = ticket.ticketNumber || ticket.ticket_number || ticketId
  const canUpload = canManage && !!ticketId && !isTempTicketId(ticketId)
  const activePending = pending.filter(p => p.status !== 'error').length
  const slotsLeft = MAX_TICKET_PHOTOS - photos.length - staged.length - activePending

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
      prev.filter(p => keys.includes(p.key)).forEach(p => URL.revokeObjectURL(p.previewUrl))
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
      }
    })

    let overflow: TicketPhoto[] = []
    try {
      const saved = await updateTicketPhotos(ticketId, photosRef.current, current => {
        const room = Math.max(0, MAX_TICKET_PHOTOS - current.length)
        overflow = newPhotos.slice(room)
        return [...current, ...newPhotos.slice(0, room)]
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

  // ── staging helpers ───────────────────────────────────────────────────────
  const addFiles = (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter(isImageFile)
    if (!files.length || !canUpload) return
    const take = Math.max(0, slotsLeft)
    if (take === 0) {
      setMessage({ kind: 'error', text: `This ticket already has ${MAX_TICKET_PHOTOS} photos. Delete one to add more.` })
      return
    }
    const accepted = files.slice(0, take)
    const newSlots: StagedSlot[] = accepted.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      description: '',
    }))
    setStaged(prev => [...prev, ...newSlots])
    if (files.length > accepted.length) {
      setMessage({ kind: 'error', text: `Only ${accepted.length} slot${accepted.length === 1 ? '' : 's'} left (max ${MAX_TICKET_PHOTOS}). Extra files were skipped.` })
    } else {
      setMessage(null)
    }
  }

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
    if (!slot.description.trim()) {
      setStaged(prev => prev.map(s => s.key === key ? { ...s, validationError: 'Description is required.' } : s))
      return
    }
    const entry: PendingUpload = {
      key: `up-${key}`,
      file: slot.file,
      previewUrl: slot.previewUrl,
      status: 'uploading',
      description: slot.description.trim(),
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
        current.filter(p => p.id !== photo.id && p.url !== photo.url))
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
    setEditDescDraft(photo.description || '')
  }

  const saveEditedDescription = async () => {
    if (!editingPhoto) return
    setSavingDesc(true)
    const targetId = editingPhoto.id
    const nextDesc = editDescDraft.trim() || undefined
    try {
      const saved = await updateTicketPhotos(ticketId, photosRef.current, current =>
        current.map(p => (p.id === targetId || p.url === editingPhoto.url ? { ...p, description: nextDesc } : p)))
      applySaved(saved)
      setMessage({ kind: 'ok', text: nextDesc ? 'Description updated.' : 'Description removed.' })
      setEditingPhoto(null)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to save description' })
    } finally {
      setSavingDesc(false)
    }
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
  const emptyCount = Math.max(0, MAX_TICKET_PHOTOS - usedSlots)

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
              <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">Photos</p>
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
          <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">
            Photos <span style={{ color: textMuted }}>{photos.length}/{MAX_TICKET_PHOTOS}</span>
          </p>
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
          {/* drag-hint strip when grid has something */}
          {canUpload && usedSlots > 0 && (
            <p className="text-[10px] mb-2" style={{ color: textMuted }}>
              Drag images anywhere, paste with Ctrl+V, or click an empty slot to add.
            </p>
          )}

          {/* ── unified 10-slot grid ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

            {/* 1. Already-uploaded photos */}
            {photos.map((photo, i) => (
              <UploadedPhotoCell
                key={photo.id}
                photo={photo}
                index={i}
                canManage={canManage}
                deletingId={deletingId}
                tileStyle={tileStyle}
                onView={() => setLightboxIndex(i)}
                onEdit={() => startEditDescription(photo)}
                onDelete={() => askDelete(photo)}
              />
            ))}

            {/* 2. Staged slots (dropped, not yet uploaded) */}
            {staged.map(slot => (
              <StagedSlotCell
                key={slot.key}
                slot={slot}
                tileStyle={tileStyle}
                border={border}
                cardBg={cardBg}
                textPrimary={textPrimary}
                onDescChange={(val) =>
                  setStaged(prev => prev.map(s => s.key === slot.key ? { ...s, description: val, validationError: undefined } : s))
                }
                onUpload={() => void uploadSlot(slot.key)}
                onClear={() => clearSlot(slot.key)}
              />
            ))}

            {/* 3. Currently uploading */}
            {pending.map(p => (
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
            ))}

            {/* 4. Empty slots — each is a drop / click target */}
            {canUpload && Array.from({ length: emptyCount }).map((_, i) => (
              <EmptySlotCell
                key={`empty-${i}`}
                border={border}
                textMuted={textMuted}
                textPrimary={textPrimary}
                onClick={() => inputRef.current?.click()}
                onFiles={addFiles}
              />
            ))}
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
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-extrabold" style={{ color: textPrimary }}>Edit Description</h3>
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

            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: border }}>
                <img src={editingPhoto.thumbUrl || editingPhoto.url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate" style={{ color: textPrimary }}>
                  {editingPhoto.uploadedBy || 'Uploaded Photo'}
                </p>
                <p className="text-[10px]" style={{ color: textMuted }}>
                  {formatUploadedAt(editingPhoto.uploadedAt)} · {formatBytes(editingPhoto.size)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: textMuted }}>
                Description / Note
              </label>
              <textarea
                autoFocus
                rows={3}
                placeholder="e.g. Serial number plate, Indoor unit, Before repair…"
                value={editDescDraft}
                onChange={(e) => setEditDescDraft(e.target.value)}
                className="w-full text-xs font-semibold p-2.5 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-none"
                style={{ backgroundColor: inputBg, borderColor: border, color: textPrimary }}
              />
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
  tileStyle,
  onView, onEdit, onDelete,
}: {
  photo: TicketPhoto
  index: number
  canManage: boolean
  deletingId: string | null
  tileStyle: React.CSSProperties
  onView: () => void
  onEdit: () => void
  onDelete: () => void
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
        {photo.description && (
          <div
            className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-emerald-400 flex items-center gap-1 border border-emerald-500/30 group-hover:opacity-0 transition-opacity"
            title={photo.description}
          >
            <MessageSquare className="w-2.5 h-2.5" />
            <span className="text-[8.5px] font-bold truncate max-w-[55px] sm:max-w-[70px]">{photo.description}</span>
          </div>
        )}
      </button>

      {/* Hover overlay */}
      <div
        onClick={onView}
        className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none flex flex-col justify-end"
      >
        {photo.description ? (
          <div className="flex items-start gap-1">
            <FileText className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold leading-tight text-emerald-300 line-clamp-3 select-none">{photo.description}</p>
          </div>
        ) : (
          <p className="text-[9.5px] font-medium text-slate-300/80 italic select-none">No description</p>
        )}
        <div className="flex items-center gap-1 mt-1 text-[8.5px] text-slate-400 select-none">
          {photo.uploadedBy && <span className="truncate">{photo.uploadedBy}</span>}
          {photo.size ? <span>· {formatBytes(photo.size)}</span> : null}
        </div>
      </div>

      {/* Action buttons */}
      {canManage && (
        <div className="absolute top-1 right-1 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="w-6 h-6 rounded-full flex items-center justify-center bg-black/70 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-md"
            title={photo.description ? 'Edit description' : 'Add description'}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={deletingId === photo.id}
            className="w-6 h-6 rounded-full flex items-center justify-center bg-black/70 text-white hover:bg-red-600 active:scale-95 transition-all shadow-md"
            title="Delete"
          >
            {deletingId === photo.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      )}
    </div>
  )
}

/** Staged slot: image dropped but not yet uploaded. Has inline text field + Upload button. */
function StagedSlotCell({
  slot, tileStyle, border, cardBg, textPrimary,
  onDescChange, onUpload, onClear,
}: {
  slot: { key: string; previewUrl: string; description: string; validationError?: string }
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
          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center bg-black/70 text-white hover:bg-red-600 transition-colors"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
        {/* "New" badge */}
        <span className="absolute top-1 left-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
          New
        </span>
      </div>

      {/* Text field + validation */}
      <div className="flex flex-col gap-1 p-1.5">
        <input
          type="text"
          placeholder="Add a description…"
          value={slot.description}
          onChange={(e) => onDescChange(e.target.value)}
          className="w-full text-[10.5px] font-semibold px-2 py-1 rounded-lg border outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
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

/** Empty slot — acts as a drop target and click-to-browse button. */
function EmptySlotCell({
  border, textMuted, textPrimary, onClick, onFiles,
}: {
  border: string
  textMuted: string
  textPrimary: string
  onClick: () => void
  onFiles: (files: FileList | File[]) => void
}) {
  const [over, setOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setOver(true) }
  const handleDragLeave = () => setOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    onFiles(e.dataTransfer.files)
  }
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imgItem = items.find(it => it.type.startsWith('image/'))
    if (imgItem) {
      const file = imgItem.getAsFile()
      if (file) onFiles([file])
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      className="aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all duration-150"
      style={{
        borderColor: over ? '#10B981' : border,
        backgroundColor: over ? 'rgba(16,185,129,0.07)' : 'transparent',
        color: textMuted,
      }}
      aria-label="Add photo"
    >
      <ImagePlus className="w-5 h-5" style={{ color: over ? '#10B981' : textMuted }} />
      <span className="text-[9px] font-bold" style={{ color: over ? '#10B981' : textPrimary }}>
        {over ? 'Drop here' : 'Add photo'}
      </span>
    </button>
  )
}
