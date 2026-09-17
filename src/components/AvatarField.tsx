'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { compressImageIfNeeded } from '@/lib/compressImage'

/**
 * The profile picture, uploaded on choice rather than on form submit.
 *
 * Unlike the vehicle cover — which rides along with the rest of the edit
 * form — this one has no surrounding save button to belong to: the
 * settings form saves name and location, and making a picture wait for
 * that would be surprising when the preview already changed.
 */
export default function AvatarField({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const t = useTranslations('avatar')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [hasAvatar, setHasAvatar] = useState(Boolean(initialUrl))
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<false | 'upload' | 'remove'>(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped after every change so the browser re-fetches: the avatar route
  // answers at one URL per user and is cached for an hour, so without this
  // a replaced picture keeps showing the old one.
  const [version, setVersion] = useState(0)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function onFile(file: File) {
    setError(null)
    setBusy('upload')
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })

    const formData = new FormData()
    formData.append('file', await compressImageIfNeeded(file))
    const res = await fetch('/api/me/avatar', { method: 'POST', body: formData })
    setBusy(false)

    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? t('uploadFailed'))
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return null
      })
      return
    }
    setHasAvatar(true)
    setVersion((v) => v + 1)
    // Drop the local preview now the server has the real thing: leaving it
    // would keep the object URL alive and, because Remove only shows for a
    // saved picture, hide that button until the next page load.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    router.refresh()
  }

  async function onRemove() {
    setError(null)
    setBusy('remove')
    const res = await fetch('/api/me/avatar', { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? t('removeFailed'))
      return
    }
    setHasAvatar(false)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
    setVersion((v) => v + 1)
    router.refresh()
  }

  const shown = preview ?? (hasAvatar ? `/api/avatars/${userId}?v=${version}` : null)

  return (
    <div>
      <span className="label">{t('label')}</span>
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-surface-border bg-surface-subtle">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-center text-[10px] leading-tight text-ink-faint">
              {t('none')}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id="avatar"
            type="file"
            accept="image/jpeg,image/png,image/heic"
            className="input"
            disabled={busy !== false}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
          <p className="mt-1 text-xs text-ink-faint">{busy === 'upload' ? t('chosen') : t('hint')}</p>
          {hasAvatar && !preview && (
            <button
              type="button"
              className="mt-2 text-xs text-red-600 hover:underline dark:text-red-400"
              onClick={onRemove}
              disabled={busy !== false}
            >
              {busy === 'remove' ? t('removing') : t('remove')}
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
