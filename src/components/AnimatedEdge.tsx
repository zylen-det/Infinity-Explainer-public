import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useInternalNode, useCanvas, useStore } from '../canvas/context'
import { ViewportPortal } from '../canvas/Canvas'
import type { AnimatedEdgeData } from '../core/types'
import { resolveSelection, selectionBody } from '../core/selectionAnchor'
import { traceCanvas } from '../services/CanvasTrace'

import { useReadingMode } from '../reading/context'

type Point = { x: number; y: number }
type Box = Point & { width: number; height: number }
type Geometry = { start: Point; end: Point; rects: Box[]; body: HTMLElement | null; bodyBox: Box | null; detached: boolean }

/** Dock to the facing side, away from the card's rounded corners. */
function boundary(box: Box, toward: Point): Point {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (Math.abs(dx) / box.width >= Math.abs(dy) / box.height) {
    const x = dx >= 0 ? box.x + box.width : box.x
    return { x, y: Math.max(box.y + 20, Math.min(box.y + box.height - 20, cy + dy * Math.abs((x - cx) / (dx || 1)))) }
  }
  const y = dy >= 0 ? box.y + box.height : box.y
  return { x: Math.max(box.x + 20, Math.min(box.x + box.width - 20, cx + dx * Math.abs((y - cy) / (dy || 1)))), y }
}

function SelectionMark({ rect, geometry, target, text }: { rect: Box; geometry: Geometry; target: string; text: string }) {
  const content = useRef<HTMLSpanElement>(null)
  const flow = useCanvas()
  const reading = useReadingMode()
  useLayoutEffect(() => {
    if (!content.current || !geometry.body || !geometry.bodyBox) return
    // Mirror the original rendered DOM and clip it to this line. This keeps bold,
    // inline code, and KaTeX aligned while painting the mark above every edge.
    const copy = geometry.body.cloneNode(true) as HTMLElement
    const style = getComputedStyle(geometry.body)
    Object.assign(copy.style, {
      position: 'absolute', margin: '0', width: `${geometry.bodyBox.width}px`,
      left: `${geometry.bodyBox.x - rect.x}px`, top: `${geometry.bodyBox.y - rect.y}px`,
      font: style.font, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
      color: 'var(--text)', pointerEvents: 'none',
    })
    copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'))
    copy.querySelectorAll('a,button,input,[tabindex]').forEach(el => el.setAttribute('tabindex', '-1'))
    content.current.replaceChildren(copy)
  }, [geometry, rect])
  return <button className="selection-mark nodrag nopan" data-selection-target={target}
    aria-label={`跳到「${text}」的子卡片`} title={`跳到「${text}」的子卡片`}
    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    onPointerEnter={() => reading.hover(target)} onPointerLeave={() => reading.hover(null)}
    onFocus={() => reading.hover(target)} onBlur={() => reading.hover(null)}
    onPointerDown={e => { e.preventDefault(); e.stopPropagation() }}
    onClick={e => {
      e.stopPropagation()
      window.getSelection()?.removeAllRanges()
      if (reading.activeId) { reading.enter(target); return }
      flow.setNodes(nodes => nodes.map(node => ({ ...node, selected: node.id === target })))
      traceCanvas('viewport-request', { source: 'selection-navigation', target, before: flow.getViewport() }, true)
      void flow.fitView({ nodes: [{ id: target }], padding: 0.4, maxZoom: 1, duration: 250 })
    }}><span aria-hidden="true" ref={content} /></button>
}

function AnimatedEdge(props: Record<string, unknown>) {
  const source = props.source as string, target = props.target as string
  const data = props.data as AnimatedEdgeData | undefined
  const sourceNode = useInternalNode(source), targetNode = useInternalNode(target)
  const transform = useStore(state => state.transform)
  const flow = useCanvas()
  const reading = useReadingMode()
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const path = useRef<SVGPathElement>(null)

  useLayoutEffect(() => {
    if (!sourceNode || !targetNode) return
    let frame = 0
    let active = true
    const sourceCard = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(source)}"]`)
    const targetCard = document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(target)}"]`)
    if (!sourceCard || !targetCard) return
    const box = (rect: DOMRect): Box => {
      const top = flow.screenToCanvasPosition({ x: rect.left, y: rect.top })
      const bottom = flow.screenToCanvasPosition({ x: rect.right, y: rect.bottom })
      return { ...top, width: bottom.x - top.x, height: bottom.y - top.y }
    }
    const measure = () => {
      const sourceBox = box(sourceCard.getBoundingClientRect()), targetBox = box(targetCard.getBoundingClientRect())
      const targetCenter = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 }
      const body = selectionBody(source)
      // Legacy cards can recover a simple term anchor from the child title.
      const title = String(targetNode.data.text ?? '').match(/^【(.+?)】/)?.[1]
      const anchor = data?.selection ?? (title ? { text: title, start: 0, end: title.length, prefix: '', suffix: '' } : undefined)
      const range = body && anchor ? resolveSelection(body, anchor) : null
      const clip = sourceCard.querySelector('.card-content')!.getBoundingClientRect()
      const rects: Box[] = []
      for (const rect of range?.getClientRects() ?? []) {
        const left = Math.max(rect.left, clip.left), right = Math.min(rect.right, clip.right)
        const top = Math.max(rect.top, clip.top), bottom = Math.min(rect.bottom, clip.bottom)
        if (right <= left || bottom <= top) continue
        const current = box(new DOMRect(left, top, right - left, bottom - top))
        const sameLine = rects.find(r => Math.abs(r.y - current.y) < 2 && Math.abs(r.height - current.height) < 3 && current.x <= r.x + r.width + 1 && current.x + current.width >= r.x - 1)
        if (sameLine) {
          const right = Math.max(sameLine.x + sameLine.width, current.x + current.width)
          sameLine.x = Math.min(sameLine.x, current.x); sameLine.width = right - sameLine.x
        } else rects.push(current)
      }
      const closest = rects.reduce<Box | undefined>((best, rect) => {
        const distance = (r: Box) => Math.hypot(r.x + r.width / 2 - targetCenter.x, r.y + r.height / 2 - targetCenter.y)
        return !best || distance(rect) < distance(best) ? rect : best
      }, undefined)
      const start = closest ? {
        x: targetCenter.x >= closest.x + closest.width / 2 ? closest.x + closest.width : closest.x,
        y: closest.y + closest.height / 2,
      } : boundary(sourceBox, targetCenter)
      setGeometry({ start, end: boundary(targetBox, start), rects, body, bodyBox: body ? box(body.getBoundingClientRect()) : null, detached: !!anchor && !range })
    }
    const schedule = () => { if (!active) return; cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule)
    resize.observe(sourceCard); resize.observe(targetCard)
    const initialBody = selectionBody(source)
    if (initialBody) resize.observe(initialBody)
    const mutation = new MutationObserver(schedule)
    mutation.observe(sourceCard, { childList: true, subtree: true, characterData: true })
    mutation.observe(targetCard, { childList: true, subtree: true, characterData: true })
    sourceCard.addEventListener('scroll', schedule, true)
    sourceCard.addEventListener('animationend', schedule)
    targetCard.addEventListener('animationend', schedule)
    window.addEventListener('resize', schedule)
    void document.fonts.ready.then(schedule)
    schedule()
    return () => {
      active = false
      cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect()
      sourceCard.removeEventListener('scroll', schedule, true)
      sourceCard.removeEventListener('animationend', schedule)
      targetCard.removeEventListener('animationend', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [source, target, sourceNode, targetNode, transform, data, flow])

  useEffect(() => {
    if (!path.current || !geometry || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = path.current.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 500, easing: 'ease-out' })
    return () => animation.cancel()
    // Animate once when measurements make the edge available, not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!geometry])

  if (!geometry || (reading.activeId && reading.activeId !== source && reading.activeId !== target)) return null
  const { start, end } = geometry
  const dx = end.x - start.x
  const pathD = `M ${start.x} ${start.y} C ${start.x + dx / 2} ${start.y}, ${start.x + dx / 2} ${end.y}, ${end.x} ${end.y}`
  const readingVisible = !reading.activeId || reading.hoveredTarget === target
  return <>
    <path ref={path} className={`selection-connection${reading.activeId ? " reading-connection" : ""}`}
      style={{ opacity: readingVisible ? 1 : 0 }}
      onPointerEnter={() => reading.hover(target)} onPointerLeave={() => reading.hover(null)}
      onClick={() => { if (reading.activeId) reading.enter(reading.activeId === target ? source : target) }} data-selection-connected={!geometry.detached} d={pathD}
      pathLength={1} fill="none" stroke="var(--secondary)" strokeWidth={1.4} strokeLinecap="round"
      strokeDasharray={geometry.detached ? '0.025 0.025' : '1 0'} />
    <ViewportPortal><div className="selection-mark-layer">
      {geometry.rects.map((rect, index) => <SelectionMark key={index} rect={rect} geometry={geometry} target={target} text={data?.selection?.text ?? String(targetNode?.data.text ?? '').match(/^【(.+?)】/)?.[1] ?? ''} />)}
    </div></ViewportPortal>
  </>
}

export default memo(AnimatedEdge)
