'use client'

import { useEffect, useState } from 'react'

/**
 * Recharts draws to SVG with literal colour props, so it can't pick up the
 * CSS variables the rest of the app themes with. This watches the `dark`
 * class on <html> — the same thing ThemeToggle and the no-flash script
 * write — and hands back a matching palette.
 *
 * A MutationObserver rather than a matchMedia listener: the class is what
 * actually decides the theme, and it changes on an explicit toggle as well
 * as on an OS change.
 */
export interface ChartTheme {
  /** Series colour. Brand-500 is too dark to read on a dark card. */
  accent: string
  grid: string
  axis: string
  tooltipBg: string
  tooltipBorder: string
  /** Target/threshold lines — green, lightened for dark. */
  positive: string
}

const LIGHT: ChartTheme = {
  accent: '#2A5D8C',
  grid: '#D3D9E0',
  axis: '#545C68',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#D3D9E0',
  positive: '#16A34A',
}

const DARK: ChartTheme = {
  accent: '#79A5C6',
  grid: '#343C46',
  axis: '#9CA5B0',
  tooltipBg: '#181C22',
  tooltipBorder: '#343C46',
  positive: '#4ADE80',
}

export function useChartTheme(): ChartTheme {
  // Start light: the server has no way to know, and a chart that re-colours
  // one frame after mount is better than a hydration mismatch.
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains('dark'))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return dark ? DARK : LIGHT
}
