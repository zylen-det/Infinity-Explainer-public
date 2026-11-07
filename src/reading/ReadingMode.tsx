import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNodes, useCanvas } from '../canvas/context'
import type { Viewport } from '../canvas/store'
import { MarkdownContent } from '../components/MarkdownContent'
import { readingProgress } from './progress'
import { ReadingContext, useReadingMode } from './context'
import { traceCanvas } from '../services/CanvasTrace'

export function ReadingOverlay() { return useReadingMode().overlay }

export function ReadingModeProvider({ children }: { children: ReactNode }) {
  const flow = useCanvas()
  const nodes = useNodes()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredTarget, hover] = useState<string | null>(null)
  const [metrics, setMetrics] = useState(() => readingProgress(0, 1, 1, 0))
  const [mapSize, setMapSize] = useState({ width: 1, height: 1, track: 1, mapWidth: 96 })
  const positions = useRef(new Map<string, number>())
  const previous = useRef<Viewport | null>(null)
  const manualZoom = useRef<number | null>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const applyRef = useRef<(position?: number, animate?: boolean) => void>(() => {})
  const active = nodes.find(node => node.id === activeId)

  const enter = (id?: string) => {
    const all = flow.getNodes()
    const next = id ?? all.find(node => node.selected)?.id ?? all[0]?.id
    if (!next) return
    traceCanvas('reading-enter', { nodeId: next, previousId: activeId, viewport: flow.getViewport() })
    if (!activeId) {
      previous.current = flow.getViewport()
      manualZoom.current = null
    }
    hover(null)
    setActiveId(next)
    if (next === activeId) applyRef.current(undefined, true)
  }
  const exit = () => {
    setActiveId(null)
    hover(null)
    if (previous.current) {
      traceCanvas('viewport-request', { source: 'reading-exit', before: flow.getViewport(), target: previous.current }, true)
      void flow.setViewport(previous.current, { duration: 200 })
    }
  }
  const zoomTo = (zoom?: number) => {
    if (!activeId || (zoom !== undefined && !Number.isFinite(zoom))) return
    manualZoom.current = zoom === undefined ? null : Math.max(0.1, Math.min(4, zoom))
    applyRef.current()
  }
  const snap = () => {
    if (!activeId) return
    const pane = document.querySelector('.canvas')?.getBoundingClientRect()
    if (!pane) return
    const center = flow.screenToCanvasPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
    let closest = activeId, best = Infinity
    // Distance to the rectangle, so a long card stays selected at its lower end.
    for (const node of flow.getNodes()) {
      const w = node.measured?.width ?? node.width ?? 360
      const h = node.measured?.height ?? node.height ?? 280
      const dx = Math.max(node.position.x - center.x, 0, center.x - node.position.x - w)
      const dy = Math.max(node.position.y - center.y, 0, center.y - node.position.y - h)
      const distance = Math.hypot(dx, dy)
      if (distance < best || (distance === best && node.id === activeId)) { best = distance; closest = node.id }
    }
    enter(closest)
  }

  useEffect(() => {
    if (!activeId) return
    const card = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(activeId)}"]`)
    const content = card?.querySelector<HTMLElement>('.card-content')
    const pane = document.querySelector<HTMLElement>('.canvas')
    if (!card || !content || !pane) return
    let alive = true
    let frame = 0
    let targetViewport: Viewport | null = null
    const apply = (position = positions.current.get(activeId) ?? 0, animate = false, reason = 'interaction') => {
      const bounds = pane.getBoundingClientRect()
      // Reserve equal space on both sides so the minimap does not offset the card.
      const sideSpace = bounds.width < 700 ? 88 : 136
      const availableWidth = Math.max(100, bounds.width - sideSpace * 2)
      const zoom = manualZoom.current ?? Math.min(1.25, availableWidth / card.offsetWidth)
      const visible = Math.max(80, bounds.height - 240) / zoom
      const next = readingProgress(position, card.offsetHeight, visible, content.scrollHeight - content.clientHeight)
      positions.current.set(activeId, next.current)
      content.scrollTop = next.scroll
      setMetrics(next)
      setMapSize({ width: content.clientWidth, height: next.content, track: mapRef.current?.clientHeight ?? 1, mapWidth: mapRef.current?.clientWidth ?? 96 })
      const left = (bounds.width - card.offsetWidth * zoom) / 2
      const top = (bounds.height - next.visible * zoom) / 2
      const target = { x: left - (flow.getNode(activeId)?.position.x ?? 0) * zoom,
        y: top - (flow.getNode(activeId)?.position.y ?? 0) * zoom - next.camera * zoom, zoom }
      // Initial resize/font notifications must not replace an in-flight snap
      // with an immediate move to the very same destination.
      if (reason !== 'interaction' && targetViewport?.x === target.x && targetViewport?.y === target.y && targetViewport?.zoom === target.zoom) return
      targetViewport = target
      traceCanvas('viewport-request', { source: 'reading-mode', reason, nodeId: activeId,
        before: flow.getViewport(), progress: next.current }, true)
      void flow.setViewport(target,
        { duration: animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 0, interpolate: 'linear' })
    }
    applyRef.current = apply
    const schedule = (reason: string) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (alive) apply(undefined, false, reason) }) }
    const observer = new ResizeObserver(() => schedule('resize'))
    observer.observe(pane); observer.observe(card); observer.observe(content)
    if (mapRef.current) observer.observe(mapRef.current)
    for (const child of content.children) observer.observe(child)
    const mutations = new MutationObserver(() => schedule('content-change'))
    mutations.observe(content, { childList: true, subtree: true, characterData: true })
    apply(undefined, true)
    const wheel = (e: WheelEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.canvas, .reading-minimap')) return
      e.preventDefault(); e.stopPropagation()
      const scale = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? pane.clientHeight : 1
      apply((positions.current.get(activeId) ?? 0) + e.deltaY * scale / flow.getZoom())
    }
    let touchY: number | null = null
    const touchStart = (e: TouchEvent) => {
      touchY = e.touches.length === 1 && (e.target as Element).closest('.reading-active .card-content') ? e.touches[0].clientY : null
    }
    const touchMove = (e: TouchEvent) => {
      if (touchY === null || e.touches.length !== 1) return
      e.preventDefault(); e.stopPropagation()
      const y = e.touches[0].clientY
      apply((positions.current.get(activeId) ?? 0) + (touchY - y) / flow.getZoom())
      touchY = y
    }
    const touchEnd = () => { touchY = null }
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { exit(); return }
      if ((e.target as Element)?.closest('input, textarea, button, a, [contenteditable]')) return
      const step = ({ ArrowDown: 50, ArrowUp: -50, PageDown: 500, PageUp: -500, ' ': e.shiftKey ? -500 : 500 } as Record<string, number>)[e.key]
      if (step !== undefined || e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        apply(e.key === 'Home' ? 0 : e.key === 'End' ? Number.MAX_SAFE_INTEGER : (positions.current.get(activeId) ?? 0) + step)
      }
    }
    window.addEventListener('wheel', wheel, { capture: true, passive: false })
    window.addEventListener('keydown', keyboard)
    window.addEventListener('touchstart', touchStart, { capture: true, passive: true })
    window.addEventListener('touchmove', touchMove, { capture: true, passive: false })
    window.addEventListener('touchend', touchEnd)
    window.addEventListener('touchcancel', touchEnd)
    void document.fonts.ready.then(() => { if (alive) schedule('fonts-ready') })
    return () => {
      alive = false; cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect()
      window.removeEventListener('wheel', wheel, true); window.removeEventListener('keydown', keyboard)
      window.removeEventListener('touchstart', touchStart, true); window.removeEventListener('touchmove', touchMove, true)
      window.removeEventListener('touchend', touchEnd); window.removeEventListener('touchcancel', touchEnd)
    }
    // The active card owns the reading session; updates are measured by observers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, flow])

  useEffect(() => {
    if (activeId && !active) { setActiveId(null) }
  }, [activeId, active])

  const text = String(active?.data.text ?? '')
  const ratio = metrics.visible / metrics.content
  const progress = metrics.total ? metrics.current / metrics.total : 0
  const previewScale = Math.min(mapSize.mapWidth / mapSize.width, mapSize.track / mapSize.height)
  const drag = useRef<{ y: number; position: number } | null>(null)
  const overlay = <>
    {activeId && <aside className="reading-minimap" aria-label="閱讀導覽">
      <div className="reading-map-title">{text.match(/^【(.+?)】/)?.[1] ?? '閱讀進度'}</div>
      <div ref={mapRef} className="reading-map-track" style={{ height: mapSize.height * mapSize.mapWidth / mapSize.width }} role="slider" tabIndex={0}
        aria-label="閱讀進度" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onKeyDown={e => {
          const delta = e.key === 'ArrowDown' ? 50 : e.key === 'ArrowUp' ? -50 : e.key === 'PageDown' ? 500 : e.key === 'PageUp' ? -500 : 0
          if (delta || e.key === 'Home' || e.key === 'End') {
            e.preventDefault(); e.stopPropagation()
            applyRef.current(e.key === 'Home' ? 0 : e.key === 'End' ? metrics.total : metrics.current + delta)
          }
        }}
        onPointerDown={e => {
          e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId)
          const box = e.currentTarget.getBoundingClientRect()
          const onIndicator = (e.target as Element).closest('.reading-map-indicator')
          const position = onIndicator ? metrics.current : Math.max(0, Math.min(1, ((e.clientY - box.top) / box.height - ratio / 2) / (1 - ratio || 1))) * metrics.total
          drag.current = { y: e.clientY, position }; applyRef.current(position)
        }}
        onPointerMove={e => {
          if (!drag.current || !mapRef.current) return
          const travel = mapRef.current.clientHeight * (1 - ratio)
          applyRef.current(drag.current.position + (e.clientY - drag.current.y) / (travel || 1) * metrics.total)
        }}
        onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <div className="reading-map-preview" aria-hidden="true" inert
          style={{ width: mapSize.width, left: (mapSize.mapWidth - mapSize.width * previewScale) / 2, transform: `scale(${previewScale})` }}>
          {text.match(/^【(.+?)】/) && <h2 className="card-title">{text.match(/^【(.+?)】/)?.[1]}</h2>}
          <MarkdownContent text={text.replace(/^【.+?】\s*/, '')} />
        </div>
        <div className="reading-map-indicator" style={{ height: `${ratio * 100}%`, top: `${progress * (1 - ratio) * 100}%` }} />
      </div>
      <output>{Math.round(progress * 100)}%</output>
    </aside>}
  </>
  return <ReadingContext.Provider value={{ activeId, hoveredTarget, hover, enter, exit, snap, zoomTo, overlay }}>{children}</ReadingContext.Provider>
}
