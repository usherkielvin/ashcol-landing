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
      const sanitizedName = options.filename
        ? options.filename.replace(/[^a-zA-Z0-9_-]/g, '_')
        : 'receipt'
      const filePath = `${folder}/${yearMonth}/${sanitizedName}_${uniqueId}.${ext}`

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
