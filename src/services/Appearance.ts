export interface Appearance {
  theme: 'light' | 'dark'
  canvas?: string
  card?: string
  text?: string
}

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem('infinity-appearance') ?? 'null')
    if (saved && (saved.theme === 'light' || saved.theme === 'dark')) {
      const colors: Partial<Appearance> = {}
      for (const key of ['canvas', 'card', 'text'] as const) {
        if (typeof saved[key] === 'string' && /^#[\da-f]{6}$/i.test(saved[key])) colors[key] = saved[key]
      }
      return { theme: saved.theme, ...colors }
    }
  } catch { /* Fall back to the previous theme preference. */ }
  return { theme: localStorage.getItem('infinity-theme') === 'light' ? 'light' : 'dark' }
}

