import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { compressImage, type CompressedResult } from '../utils/imageCompression'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance
  if (supabaseUrl && supabaseAnonKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
    return supabaseInstance
  }
  return null
}

export interface UploadReceiptOptions {
  bucket?: string
  folder?: string
  /** Branch/site name, used as a subfolder segment so files are browsable per branch. */
  branch?: string
  /** Free-text label (e.g. description or company) used to build a readable filename, best-effort. */
  description?: string
  filename?: string
  maxWidth?: number
  quality?: number
}

export interface UploadReceiptResult {
  url: string
  isRemote: boolean
  compressed: CompressedResult
}

/**
 * Universal Receipt Upload Handler:
 * 1. Automatically compresses image on client-side (90%+ size reduction).
 * 2. If Supabase is configured (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY),
 *    uploads to the Supabase Storage bucket and returns the clean public URL.
 * 3. If Supabase is not configured yet or upload fails, falls back gracefully
 *    to the compressed Base64 dataURL so the user is never blocked.
 */
export async function uploadReceiptImage(
  file: File | Blob,
  options: UploadReceiptOptions = {}
): Promise<UploadReceiptResult> {
  const {
    bucket = 'receipts',
    folder = 'dtr',
    maxWidth = 1280,
    quality = 0.72
  } = options

  // Step 1: Client-side compression
  const compressed = await compressImage(file, {
    maxWidth,
    maxHeight: maxWidth,
    quality,
    mimeType: 'image/jpeg'
  })

  // Step 2: Attempt upload to Supabase Storage if configured
  const supabase = getSupabaseClient()

  if (supabase) {
    try {
      const now = new Date()
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 10) + Date.now().toString(36)

      const ext = 'jpg'
      const slugify = (value: string, maxLength: number) =>
        value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, maxLength)

      const nameSource = options.description?.trim() || options.filename || 'receipt'
      const sanitizedName = slugify(nameSource, 40) || 'receipt'
      const sanitizedBranch = options.branch ? slugify(options.branch, 30) : ''
      const folderPath = sanitizedBranch ? `${folder}/${sanitizedBranch}/${yearMonth}` : `${folder}/${yearMonth}`
      const filePath = `${folderPath}/${sanitizedName}_${uniqueId}.${ext}`

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, compressed.blob, {
          contentType: 'image/jpeg',
          upsert: false
        })

      if (!error && data?.path) {
        const { data: urlData } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path)

        if (urlData?.publicUrl) {
          return {
            url: urlData.publicUrl,
            isRemote: true,
            compressed
          }
        }
      } else if (error) {
        console.warn(`[Supabase Storage] Upload to '${bucket}' failed (${error.message}). Falling back to compressed DataURL.`)
      }
    } catch (err) {
      console.warn('[Supabase Storage] Error during upload, falling back to compressed DataURL:', err)
    }
  }

  // Step 3: Graceful fallback to compressed DataURL (~100KB instead of 2MB+)
  return {
    url: compressed.dataUrl,
    isRemote: false,
    compressed
  }
}

/** Public bucket for per-ticket photo attachments (Supabase Storage). */
export const TICKET_ATTACHMENTS_BUCKET: string =
  import.meta.env.VITE_SUPABASE_TICKET_BUCKET || 'ticket-attachments'

export interface UploadTicketPhotoOptions {
  /** Ticket number (or id) — used as the folder name so files are browsable per ticket. */
  ticketKey: string
  /** Branch/site name, used as a folder segment like receipts. */
  branch?: string
}

export interface UploadTicketPhotoResult {
  url: string
  thumbUrl: string
  path: string
  thumbPath: string
  size: number
  originalSize: number
  width: number
  height: number
}

const slugifySegment = (value: string, maxLength: number) =>
  value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, maxLength)

/**
 * Ticket photo upload — same client-side compression + public-bucket flow as receipts, but:
 * - uploads a full image (≤1600px) and a small thumbnail (≤400px) for the gallery grid;
 * - never falls back to a DataURL: base64 photos would bloat tickets.photo_attachments and
 *   every ticket payload, so a failed upload surfaces as an error the user can retry.
 */
export async function uploadTicketPhoto(
  file: File | Blob,
  options: UploadTicketPhotoOptions
): Promise<UploadTicketPhotoResult> {
  const full = await compressImage(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.72, mimeType: 'image/jpeg' })
  // Thumbnail from the already-downscaled blob — much cheaper than decoding the camera original twice.
  const thumb = await compressImage(full.blob, { maxWidth: 380, maxHeight: 380, quality: 0.62, mimeType: 'image/jpeg' })

  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 10) + Date.now().toString(36)
  const branchSegment = options.branch ? slugifySegment(options.branch, 30) : ''
  const ticketSegment = slugifySegment(options.ticketKey, 60) || 'ticket'
  const folderPath = branchSegment ? `tickets/${branchSegment}/${ticketSegment}` : `tickets/${ticketSegment}`
  const path = `${folderPath}/${uniqueId}.jpg`
  const thumbPath = `${folderPath}/${uniqueId}_thumb.jpg`

  const supabase = getSupabaseClient()
  if (supabase) {
    try {
      const bucket = supabase.storage.from(TICKET_ATTACHMENTS_BUCKET)
      const [fullUpload, thumbUpload] = await Promise.all([
        bucket.upload(path, full.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }),
        bucket.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }),
      ])
      if (!fullUpload.error && !thumbUpload.error) {
        return {
          url: bucket.getPublicUrl(path).data.publicUrl,
          thumbUrl: bucket.getPublicUrl(thumbPath).data.publicUrl,
          path,
          thumbPath,
          size: full.compressedSize + thumb.compressedSize,
          originalSize: full.originalSize,
          width: full.width,
          height: full.height,
        }
      }
      console.warn('[Supabase Storage] Ticket photo upload to Supabase failed, saving locally:', fullUpload.error || thumbUpload.error)
      const uploaded = [fullUpload.data?.path, thumbUpload.data?.path].filter((p): p is string => !!p)
      if (uploaded.length) void bucket.remove(uploaded)
    } catch (err) {
      console.warn('[Supabase Storage] Error during ticket photo upload, saving locally:', err)
    }
  }

  // Graceful fallback for localhost / demo mode: save photo locally as compressed DataURL
  return {
    url: full.dataUrl,
    thumbUrl: thumb.dataUrl,
    path: `local/${folderPath}/${uniqueId}.jpg`,
    thumbPath: `local/${folderPath}/${uniqueId}_thumb.jpg`,
    size: full.compressedSize + thumb.compressedSize,
    originalSize: full.originalSize,
    width: full.width,
    height: full.height,
  }
}

/**
 * Best-effort removal of ticket photo files. Needs a DELETE storage policy on the bucket;
 * if that's missing the row is still removed from the ticket and the file is just orphaned.
 */
export async function removeTicketPhotoFiles(paths: string[]): Promise<void> {
  const supabase = getSupabaseClient()
  const clean = paths.filter(p => !!p && !p.startsWith('local/'))
  if (!supabase || clean.length === 0) return
  try {
    const { error } = await supabase.storage.from(TICKET_ATTACHMENTS_BUCKET).remove(clean)
    if (error) console.warn(`[Supabase Storage] Could not remove ticket photo files (${error.message}).`)
  } catch (err) {
    console.warn('[Supabase Storage] Error removing ticket photo files:', err)
  }
}
