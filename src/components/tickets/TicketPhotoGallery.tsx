import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Trash2, AlertCircle, RotateCcw, X } from 'lucide-react'
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
import { uploadTicketPhoto, removeTicketPhotoFiles, type UploadTicketPhotoResult } from '../../services/supabaseStorage'
import { ImageLightbox } from '../ImageLightbox'
import ConfirmDialog, { type ConfirmDialogState } from '../ConfirmDialog'

type PendingStatus = 'uploading' | 'saving' | 'error'

interface PendingUpload {
  key: string
  file: File
  previewUrl: string
  status: PendingStatus
  error?: string
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
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * "Photos" section of TicketDetailsModal: up to 10 compressed images per ticket, stored in the
 * Supabase `ticket-attachments` bucket and listed in tickets.photo_attachments.
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
  /** `details` = TicketDetailsModal section head; `form` = Edit Ticket form section head. */
  variant?: 'details' | 'form'
  /** Optional custom subtitle (e.g. for form variant). Defaults to none for a clean simple header. */
  subtitle?: string
}) {
  const rawPhotos = getTicketPhotosRaw(ticket)
  const [photos, setPhotos] = useState<TicketPhoto[]>(() => parseTicketPhotos(rawPhotos))
  const [loading, setLoading] = useState(rawPhotos == null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmDialogState | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef(photos)
  const pendingRef = useRef(pending)
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => { pendingRef.current = pending }, [pending])

  const border = isLight ? '#cbd5e1' : '#1e293b'
  const inputBg = isLight ? '#f8fafc' : '#0f172a'
  const textPrimary = isLight ? '#0f172a' : '#f8fafc'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const ticketId = ticket.id
  const ticketKey = ticket.ticketNumber || ticket.ticket_number || ticketId
  const canUpload = canManage && !!ticketId && !isTempTicketId(ticketId)
  const activePending = pending.filter(p => p.status !== 'error').length
  const slotsLeft = MAX_TICKET_PHOTOS - photos.length - activePending

  // Schedule rows use the light payload (photo_attachments omitted), so always pull the
  // current list from the server when a ticket is opened.
  useEffect(() => {
    if (!ticketId || isTempTicketId(ticketId)) { setLoading(false); return }
    let cancelled = false
    setLoading(photosRef.current.length === 0)
    fetchLatestTicketPhotos(ticketId)
      .then(latest => { if (!cancelled && latest) setPhotos(latest) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticketId])

  // Parent handed us a full payload (e.g. after another save) — adopt it.
  useEffect(() => {
    if (typeof rawPhotos === 'string') setPhotos(parseTicketPhotos(rawPhotos))
  }, [rawPhotos])

  useEffect(() => () => {
    pendingRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl))
  }, [])

  useEffect(() => {
    if (message?.kind !== 'ok') return
    const t = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(t)
  }, [message])

  const applySaved = (saved: TicketPhoto[]) => {
    setPhotos(saved)
    onPhotosChange?.(saved)
  }

  const patchPending = (keys: string[], patch: Partial<PendingUpload>) => {
    setPending(prev => prev.map(p => (keys.includes(p.key) ? { ...p, ...patch } : p)))
  }

  const dropPending = (keys: string[]) => {
    setPending(prev => {
      prev.filter(p => keys.includes(p.key)).forEach(p => URL.revokeObjectURL(p.previewUrl))
      return prev.filter(p => !keys.includes(p.key))
    })
  }

  const processUploads = async (entries: PendingUpload[]) => {
    if (!entries.length) return
    patchPending(entries.map(e => e.key), { status: 'uploading', error: undefined })

    const results = new Map<string, UploadTicketPhotoResult>()
    const queue = [...entries]
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        try {
          results.set(entry.key, await uploadTicketPhoto(entry.file, {
            ticketKey,
            branch: branchLabel,
          }))
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
      if (overflow.length) {
        void removeTicketPhotoFiles(overflow.flatMap(p => [p.path || '', p.thumbPath || '']))
      }
      const keptCount = newPhotos.length - overflow.length
      const before = newPhotos.slice(0, keptCount).reduce((sum, p) => sum + (p.originalSize || 0), 0)
      const after = newPhotos.slice(0, keptCount).reduce((sum, p) => sum + (p.size || 0), 0)
      dropPending(uploadedKeys)
      setMessage(overflow.length
        ? { kind: 'error', text: `Only ${keptCount} photo${keptCount === 1 ? '' : 's'} added — this ticket reached the ${MAX_TICKET_PHOTOS}-photo limit.` }
        : { kind: 'ok', text: `${keptCount} photo${keptCount === 1 ? '' : 's'} added · ${formatBytes(before)} → ${formatBytes(after)}` })
    } catch (err) {
      void removeTicketPhotoFiles(newPhotos.flatMap(p => [p.path || '', p.thumbPath || '']))
      patchPending(uploadedKeys, { status: 'error', error: err instanceof Error ? err.message : 'Failed to save photos' })
    }
  }

  const handleFiles = (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter(isImageFile)
    if (!files.length || !canUpload) return
    if (slotsLeft <= 0) {
      setMessage({ kind: 'error', text: `This ticket already has ${MAX_TICKET_PHOTOS} photos. Delete one to add another.` })
      return
    }
    const accepted = files.slice(0, slotsLeft)
    const entries: PendingUpload[] = accepted.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading',
    }))
    setPending(prev => [...prev, ...entries])
    if (files.length > accepted.length) {
      setMessage({ kind: 'error', text: `Only ${accepted.length} more photo${accepted.length === 1 ? '' : 's'} allowed (max ${MAX_TICKET_PHOTOS}). The rest were skipped.` })
    } else {
      setMessage(null)
    }
    void processUploads(entries)
  }

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

  const openPicker = () => inputRef.current?.click()

  const dropProps = canUpload ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) },
  } : {}

  const tileStyle = { backgroundColor: inputBg, border: `1px solid ${border}` }
  const isEmpty = photos.length === 0 && pending.length === 0

  return (
    <div {...dropProps} className={`rounded-xl transition-shadow ${dragOver ? 'ring-2 ring-emerald-500/60' : ''}`}>
      {variant === 'form' ? (
        <div className="flex items-center justify-between gap-2 border-b pb-2.5 mb-4" style={{ borderColor: border }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-500 shrink-0">
              <Camera className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11.5px] font-black uppercase tracking-wider text-emerald-600 leading-tight">Photos</p>
              {subtitle ? (
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg border" style={{ backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10B981' }}>
              {photos.length}/{MAX_TICKET_PHOTOS}
            </span>
            {canUpload && slotsLeft > 0 && (
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all active:scale-95"
              >
                <ImagePlus className="w-3 h-3" />
                <span>Add Photos</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-2 border-b pb-2 mb-3 flex items-center justify-between gap-2" style={{ borderColor: border }}>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#10B981]">
            Photos <span style={{ color: textMuted }}>{photos.length}/{MAX_TICKET_PHOTOS}</span>
          </p>
          {canUpload && slotsLeft > 0 && !isEmpty && (
            <button
              type="button"
              onClick={openPicker}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
              style={{ borderColor: border, backgroundColor: inputBg, color: textPrimary }}
            >
              <Camera className="w-3.5 h-3.5 text-emerald-500" />
              Add Photos
            </button>
          )}
        </div>
      )}

      {canUpload && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
        />
      )}

      {loading && isEmpty ? (
        <div className="flex items-center gap-2 text-xs rounded-xl p-4" style={{ ...tileStyle, color: textMuted }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading photos…
        </div>
      ) : isEmpty ? (
        canUpload ? (
          <button
            type="button"
            onClick={openPicker}
            className="w-full rounded-xl p-5 border-2 border-dashed flex flex-col items-center gap-1.5 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
            style={{ borderColor: border, color: textMuted }}
          >
            <ImagePlus className="w-6 h-6 text-emerald-500" />
            <span className="text-xs font-bold" style={{ color: textPrimary }}>Add photos</span>
            <span className="text-[10px]">Click or drag photos here (up to {MAX_TICKET_PHOTOS})</span>
          </button>
        ) : (
          <p className="text-xs rounded-xl p-4" style={{ ...tileStyle, color: textMuted }}>No photos attached.</p>
        )
      ) : (
        <div className={`grid gap-2 ${variant === 'form' ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-10' : 'grid-cols-3 sm:grid-cols-5'}`}>
          {photos.map((photo, i) => (
            <div key={photo.id} className="group relative aspect-square rounded-lg overflow-hidden" style={tileStyle}>
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="w-full h-full cursor-zoom-in"
                aria-label={`View photo ${i + 1}`}
              >
                <img
                  src={photo.thumbUrl || photo.url}
                  alt={`Ticket photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  draggable={false}
                />
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => askDelete(photo)}
                  disabled={deletingId === photo.id}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-red-600 transition-all sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete photo"
                  title="Delete photo"
                >
                  {deletingId === photo.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          ))}

          {pending.map(p => (
            <div key={p.key} className="relative aspect-square rounded-lg overflow-hidden" style={tileStyle}>
              <img src={p.previewUrl} alt="" className="w-full h-full object-cover opacity-40" draggable={false} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5 text-center">
                {p.status === 'error' ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-[9px] font-bold leading-tight text-red-500 line-clamp-3">{p.error}</span>
                    <div className="flex gap-1 mt-0.5">
                      <button type="button" onClick={() => void processUploads([p])}
                        className="w-6 h-6 rounded-full flex items-center justify-center bg-black/60 text-white hover:bg-emerald-600"
                        aria-label="Retry upload" title="Retry">
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
                  </>
                )}
              </div>
            </div>
          ))}

          {canUpload && slotsLeft > 0 && (
            <button
              type="button"
              onClick={openPicker}
              className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
              style={{ borderColor: border, color: textMuted }}
              aria-label="Add photos"
            >
              <ImagePlus className="w-5 h-5 text-emerald-500" />
              <span className="text-[9px] font-bold uppercase tracking-wide">{slotsLeft} left</span>
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={`mt-2 text-[11px] font-semibold ${message.kind === 'ok' ? 'text-emerald-500' : 'text-red-500'}`}>
          {message.text}
        </p>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <ImageLightbox
          images={photos.map(p => ({
            src: p.url,
            placeholderSrc: p.thumbUrl,
            alt: 'Ticket photo',
            caption: [p.uploadedBy, formatUploadedAt(p.uploadedAt), p.size ? formatBytes(p.size) : '']
              .filter(Boolean).join(' · '),
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
