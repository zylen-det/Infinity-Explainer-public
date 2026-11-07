import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom'
import { drag, type D3DragEvent } from 'd3-drag'
import { CanvasContext, NodeContext, PortalContext, useCanvas, useNodes, useEdges, useViewport } from './context'
import { createCanvasStore, nodeSize, type Node, type Edge, type Viewport, type ViewOptions, type Point } from './store'
import type { ExplainerNodeData } from '../core/types'
import './canvas.css'

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCanvasStore)
  return <CanvasContext.Provider value={store}>{children}</CanvasContext.Provider>
}

type NodeComponent = ComponentType<{ id: string; data: ExplainerNodeData; selected?: boolean; width?: number; height?: number }>
type Deleted = { nodes: Node[]; edges: Edge[] }
interface CanvasProps {
  defaultNodes: Node[]
  defaultEdges: Edge[]
  defaultViewport?: Viewport
  nodeTypes: Record<string, NodeComponent>
  edgeTypes: Record<string, ComponentType<Record<string, unknown>>>
  zoomOnScroll: boolean
  zoomOnPinch: boolean
  edgesVisible: boolean
  nodesDraggable: boolean
  deleteKeyCode: string[] | null
  onMoveStart: () => void
  onMoveEnd: (event: Event | null) => void
  onPaneContextMenu: (event: ReactMouseEvent) => void
  onDelete?: (deleted: Deleted) => void
  onBeforeDelete?: (deleted: Deleted) => Promise<boolean>
  children: ReactNode
}
const interactive = 'input, textarea, select, button, a, [contenteditable], [role="textbox"], [role="dialog"]'
const noDrag = `.nodrag, .canvas__resize-control, ${interactive}`

export function Canvas(props: CanvasProps) {
  const store = useCanvas()
  const nodes = useNodes(), edges = useEdges()
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  const panKey = useRef(false)
  const [panWithSpace, setPanWithSpace] = useState(false)
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  const [selection, setSelection] = useState<{ start: Point; end: Point } | null>(null)
  useLayoutEffect(() => { latest.current = props })

  useLayoutEffect(() => {
    const element = root.current!
    const initial = latest.current
    store.update({ nodes: initial.defaultNodes, edges: initial.defaultEdges,
      transform: initial.defaultViewport ? [initial.defaultViewport.x, initial.defaultViewport.y, initial.defaultViewport.zoom] : [0, 0, 1] })
    const dimensions = () => store.update({ width: element.clientWidth, height: element.clientHeight })
    dimensions()
    const observer = new ResizeObserver(dimensions)
    observer.observe(element)
    const surface = select(element)
    let animation = 0
    let finish: ((completed: boolean) => void) | undefined
    const cancelAnimation = () => { cancelAnimationFrame(animation); animation = 0; finish?.(false); finish = undefined }
    const behavior = zoom<HTMLDivElement, unknown>()
      .extent(() => [[0, 0], [element.clientWidth, element.clientHeight]])
      .scaleExtent([0.1, 4])
      .clickDistance(3)
      .filter((event: Event & { button?: number; ctrlKey?: boolean; shiftKey?: boolean }) => {
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest('.nopan')) return false
        if (event.type === 'wheel') return latest.current.zoomOnScroll && !target?.closest('.nowheel')
        if (event.type === 'dblclick') return false
        if (event.type.startsWith('touch')) {
          if ((event as TouchEvent).touches.length > 1) return latest.current.zoomOnPinch
          return !target?.closest('.canvas__node')
        }
        return !event.button && !event.shiftKey && !event.ctrlKey && (panKey.current || !target?.closest('.canvas__node'))
      })
      .on('start', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        element.dataset.moving = 'true'
        if (event.sourceEvent) cancelAnimation()
        latest.current.onMoveStart()
      })
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        const { x, y, k } = event.transform
        const previous = store.getState().transform
        if (previous[0] !== x || previous[1] !== y || previous[2] !== k) store.update({ transform: [x, y, k] })
      })
      .on('end', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        element.dataset.moving = 'false'
        latest.current.onMoveEnd(event.sourceEvent ?? null)
      })
    surface.call(behavior).on('dblclick.zoom', null)
    const apply = (viewport: Viewport) => surface.call(behavior.transform, zoomIdentity.translate(viewport.x, viewport.y).scale(viewport.zoom))
    apply(store.getViewport())
    store.attach(element, (target: Viewport, options: ViewOptions = {}) => {
      cancelAnimation()
      const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : options.duration ?? 0
      if (!duration) { apply(target); return Promise.resolve(true) }
      const from = store.getViewport(), start = performance.now()
      return new Promise<boolean>(resolve => {
        finish = resolve
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration)
          const t = options.interpolate === 'linear' ? progress : progress * progress * (3 - 2 * progress)
          apply({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t,
            zoom: from.zoom + (target.zoom - from.zoom) * t })
          if (progress < 1) animation = requestAnimationFrame(tick)
          else { animation = 0; finish = undefined; resolve(true) }
        }
        animation = requestAnimationFrame(tick)
      })
    })
    // Update the common world layer directly; camera motion does not rerender cards.
    const world = element.querySelector<HTMLElement>('.canvas__viewport')!
    const paint = () => {
      const [x, y, k] = store.getState().transform
      world.style.transform = `translate(${x}px, ${y}px) scale(${k})`
    }
    paint()
    const unsubscribe = store.subscribe((next, previous) => { if (next.transform !== previous.transform) paint() })
    return () => {
      cancelAnimation(); observer.disconnect(); unsubscribe(); surface.on('.zoom', null); store.detach()
    }
  }, [store])

  useEffect(() => {
    const release = () => { panKey.current = false; setPanWithSpace(false) }
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.defaultPrevented || !latest.current.nodesDraggable || !(event.target instanceof Element) || event.target.closest(interactive)) return
      event.preventDefault()
      panKey.current = true
      setPanWithSpace(true)
    }
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') release() }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('keyup', keyup)
    window.addEventListener('blur', release)
    return () => { document.removeEventListener('keydown', keydown, true); document.removeEventListener('keyup', keyup); window.removeEventListener('blur', release) }
  }, [])

  useEffect(() => {
    let deleting = false
    const keydown = async (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !(event.target instanceof Element) || event.target.closest(interactive)) return
      if (!latest.current.deleteKeyCode?.includes(event.key) || deleting) return
      const state = store.getState(), nodes = state.nodes.filter(node => node.selected)
      const ids = new Set(nodes.map(node => node.id))
      const edges = state.edges.filter(edge => (latest.current.edgesVisible && edge.selected) || ids.has(edge.source) || ids.has(edge.target))
      if (!nodes.length && !edges.length) return
      event.preventDefault()
      deleting = true
      try {
        if (latest.current.onBeforeDelete && !await latest.current.onBeforeDelete({ nodes, edges })) return
        const edgeIds = new Set(edges.map(edge => edge.id))
        store.update({ nodes: store.getNodes().filter(node => !ids.has(node.id)), edges: store.getEdges().filter(edge => !edgeIds.has(edge.id)) })
        latest.current.onDelete?.({ nodes, edges })
      } finally { deleting = false }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [store])

  return <div ref={root} className="canvas" onContextMenu={event => {
    if (!(event.target as Element).closest('.canvas__node')) props.onPaneContextMenu(event)
  }} onClick={event => {
    if (event.shiftKey || (event.target as Element).closest('.canvas__node, .canvas__edge')) return
    store.update({ nodes: store.getNodes().map(node => node.selected ? { ...node, selected: false } : node),
      edges: store.getEdges().map(edge => edge.selected ? { ...edge, selected: false } : edge) })
  }} onPointerDown={event => {
    if (!event.shiftKey || event.button || (event.target as Element).closest('.canvas__node')) return
    event.preventDefault()
    const start = { x: event.clientX, y: event.clientY }
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      const end = { x: e.clientX, y: e.clientY }
      const a = store.screenToCanvasPosition(start), b = store.screenToCanvasPosition(end)
      store.setNodes(current => current.map(node => ({ ...node, selected: node.position.x >= Math.min(a.x, b.x) &&
        node.position.y >= Math.min(a.y, b.y) && node.position.x + nodeSize(node).width <= Math.max(a.x, b.x) &&
        node.position.y + nodeSize(node).height <= Math.max(a.y, b.y) })))
      const bounds = element.getBoundingClientRect()
      setSelection({ start: { x: start.x - bounds.left, y: start.y - bounds.top }, end: { x: end.x - bounds.left, y: end.y - bounds.top } })
    }
    const end = () => { setSelection(null); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', end); element.removeEventListener('pointercancel', end) }
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', end); element.addEventListener('pointercancel', end)
  }}>
    {props.children}
    <div className="canvas__pane" />
    <div className="canvas__viewport">
      <PortalContext.Provider value={portal}>
        <div className="canvas__nodes">{nodes.filter(node => !node.hidden).map(node => {
          const Component = props.nodeTypes[node.type ?? 'explainer']
          return Component && <NodeView key={node.id} node={node} Component={Component} draggable={props.nodesDraggable && !panWithSpace} />
        })}</div>
        <svg className="canvas__edges" style={{ display: props.edgesVisible ? undefined : 'none' }}>{edges.map(edge => {
          const Component = props.edgeTypes[edge.type ?? 'animatedEdge']
          return Component && <g key={edge.id} className={`canvas__edge${edge.selected ? ' selected' : ''}`} data-id={edge.id}>
            <Component {...edge} />
          </g>
        })}</svg>
        <div ref={setPortal} className="canvas__viewport-portal" />
      </PortalContext.Provider>
    </div>
    {selection && <div className="canvas__selection" style={{ left: Math.min(selection.start.x, selection.end.x), top: Math.min(selection.start.y, selection.end.y),
      width: Math.abs(selection.start.x - selection.end.x), height: Math.abs(selection.start.y - selection.end.y) }} />}
  </div>
}

function NodeView({ node, Component, draggable }: { node: Node; Component: NodeComponent; draggable: boolean }) {
  const store = useCanvas()
  const element = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const el = element.current!, selection = select(el)
    let previous: Point | null = null
    let moving = new Set<string>()
    const behavior = drag<HTMLDivElement, unknown>()
      .container(() => el.closest<HTMLElement>('.canvas')!)
      .clickDistance(3)
      .filter((event: MouseEvent | TouchEvent) => draggable && !('button' in event && event.button) && !event.ctrlKey &&
        !('touches' in event && event.touches.length > 1) && !(event.target as Element).closest(noDrag))
      .on('start', (event: D3DragEvent<HTMLDivElement, unknown, unknown>) => {
        const current = store.getNode(node.id)
        moving = new Set(current?.selected ? store.getNodes().filter(n => n.selected).map(n => n.id) : [node.id])
        previous = { x: event.x, y: event.y }
        setDragging(true)
      })
      .on('drag', (event: D3DragEvent<HTMLDivElement, unknown, unknown>) => {
        if (!previous) return
        const dx = (event.x - previous.x) / store.getZoom(), dy = (event.y - previous.y) / store.getZoom()
        previous = { x: event.x, y: event.y }
        store.setNodes(nodes => nodes.map(n => moving.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n))
      })
      .on('end', () => { previous = null; setDragging(false) })
    selection.call(behavior)
    return () => { selection.on('.drag', null) }
  }, [store, node.id, draggable])
  const size = nodeSize(node)
  return <NodeContext.Provider value={node.id}><div ref={element} data-id={node.id}
    className={`canvas__node canvas__node-${node.type ?? 'explainer'} selectable${node.selected ? ' selected' : ''}${draggable ? ' draggable' : ''}${dragging ? ' dragging' : ''}`}
    tabIndex={0} role="group" aria-label="Card" style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)`, width: size.width, height: size.height }}
    onFocus={event => {
      // Tab navigation must bring an offscreen node into view without moving
      // its data or letting native scrolling introduce a second camera offset.
      if (event.target !== event.currentTarget) return
      const bounds = event.currentTarget.closest('.canvas')!.getBoundingClientRect()
      const box = event.currentTarget.getBoundingClientRect()
      if (box.right > bounds.left && box.left < bounds.right && box.bottom > bounds.top && box.top < bounds.bottom) return
      const current = store.getNode(node.id)
      if (!current) return
      const size = nodeSize(current), zoom = store.getZoom()
      void store.setViewport({ x: bounds.width / 2 - (current.position.x + size.width / 2) * zoom,
        y: bounds.height / 2 - (current.position.y + size.height / 2) * zoom, zoom })
    }}
    onClick={event => {
      if ((event.target as Element).closest(interactive)) return
      const multiple = event.metaKey || event.ctrlKey || event.shiftKey
      store.setNodes(nodes => nodes.map(n => ({ ...n, selected: n.id === node.id ? (multiple ? !n.selected : true) : multiple ? n.selected : false })))
    }} onKeyDown={event => {
      if (event.defaultPrevented || !draggable || (event.target as Element).closest(interactive)) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        store.setNodes(nodes => nodes.map(n => n.id === node.id ? { ...n, selected: !n.selected } : n))
        return
      }
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      if (!delta) return
      event.preventDefault()
      const step = event.shiftKey ? 4 : 1
      store.setNodes(nodes => nodes.map(n => n.id === node.id || n.selected ? { ...n, position: { x: n.position.x + delta[0] * step, y: n.position.y + delta[1] * step } } : n))
    }}>
    <Component id={node.id} data={node.data as unknown as ExplainerNodeData} selected={node.selected} width={size.width} height={size.height} />
  </div></NodeContext.Provider>
}

export function ViewportPortal({ children }: { children: ReactNode }) {
  const target = useContext(PortalContext)
  return target ? createPortal(children, target) : null
}

export function Background() {
  const { x, y, zoom } = useViewport()
  const pattern = useId(), gap = 22 * zoom
  return <svg className="canvas__background" width="100%" height="100%" aria-hidden="true">
    <defs><pattern id={pattern} x={x % gap} y={y % gap} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`translate(${-gap / 2}, ${-gap / 2})`}>
      <circle cx={zoom} cy={zoom} r={zoom} fill="var(--grid)" />
    </pattern></defs>
    <rect width="100%" height="100%" fill={`url(#${pattern})`} />
  </svg>
}

export function NodeResizer({ minWidth, minHeight, isVisible }: { minWidth: number; minHeight: number; isVisible: boolean }) {
  const store = useCanvas(), id = useContext(NodeContext)!
  const ref = useRef<HTMLDivElement>(null)
  // Retain resize handles in the card's coordinate system, including opposite-edge anchoring.
  useEffect(() => {
    if (!isVisible || !ref.current) return
    const controls = select(ref.current).selectAll<HTMLDivElement, unknown>('.canvas__resize-control')
    let start: { x: number; y: number; node: Node; left: boolean; top: boolean; horizontal: boolean; vertical: boolean } | null = null
    const behavior = drag<HTMLDivElement, unknown>().container(() => rootElement())
      .on('start', function(event: D3DragEvent<HTMLDivElement, unknown, unknown>) {
        const node = store.getNode(id)
        if (!node) return
        start = { x: event.x, y: event.y, node, left: this.classList.contains('left'), top: this.classList.contains('top'),
          horizontal: this.classList.contains('left') || this.classList.contains('right'), vertical: this.classList.contains('top') || this.classList.contains('bottom') }
      })
      .on('drag', (event: D3DragEvent<HTMLDivElement, unknown, unknown>) => {
        if (!start) return
        const { node, left, top, horizontal, vertical } = start, size = nodeSize(node)
        const dx = (event.x - start.x) / store.getZoom(), dy = (event.y - start.y) / store.getZoom()
        const width = horizontal ? Math.max(minWidth, size.width + (left ? -dx : dx)) : size.width
        const height = vertical ? Math.max(minHeight, size.height + (top ? -dy : dy)) : size.height
        store.setNodes(nodes => nodes.map(n => n.id === id ? { ...n, width, height,
          position: { x: node.position.x + (left ? size.width - width : 0), y: node.position.y + (top ? size.height - height : 0) } } : n))
      }).on('end', () => { start = null })
    function rootElement() { return ref.current!.closest<HTMLElement>('.canvas')! }
    controls.call(behavior)
    return () => { controls.on('.drag', null) }
  }, [store, id, minWidth, minHeight, isVisible])
  if (!isVisible) return null
  return <div ref={ref} className="canvas__resizer nodrag nopan">
    {['top', 'right', 'bottom', 'left'].map(side => <div key={side} className={`canvas__resize-control line ${side}`} />)}
    {['top left', 'top right', 'bottom left', 'bottom right'].map(side => <div key={side} className={`canvas__resize-control handle ${side}`} />)}
  </div>
}
