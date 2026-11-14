import { createId } from '../core/createId.ts'

export const canvasInstanceId = createId()
type TraceEntry = { sequence: number; time: string; instanceId: string; event: string; detail: Record<string, unknown>; stack?: string }
const entries: TraceEntry[] = []
const motion: TraceEntry[] = []
const isFrequent = (event: string) =>
  ['nodes-moved', 'viewport-changed', 'canvas-size-changed', 'canvas-pointer-down', 'canvas-pointer-up'].includes(event)
let sequence = 0

/** Passive diagnostics: no storage writes, network calls, or canvas mutations. */
export function traceCanvas(event: string, detail: Record<string, unknown> = {}, caller = false, frequent = false) {
  const target = frequent || isFrequent(event) ? motion : entries
  target.push({ sequence: ++sequence, time: new Date().toISOString(), instanceId: canvasInstanceId, event, detail,
    ...(caller ? { stack: new Error().stack?.split('\n').slice(2, 7).join('\n') } : {}) })
  if (target.length > 75) target.shift()
}

// Frequent events must not evict the lifecycle or errors that explain a reset.
// Keep the total diagnostic payload bounded.
export const getCanvasTrace = (limit = 100) => {
  const important = entries.slice(-Math.ceil(limit * 0.75))
  const recentMotion = motion.slice(-(limit - important.length))
  return [...important, ...recentMotion].sort((a, b) => a.sequence - b.sequence)
}

traceCanvas('document-created')
if (typeof window !== 'undefined' && typeof document.addEventListener === 'function') {
  Object.assign(window, { __INFINITY_CANVAS_TRACE__: getCanvasTrace })
  window.addEventListener('pagehide', event => traceCanvas('document-pagehide', { persisted: event.persisted }))
  window.addEventListener('pageshow', event => traceCanvas('document-pageshow', { persisted: event.persisted }))
  document.addEventListener('visibilitychange', () => traceCanvas('document-visibility', { state: document.visibilityState }))
}
