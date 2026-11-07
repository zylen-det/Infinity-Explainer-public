interface PersistenceEnvelope {
  format: 'infinity-explainer-rf'
  savedAt: string
  nodes: { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }[]
  edges: { id: string; source: string; target: string; type?: string; data?: Record<string, unknown> }[]
  viewport: { x: number; y: number; zoom: number }
}

const STORAGE_KEY = 'infinity-explainer-canvas'

/** Inline throttle — no lodash dependency */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T & { cancel: () => void } {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  function throttled(this: unknown, ...args: unknown[]) {
    const now = Date.now()
    const remaining = ms - (now - last)
    if (remaining <= 0) {
      last = now
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  }
  throttled.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return throttled as unknown as T & { cancel: () => void }
}

function readEnvelope(): PersistenceEnvelope | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: PersistenceEnvelope = JSON.parse(raw)
    if (parsed.format !== 'infinity-explainer-rf' || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
    return parsed
  } catch {
    return null
  }
}

export const PersistenceService = {
  save(nodes: unknown[], edges: unknown[], viewport: { x: number; y: number; zoom: number }): void {
    try {
      const envelope: PersistenceEnvelope = {
        format: 'infinity-explainer-rf',
        savedAt: new Date().toISOString(),
        nodes: nodes as PersistenceEnvelope['nodes'],
        edges: edges as PersistenceEnvelope['edges'],
        viewport,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    } catch (err) {
      console.warn('Auto-save failed:', err)
    }
  },

  createAutoSave(
    getState: () => { nodes: unknown[]; edges: unknown[]; viewport: { x: number; y: number; zoom: number } },
  ): { save: () => void; cancel: () => void } {
    const save = throttle(() => {
      const state = getState()
      this.save(state.nodes, state.edges, state.viewport)
    }, 500)
    return { save, cancel: save.cancel }
  },

  tryRestore(): { nodes: unknown[]; edges: unknown[]; viewport: { x: number; y: number; zoom: number } } | null {
    try {
      const envelope = readEnvelope()
      if (!envelope) return null
      return {
        nodes: envelope.nodes.map(node => node.data.status === 'loading'
          ? { ...node, data: { ...node.data, status: 'idle' } } : node),
        edges: envelope.edges,
        viewport: envelope.viewport,
      }
    } catch (err) {
      console.warn('Auto-restore failed, clearing stale data:', err)
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  },

  exportToBlob(
    nodes: unknown[],
    edges: unknown[],
    viewport: { x: number; y: number; zoom: number },
  ): Blob {
    const envelope: PersistenceEnvelope = {
      format: 'infinity-explainer-rf',
      savedAt: new Date().toISOString(),
      nodes: nodes as PersistenceEnvelope['nodes'],
      edges: edges as PersistenceEnvelope['edges'],
      viewport,
    }
    return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
  },

  importFromString(
    json: string,
  ): { nodes: unknown[]; edges: unknown[]; viewport: { x: number; y: number; zoom: number } } | null {
    try {
      const envelope: PersistenceEnvelope = JSON.parse(json)
      if (envelope.format !== 'infinity-explainer-rf' || !Array.isArray(envelope.nodes) || !Array.isArray(envelope.edges)) {
        console.error('Import: invalid format')
        return null
      }
      return {
        nodes: envelope.nodes.map(node => node.data.status === 'loading'
          ? { ...node, data: { ...node.data, status: 'idle' } } : node),
        edges: envelope.edges,
        viewport: envelope.viewport,
      }
    } catch (err) {
      console.error('Import failed:', err)
      return null
    }
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY)
  },
}
