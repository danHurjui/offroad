'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { ACCIDENT_PHOTO_LIMIT } from '@/lib/accidents'
import { tryFetch } from '@/lib/writeFeedback'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-050: one accident record's photos and removal. Photos go through the
 * uploads route like every other file, behind the owner's session.
 */
export function AccidentActions({
  vehicleId,
  accidentId,
  photos,
  canEdit,
}: {
  vehicleId: string
  accidentId: string
  photos: Array<{ id: string; url: string }>
  canEdit: boolean
}) {
  const t = useTranslations('accidents')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const url = `/api/vehicles/${vehicleId}/accidents/${accidentId}`

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', await compressImageIfNeeded(file))
    const res = await tryFetch(`${url}/photos`, { method: 'POST', body: form })
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('photoFailed')))
      return
    }
    router.refresh()
  }

  // Undo rather than a confirm dialog, like every other removal (RL-034).
  function removePhoto(photoId: string) {
    toast.undoable({
      key: `accidentPhoto:${photoId}`,
      message: t('photoRemoved'),
      request: { url: `${url}/photos/${photoId}`, method: 'DELETE' },
      onCommitted: () => router.refresh(),
      onFailed: async (res) => toast.error(await reasonFor(res, t('photoRemoveFailed'))),
    })
  }

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p) => (
            <HideWhilePending key={p.id} pendingKey={`accidentPhoto:${p.id}`}>
              <li className="relative min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${p.url}`} alt={t('photoAlt')} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                {canEdit && (
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
                    aria-label={t('removePhoto')}
                    onClick={() => removePhoto(p.id)}
                  >
                    ×
                  </button>
                )}
              </li>
            </HideWhilePending>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          {photos.length < ACCIDENT_PHOTO_LIMIT && (
            <label className="btn-secondary cursor-pointer">
              {uploading ? t('uploading') : t('addPhoto')}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic" className="hidden" onChange={onFile} disabled={uploading} />
            </label>
          )}
          <button
            type="button"
            className="text-sm text-red-600 hover:underline dark:text-red-400"
            onClick={() =>
              toast.undoable({
                key: `accidents:${accidentId}`,
                message: t('deleted'),
                request: { url, method: 'DELETE' },
                onCommitted: () => router.refresh(),
                onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
              })
            }
          >
            {t('remove')}
          </button>
        </div>
      )}
    </div>
  )
}

export function AccidentRow({ accidentId, children }: { accidentId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`accidents:${accidentId}`}>{children}</HideWhilePending>
}
