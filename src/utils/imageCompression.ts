/**
 * Client-side Image Compression Utility
 * Resizes and compresses image files using HTML5 Canvas before upload.
 * Reduces 2MB–10MB camera photos to ~80KB–150KB while preserving readability for receipts.
 */

export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: 'image/jpeg' | 'image/webp'
}

export interface CompressedResult {
  blob: Blob
  dataUrl: string
  originalSize: number
  compressedSize: number
  reductionPercent: number
  width: number
  height: number
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<CompressedResult> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.72,
    mimeType = 'image/jpeg'
  } = options

  const originalSize = file.size

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.onload = () => {
        // Clamp to max dimensions, preserving aspect ratio
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1)
        const finalWidth = Math.max(1, Math.round(img.width * ratio))
        const finalHeight = Math.max(1, Math.round(img.height * ratio))

        const canvas = document.createElement('canvas')
        canvas.width = finalWidth
        canvas.height = finalHeight

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to acquire canvas 2D context'))
          return
        }

        // Draw with white background (prevents transparent PNGs from turning black in JPEG)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, finalWidth, finalHeight)
        ctx.drawImage(img, 0, 0, finalWidth, finalHeight)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image canvas to blob'))
              return
            }
            const dataUrl = canvas.toDataURL(mimeType, quality)
            const compressedSize = blob.size
            const reductionPercent = Math.round(
              ((originalSize - compressedSize) / originalSize) * 100
            )

            resolve({
              blob,
              dataUrl,
              originalSize,
              compressedSize,
              reductionPercent,
              width: finalWidth,
              height: finalHeight
            })
          },
          mimeType,
          quality
        )
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}
