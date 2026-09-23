'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { labelFor, type ProjectType } from '@/lib/projectType'
import { useVocabulary } from '@/lib/vocabulary'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'
import { tryFetch } from '@/lib/writeFeedback'

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
  const t = useTranslations('taskPhotos')
  const tc = useTranslations('common')
  const router = useRouter()
  const config = useVocabulary(projectType)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoType, setPhotoType] = useState(config.photoTypes[0].value)
  const [uploading, setUploading] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const toast = useToast()
  const reasonFor = useFailureReason()

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const compressed = await compressImageIfNeeded(file)
    const formData = new FormData()
    formData.append('file', compressed)
    formData.append('photoType', photoType)

    const res = await tryFetch(`/api/vehicles/${vehicleId}/tasks/${taskId}/photos`, {
      method: 'POST',
      body: formData,
    })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (!res?.ok) {
      toast.error(await reasonFor(res, t('uploadFailed')))
      return
    }
    router.refresh()
  }

  // RL-034: gone at once, deleted when the undo window closes.
  function onDelete(photoId: string) {
    setLightboxIndex(null)
    toast.undoable({
      key: `photo:${photoId}`,
      message: t('deleted'),
      request: { url: `/api/vehicles/${vehicleId}/tasks/${taskId}/photos/${photoId}`, method: 'DELETE' },
      onCommitted: () => router.refresh(),
      onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
    })
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
          {uploading ? t('uploading') : t('addPhoto')}
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

      {photos.length === 0 ? (
        <p className="text-sm text-ink-faint">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <HideWhilePending key={photo.id} pendingKey={`photo:${photo.id}`}>
              <button
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
            </HideWhilePending>
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
              {t('prev')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={(e) => { e.stopPropagation(); onDelete(photos[lightboxIndex].id) }}
            >
              {tc('delete')}
            </button>
            <button
              type="button"
              className="btn bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null)) }}
            >
              {t('next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
