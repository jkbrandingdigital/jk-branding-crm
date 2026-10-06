import { useEffect, useState } from 'react'

// One set of chart colours for the whole app.
// Brand orange leads; the rest are muted so several series can sit together
// without shouting, and each one holds up on cream as well as on black.
export const SERIES = [
  '#FF5E00', // brand orange
  '#0E6A62', // deep teal
  '#B45309', // amber
  '#3F5C8C', // slate blue
  '#7C5295', // plum
  '#5B7F3E', // olive
]

export type ChartTheme = {
  dark: boolean
  grid: string
  axis: string
  axisStrong: string
  cursor: string
  series: string[]
  tooltip: React.CSSProperties
  tooltipItem: React.CSSProperties
}

const DARK: ChartTheme = {
  dark: true,
  grid: '#242424',
  axis: '#8a8a8a',
  axisStrong: '#c4c4c4',
  cursor: 'rgba(255,255,255,0.05)',
  series: SERIES,
  tooltip: {
    background: '#1a1a1a',
    border: '1px solid #2e2e2e',
    borderRadius: 10,
    color: '#fff',
    fontSize: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,.45)',
  },
  tooltipItem: { color: '#e5e5e5' },
}

const LIGHT: ChartTheme = {
  dark: false,
  grid: '#ECE3D6',
  axis: '#8A7D70',
  axisStrong: '#4B4036',
  cursor: 'rgba(255,94,0,0.07)',
  series: SERIES,
  tooltip: {
    background: '#ffffff',
    border: '1px solid #ECE3D6',
    borderRadius: 10,
    color: '#17120E',
    fontSize: 12,
    boxShadow: '0 12px 32px rgba(23,18,14,.14)',
  },
  tooltipItem: { color: '#4B4036' },
}

// Follows the Light/Dark switch in the header without a page reload
export function useChartTheme(): ChartTheme {
  const read = () => (document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT : DARK)
  const [theme, setTheme] = useState<ChartTheme>(read)

  useEffect(() => {
    const watcher = new MutationObserver(() => setTheme(read()))
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => watcher.disconnect()
  }, [])

  return theme
}