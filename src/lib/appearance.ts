// Remembers the look: dark or light, and how big the text is.
// Saved on this device only, so each person picks their own.

export type Theme = 'dark' | 'light'
export type TextSize = 'small' | 'normal' | 'large'

const THEME_KEY = 'jk_theme'
const SIZE_KEY = 'jk_text_size'

const PX: Record<TextSize, string> = { small: '16px', normal: '17px', large: '19px' }

export function getTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return v === 'small' || v === 'large' ? v : 'normal'
  } catch {
    return 'normal'
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* private browsing: the choice just won't be remembered */
  }
}

export function applyTextSize(size: TextSize) {
  document.documentElement.style.setProperty('--app-font', PX[size])
  try {
    localStorage.setItem(SIZE_KEY, size)
  } catch {
    /* same here */
  }
}

// Called once when the app starts, before anything is drawn
export function applySavedAppearance() {
  applyTheme(getTheme())
  applyTextSize(getTextSize())
}