'use client'

import imageCompression from 'browser-image-compression'

/**
 * RL-006: "Photos are compressed client-side to max 1200px on longest
 * edge before upload." Also keeps uploads comfortably under Vercel's
 * serverless request-body cap (see MAX_UPLOAD_BYTES in src/lib/storage.ts)
 * without the user having to think about it — a phone photo can easily
 * be 8-12MB straight out of the camera.
 *
 * No-ops for non-image files (PDFs) and quietly falls back to the
 * original file if compression itself fails, rather than blocking the
 * upload on a client-side library error.
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  try {
    const compressed = await imageCompression(file, {
      maxWidthOrHeight: 1200,
      maxSizeMB: 3.5,
      useWebWorker: true,
      fileType: outputType,
    })
    // Local-disk storage (dev) infers Content-Type from the filename
    // extension, not the File's .type — keep them in sync so a .png that
    // got recompressed to JPEG doesn't get served with the wrong header.
    const ext = outputType === 'image/png' ? 'png' : 'jpg'
    const renamed = file.name.replace(/\.[^.]+$/, '') + `.${ext}`
    return new File([compressed], renamed, { type: outputType, lastModified: file.lastModified })
  } catch {
    return file
  }
}
