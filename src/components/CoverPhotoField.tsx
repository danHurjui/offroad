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
export default function CoverPhotoField({
  currentUrl,
  file,
  onFile,
  onRemove,
  removing,
  disabled,
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
}) {
  const t = useTranslations('cover')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
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
            disabled={disabled}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-ink-faint">
            {preview ? t('chosen') : currentUrl ? t('current') : t('none')}
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
    </div>
  )
}
