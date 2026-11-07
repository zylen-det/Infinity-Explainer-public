export interface Point { x: number; y: number }
export interface Viewport extends Point { zoom: number }
export interface Node {
  id: string
  type?: string
  position: Point
  width?: number
  height?: number
  measured?: { width: number; height: number }
  selected?: boolean
  hidden?: boolean
  data: Record<string, unknown>
}
export interface Edge {
  id: string
  source: string
  target: string
  type?: string
  sourceHandle?: string
  targetHandle?: string
  selected?: boolean
  data?: Record<string, unknown>
}
export interface CanvasState {
  nodes: Node[]
  edges: Edge[]
  transform: [number, number, number]
  width: number
  height: number
}
export type ViewOptions = { duration?: number; interpolate?: 'linear' | 'smooth' }
export type FitOptions = ViewOptions & { nodes?: { id: string }[]; padding?: number; minZoom?: number; maxZoom?: number }
type Updater<T> = T | ((previous: T) => T)

export const nodeSize = (node: Node) => ({
  width: node.width ?? node.measured?.width ?? (Number(node.data.w) || 360),
  height: node.height ?? node.measured?.height ?? (Number(node.data.h) || 280),
})

/** Presentation state belongs to the app; D3 only supplies gesture input. */
export function createCanvasStore() {
  let state: CanvasState = { nodes: [], edges: [], transform: [0, 0, 1], width: 0, height: 0 }
  const listeners = new Set<(next: CanvasState, previous: CanvasState) => void>()
  let surface: HTMLElement | null = null
  let moveCamera: ((viewport: Viewport, options?: ViewOptions) => Promise<boolean>) | null = null
  const update = (patch: Partial<CanvasState>) => {
    const previous = state
    state = { ...state, ...patch }
    const next = state
    listeners.forEach(listener => listener(next, previous))
  }
  const getViewport = (): Viewport => ({ x: state.transform[0], y: state.transform[1], zoom: state.transform[2] })
  const setViewport = (viewport: Viewport, options?: ViewOptions): Promise<boolean> => {
    if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite) || viewport.zoom <= 0) return Promise.resolve(false)
    if (moveCamera) return moveCamera(viewport, options)
    update({ transform: [viewport.x, viewport.y, viewport.zoom] })
    return Promise.resolve(true)
  }
  return {
    getState: () => state,
    subscribe: (listener: (next: CanvasState, previous: CanvasState) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update,
    attach: (element: HTMLElement, camera: NonNullable<typeof moveCamera>) => { surface = element; moveCamera = camera },
    detach: () => { surface = null; moveCamera = null },
    get viewportInitialized() { return !!surface },
    getNodes: () => state.nodes,
    getNode: (id: string) => state.nodes.find(node => node.id === id),
    getEdges: () => state.edges,
    setNodes: (value: Updater<Node[]>) => update({ nodes: typeof value === 'function' ? value(state.nodes) : value }),
    setEdges: (value: Updater<Edge[]>) => update({ edges: typeof value === 'function' ? value(state.edges) : value }),
    updateNodeData: (id: string, data: Record<string, unknown>) => update({ nodes: state.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...data } } : node) }),
    getViewport,
    getZoom: () => state.transform[2],
    setViewport,
    screenToCanvasPosition: (point: Point): Point => {
      const bounds = surface?.getBoundingClientRect()
      return { x: (point.x - (bounds?.left ?? 0) - state.transform[0]) / state.transform[2],
        y: (point.y - (bounds?.top ?? 0) - state.transform[1]) / state.transform[2] }
    },
    zoomTo: (zoom: number) => {
      const current = getViewport(), next = Math.max(0.1, Math.min(4, zoom))
      const ratio = next / current.zoom
      return setViewport({ x: state.width / 2 - (state.width / 2 - current.x) * ratio,
        y: state.height / 2 - (state.height / 2 - current.y) * ratio, zoom: next })
    },
    fitView: (options: FitOptions = {}) => {
      const ids = options.nodes && new Set(options.nodes.map(node => node.id))
      const nodes = state.nodes.filter(node => !node.hidden && (!ids || ids.has(node.id)))
      if (!nodes.length || !state.width || !state.height) return Promise.resolve(false)
      const left = Math.min(...nodes.map(node => node.position.x)), top = Math.min(...nodes.map(node => node.position.y))
      const right = Math.max(...nodes.map(node => node.position.x + nodeSize(node).width))
      const bottom = Math.max(...nodes.map(node => node.position.y + nodeSize(node).height))
      const padding = options.padding ?? 0.1
      const zoom = Math.max(options.minZoom ?? 0.1, Math.min(options.maxZoom ?? 4,
        state.width / ((right - left) * (1 + padding * 2)), state.height / ((bottom - top) * (1 + padding * 2))))
      return setViewport({ x: state.width / 2 - (left + right) / 2 * zoom,
        y: state.height / 2 - (top + bottom) / 2 * zoom, zoom }, options)
    },
  }
}
export type CanvasStore = ReturnType<typeof createCanvasStore>
