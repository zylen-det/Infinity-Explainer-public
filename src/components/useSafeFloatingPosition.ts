import { useLayoutEffect, type RefObject } from 'react'

/** Popovers use viewport coordinates; keep them inside the app's safe rectangle. */
export function useSafeFloatingPosition(ref: RefObject<HTMLDivElement | null>, x?: number, y?: number) {
  useLayoutEffect(() => {
    const element = ref.current
    const app = document.querySelector('.app')
    if (!element || !app || x === undefined || y === undefined) return
    const place = () => {
      const bounds = app.getBoundingClientRect()
      element.style.maxWidth = `${Math.max(0, bounds.width - 16)}px`
      element.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`
      const width = element.offsetWidth, height = element.offsetHeight
      element.style.left = `${Math.max(bounds.left + 8, Math.min(x, bounds.right - width - 8))}px`
      element.style.top = `${Math.max(bounds.top + 8, Math.min(y, bounds.bottom - height - 8))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(app)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, x, y])
}
