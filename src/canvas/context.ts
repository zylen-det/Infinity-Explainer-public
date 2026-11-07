import { createContext, useContext, useSyncExternalStore } from 'react'
import type { CanvasStore, CanvasState } from './store'

export const CanvasContext = createContext<CanvasStore | null>(null)
export const NodeContext = createContext<string | null>(null)
export const PortalContext = createContext<HTMLDivElement | null>(null)
export function useCanvas() {
  const store = useContext(CanvasContext)
  if (!store) throw new Error('CanvasProvider is required')
  return store
}
export const useStoreApi = useCanvas
export function useStore<T>(selector: (state: CanvasState) => T) {
  const store = useCanvas()
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()))
}
export const useNodes = () => useStore(state => state.nodes)
export const useEdges = () => useStore(state => state.edges)
export const useInternalNode = (id: string) => useStore(state => state.nodes.find(node => node.id === id))
export function useViewport() {
  const transform = useStore(state => state.transform)
  return { x: transform[0], y: transform[1], zoom: transform[2] }
}
