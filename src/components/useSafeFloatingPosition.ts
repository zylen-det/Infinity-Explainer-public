import { useLayoutEffect, type RefObject } from 'react'

/** Popovers use viewport coordinates; keep them inside the app's safe rectangle. */
export function useSafeFloatingPosition(ref: RefObject<HTMLDivElement | null>, x?: number, y?: number, dockOnMobile = false) {
  useLayoutEffect(() => {
    const element = ref.current
    const app = document.querySelector('.app')
    if (!element || !app || x === undefined || y === undefined) return
    const mobile = window.matchMedia('(max-width:700px), (hover:none) and (pointer:coarse)')
    const place = () => {
      const bounds = app.getBoundingClientRect()
      element.style.maxWidth = `${Math.max(0, bounds.width - 16)}px`
      element.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`
      const width = element.offsetWidth, height = element.offsetHeight
      const docked = dockOnMobile && mobile.matches
      element.style.left = `${Math.max(bounds.left + 8, Math.min(docked ? bounds.left + (bounds.width - width) / 2 : x, bounds.right - width - 8))}px`
      element.style.top = `${Math.max(bounds.top + 8, Math.min(docked ? bounds.bottom - height - 12 : y, bounds.bottom - height - 8))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(app)
    observer.observe(element)
    mobile.addEventListener('change', place)
    return () => { observer.disconnect(); mobile.removeEventListener('change', place) }
  }, [ref, x, y, dockOnMobile])
}
