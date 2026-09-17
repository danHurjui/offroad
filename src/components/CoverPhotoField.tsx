'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Picks a cover photo and shows what is picked.
 *
 * Shared by the create and edit forms because the complaint was the same
 * on both: the field was a bare `<input type="file">`, so there was no way
 * to see the cover you already had, nor the one you had just chosen. The
 * upload itself stays with each form — creating posts it after the vehicle
 * exists, editing posts it on save — since only the preview is common.
 */
export interface CoverCandidate {
  /** Storage key, served through the access-checked uploads route. */
  url: string
  caption: string | null
}

export default function CoverPhotoField({
  currentUrl,
  file,
  onFile,
  onRemove,
  removing,
  disabled,
  photos = [],
}: {
  /** The saved cover's storage key, or null. Never a public URL — uploads
   *  are only ever served through the access-checked route (CLAUDE.md #6). */
  currentUrl?: string | null
  file: File | null
  onFile: (file: File | null) => void
  /** Omitted by the create form: there is nothing saved yet to remove. */
  onRemove?: () => void
  removing?: boolean
  disabled?: boolean
  /** Photos already on this vehicle, offered as covers. Empty on the
   *  create form — a vehicle that does not exist yet has none. */
  photos?: CoverCandidate[]
}) {
  const t = useTranslations('cover')
  const [preview, setPreview] = useState<string | null>(null)
  const [pickedUrl, setPickedUrl] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  /**
   * Picking an existing photo goes back out through the ordinary upload,
   * rather than pointing `coverPhotoUrl` at the photo's own key.
   *
   * Two rows sharing one storage key would be a data-loss bug waiting to
   * happen: replacing or removing the cover deletes the file it referenced
   * (pitfall #14), which would take the task photo with it. Re-uploading
   * keeps the invariant that the cover owns its file, and costs one copy
   * of an image that was already compressed to ~1200px on its way in.
   */
  async function pick(candidate: CoverCandidate) {
    setPickError(null)
    setPicking(true)
    try {
      const res = await fetch(`/api/uploads/${candidate.url}`)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const name = candidate.url.split('/').pop() || 'cover'
      onFile(new File([blob], name, { type: blob.type || 'image/jpeg' }))
      setPickedUrl(candidate.url)
    } catch {
      setPickError(t('pickFailed'))
    } finally {
      setPicking(false)
    }
  }

  useEffect(() => {
    if (!file) {
      setPreview(null)
      setPickedUrl(null)
      return
    }
    // Revoked on the next pick and on unmount: an object URL pins the whole
    // file in memory until it is, and these are camera-sized photos.
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const shown = preview ?? (currentUrl ? `/api/uploads/${currentUrl}` : null)

  return (
    <div>
      <label className="label" htmlFor="coverPhoto">{t('label')}</label>
      <div className="flex items-start gap-4">
        <div className="h-24 w-32 shrink-0 overflow-hidden rounded border border-surface-border bg-surface-subtle">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-ink-faint">
              {t('none')}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            id="coverPhoto"
            type="file"
            accept="image/jpeg,image/png,image/heic"
            className="input"
            disabled={disabled || picking}
            onChange={(e) => {
              setPickedUrl(null)
              onFile(e.target.files?.[0] ?? null)
            }}
          />
          <p className="mt-1 text-xs text-ink-faint">
            {picking ? t('picking') : preview ? (pickedUrl ? t('picked') : t('chosen')) : currentUrl ? t('current') : t('none')}
          </p>
          {onRemove && currentUrl && !preview && (
            <button
              type="button"
              className="mt-2 text-xs text-red-600 hover:underline dark:text-red-400"
              onClick={onRemove}
              disabled={removing || disabled}
            >
              {removing ? t('removing') : t('remove')}
            </button>
          )}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs text-ink-muted">{t('orPick')}</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <button
                key={photo.url}
                type="button"
                disabled={disabled || picking}
                onClick={() => pick(photo)}
                title={photo.caption ?? undefined}
                aria-pressed={pickedUrl === photo.url}
                className={`h-16 w-20 overflow-hidden rounded border-2 ${
                  pickedUrl === photo.url ? 'border-brand-500' : 'border-transparent hover:border-surface-border'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${photo.url}`} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {pickError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{pickError}</p>}
    </div>
  )
}
