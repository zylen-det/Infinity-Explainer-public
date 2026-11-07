import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useCanvas, useStoreApi } from '../canvas/context'
import type { Node, Edge } from '../canvas/store'
import { hostService } from '../services/CanvasHost'
import { captureHostLayout, restoreHostLayout, saveHostLayout } from '../services/HostLayoutService'
import type { CanvasSnapshot } from '../../shared/canvas'
import type { CanvasLayout } from '../../shared/layout'
import { traceCanvas } from '../services/CanvasTrace'

const geometry = (nodes: Node[]) => nodes.map(node => ({ id: node.id, x: node.position.x, y: node.position.y,
  width: node.width, height: node.height }))

function applySnapshot(snapshot: CanvasSnapshot, nodes: Node[], edges: Edge[], previousIds: Set<string>, layout?: CanvasLayout | null) {
  const blocks = new Map(snapshot.blocks.map(block => [block.id, block]))
  const removed = new Set([...previousIds].filter(id => !blocks.has(id)))
  const nextNodes = nodes.filter(node => !removed.has(node.id)).map(n => ({ ...n }))
  const nextEdges = edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target) &&
    (!blocks.has(edge.target) || blocks.get(edge.target)!.parentId === edge.source))
  for (const [index, block] of snapshot.blocks.entries()) {
    const existing = nextNodes.find(n => n.id === block.id)
    const data = {
      ...existing?.data,
      text: block.text ?? (block.title ? `【${block.title}】\n\n${block.content}` : block.content),
      terms: block.terms,
      userTerms: block.userTerms ?? existing?.data.userTerms ?? [],
      parentId: block.parentId,
      status: block.status === 'pending' ? 'loading' : block.status === 'error' ? 'error' : 'idle',
      errorMessage: block.error,
      w: existing?.width ?? existing?.data.w ?? 360,
      h: existing?.height ?? existing?.data.h ?? 280,
    }
    if (existing) existing.data = data
    else {
      const parent = nextNodes.find(n => n.id === block.parentId)
      const siblings = snapshot.blocks.slice(0, index).filter(b => b.parentId === block.parentId).length
      const card = layout?.cards.find(card => card.id === block.id)
      nextNodes.push({ id: block.id, type: 'explainer',
        position: card?.position ?? (parent ? { x: parent.position.x + (parent.width ?? 360) + 90, y: parent.position.y + siblings * 330 }
          : { x: 80, y: 100 + siblings * 350 }), width: card?.width ?? 360, height: card?.height ?? 280,
        data: { ...data, w: card?.width ?? data.w, h: card?.height ?? data.h } })
    }
    const existingEdge = nextEdges.find(e => e.source === block.parentId && e.target === block.id)
    if (existingEdge && block.selection) {
      const i = nextEdges.indexOf(existingEdge)
      nextEdges[i] = { ...existingEdge, data: { ...existingEdge.data, selection: block.selection } }
    }
    if (block.parentId && !nextEdges.some(e => e.source === block.parentId && e.target === block.id)) {
      nextEdges.push({ id: `edge-${block.id}`, source: block.parentId, target: block.id,
        sourceHandle: 's', targetHandle: 't', type: 'animatedEdge',
        data: { selection: block.selection ?? hostService.getStagedSelection(block.parentId), startAnchorX: 1, startAnchorY: 0.5, endAnchorX: 0, endAnchorY: 0.5 } })
    }
  }
  // Preserve locally reserved nodes and user positions while server data arrives.
  return { nodes: nextNodes.map(n => ({ ...n })), edges: nextEdges }
}

export function HostCanvas() {
  const status = useSyncExternalStore(hostService.subscribe, hostService.getStatus)
  const flow = useCanvas()
  const store = useStoreApi()
  const revision = useRef(-1)
  const fitted = useRef(false)
  const previousIds = useRef(new Set<string>())

  useEffect(() => {
    traceCanvas('host-canvas-effect-start', { fitted: fitted.current, revision: revision.current,
      viewportInitialized: flow.viewportInitialized, cards: geometry(flow.getNodes()), viewport: flow.getViewport() })
    let restoring = false
    let loaded = false
    let loading = false
    let disposed = false
    let frame = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    let lastSkip = ''
    const persist = () => {
      const snapshot = hostService.getSnapshot()
      const skipped = !snapshot ? 'no-snapshot' : !loaded ? 'hydrating' : !fitted.current ? 'not-fitted' : restoring ? 'restoring' : disposed ? 'disposed' : hostService.isEditingCanvas() ? 'editing' : ''
      if (skipped) {
        if (skipped !== lastSkip) traceCanvas('layout-save-skipped', { reason: skipped })
        lastSkip = skipped
        return
      }
      lastSkip = ''
      if (!snapshot) return
      const state = store.getState()
      const [x, y, zoom] = state.transform
      if (!state.nodes.length) return
      const layout = captureHostLayout(snapshot.boardId, state.nodes, { x, y, zoom })
      hostService.queueLayout(layout)
      // The durable save must not depend on a host-specific extension.
      try { saveHostLayout(layout) } catch (error) { console.warn('Widget layout save failed:', error) }
    }
    const sync = () => {
      const next = hostService.getSnapshot()
      if (!next || disposed) return
      if (!loaded) {
        if (loading) return
        loading = true
        // Initial tool results may be historical. Read the live board before
        // fitting or saving anything, or defaults could overwrite its layout.
        void hostService.refresh().then(() => { loaded = true; loading = false; sync() })
          .catch(() => {
            loading = false
            if (!disposed) retry = setTimeout(sync, 1500)
          })
        return
      }
      if (next.revision === revision.current) return
      revision.current = next.revision
      const saved = !fitted.current ? next.layout ?? restoreHostLayout(next.boardId) : null
      const previous = next.revision === hostService.getImportedRevision()
        ? new Set(flow.getNodes().map(node => node.id)) : previousIds.current
      const state = applySnapshot(next, flow.getNodes(), flow.getEdges(), previous, saved ?? next.layout)
      previousIds.current = new Set(next.blocks.map(block => block.id))
      traceCanvas('snapshot-apply', { boardId: next.boardId, revision: next.revision, initial: !fitted.current,
        hasSavedLayout: !!saved, before: geometry(flow.getNodes()), after: geometry(state.nodes) }, true)
      flow.setNodes(state.nodes)
      flow.setEdges(state.edges)
      if (!fitted.current && state.nodes.length) {
        fitted.current = true
        restoring = true
        frame = requestAnimationFrame(() => {
          frame = 0
          traceCanvas('viewport-request', { source: saved ? 'host-restore' : 'host-initial-fit',
            before: flow.getViewport(), target: saved?.viewport }, true)
          const ready = saved ? flow.setViewport(saved.viewport) : flow.fitView({ padding: 0.25, maxZoom: 1 })
          void ready.then(() => {
            traceCanvas('initial-viewport-applied', { viewport: flow.getViewport(), disposed })
            restoring = false; persist()
          })
        })
      }
    }
    const unsubscribe = hostService.subscribe(sync)
    // Subscribe to the canvas store so drag/resize/pan state is saved immediately,
    // including before a follow-up causes the host to replace the view.
    let pointerDown = false
    const down = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.canvas')) return
      pointerDown = true
      traceCanvas('canvas-pointer-down', { nodeId: event.target.closest('.canvas__node')?.getAttribute('data-id') })
    }
    const up = () => { if (pointerDown) traceCanvas('canvas-pointer-up'); pointerDown = false }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    const unsubscribeLayout = store.subscribe((next, previous) => {
      const before = new Map(previous.nodes.map(node => [node.id, node]))
      const afterIds = new Set(next.nodes.map(node => node.id))
      const added = next.nodes.filter(node => !before.has(node.id))
      const removed = previous.nodes.filter(node => !afterIds.has(node.id))
      if (added.length || removed.length) traceCanvas('node-membership-changed', {
        added: geometry(added), removed: geometry(removed),
      }, true)
      const moved = next.nodes.flatMap(node => {
        const old = before.get(node.id)
        return old && (old.position.x !== node.position.x || old.position.y !== node.position.y)
          ? [{ id: node.id, from: { ...old.position }, to: { ...node.position } }] : []
      })
      if (moved.length) traceCanvas('nodes-moved', { pointerDown, moved }, true)
      if (next.transform.some((value, i) => value !== previous.transform[i])) {
        traceCanvas('viewport-changed', { pointerDown, from: previous.transform, to: next.transform }, true)
      }
      if (next.width !== previous.width || next.height !== previous.height) {
        traceCanvas('canvas-size-changed', { from: [previous.width, previous.height], to: [next.width, next.height] })
      }
      persist()
    })
    void hostService.start().catch(() => {})
    sync()
    return () => {
      traceCanvas('host-canvas-effect-cleanup', { fitted: fitted.current, restoring, loaded, pendingInitialFrame: !!frame,
        cards: geometry(flow.getNodes()), viewport: flow.getViewport() })
      disposed = true; unsubscribe(); unsubscribeLayout(); cancelAnimationFrame(frame); clearTimeout(retry)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
    }
  }, [flow, store])

  return (
    <div className="host-controls">
      {status.includes('失敗') && <div className="host-status" role="alert">{status}</div>}
      {hostService.isLayoutSavePaused() && <button type="button" aria-label="重試儲存配置" title="重試儲存配置"
        onClick={() => { void hostService.retryLayout().catch(() => {}) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" />
        </svg>
      </button>}
      <button type="button" aria-label="展開畫布" title="展開畫布"
        onClick={() => { void hostService.fullscreen().catch(error => console.error('展開畫布失敗', error)) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
        </svg>
      </button>
    </div>
  )
}
