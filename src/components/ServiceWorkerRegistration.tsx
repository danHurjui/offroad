'use client'

import { useEffect } from 'react'

// RL-010: PWA install prompt & offline shell.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline shell is a progressive enhancement — a failed
        // registration should never block the app from working online.
      })
    }
  }, [])

  return null
}
