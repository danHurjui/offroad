'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PROJECT_TYPE_CONFIG, labelFor, type ProjectType } from '@/lib/projectType'
import { compressImageIfNeeded } from '@/lib/compressImage'

interface Photo {
  id: string
  url: string
  caption: string | null
  photoType: string
}

// RL-006: photo upload linked to task. RL-005: gallery with full-screen
// pinch-to-zoom view (browser-native pinch works on a plain <img> in a
// full-viewport overlay, so no gesture library is needed here).
export default function TaskPhotos({
  vehicleId,
  taskId,
  projectType,
  photos,
}: {
  vehicleId: string
  taskId: string
  projectType: ProjectType
  photos: Photo[]
}) {
  const router = useRouter()
  const config = PROJECT_TYPE_CONFIG[projectType]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoType, setPhotoType] = useState(config.photoTypes[0].value)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)

    const compressed = await compressImageIfNeeded(file)
    const formData = new FormData()
    formData.append('file', compressed)
    formData.append('photoType', photoType)

    const res = await fetch(`/api/vehicles/${vehicleId}/tasks/${taskId}/photos`, {
      method: 'POST',
      body: formData,
    })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Upload failed')
      return
    }
    router.refresh()
  }

  async function onDelete(photoId: string) {
    if (!confirm('Delete this photo?')) return
    await fetch(`/api/vehicles/${vehicleId}/tasks/${taskId}/photos/${photoId}`, { method: 'DELETE' })
    setLightboxIndex(null)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
          {config.photoTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="btn-secondary cursor-pointer">
          {uploading ? 'Uploading…' : 'Add photo'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            className="hidden"
            onChange={onFileChange}
            disabled={uploading}
          />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-ink-faint">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-surface-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/uploads/${photo.url}`} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                {labelFor(config.photoTypes, photo.photoType)}
              </span>
            </button>
          ))}
        </div>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${photos[lightboxIndex].url}`}
            alt=""
            className="max-h-full max-w-full touch-pinch-zoom object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-6 flex gap-3">
            <button
              type="button"
              className="btn bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i !== null ? (i + photos.length - 1) % photos.length : null)) }}
            >
              ‹ Prev
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={(e) => { e.stopPropagation(); onDelete(photos[lightboxIndex].id) }}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null)) }}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
