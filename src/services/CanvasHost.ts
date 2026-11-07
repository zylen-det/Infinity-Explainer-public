import type { CanvasSnapshot, ExplanationTarget } from '../../shared/canvas.ts'
import type { CanvasLayout } from '../../shared/layout.ts'
import type { SelectionAnchor } from '../core/selectionAnchor.ts'
import type { ExplanationResult } from '../core/types.ts'

/** Optional integration contract. The standalone app needs no host. */
export interface CanvasHost {
  readonly questionHint: string
  getSnapshot(): CanvasSnapshot | null
  getStatus(): string
  subscribe(listener: () => void): () => void
  start(): Promise<void>
  refresh(): Promise<void>
  isEditingCanvas(): boolean
  getImportedRevision(): number
  getStagedSelection(parentId: string): SelectionAnchor | undefined
  queueLayout(layout: CanvasLayout): void
  isLayoutSavePaused(): boolean
  retryLayout(): Promise<void>
  createBlock(id: string, parentId: string | null, selection?: SelectionAnchor): Promise<void>
  saveBlock(id: string, text: string): Promise<void>
  importCanvas(json: string): Promise<void>
  deleteBlocks(ids: string[], detachIds?: string[]): Promise<void>
  stageQuestion(id: string, text: string, selection?: SelectionAnchor): Promise<void>
  explain(term: string, target: ExplanationTarget, context: string, signal?: AbortSignal): Promise<ExplanationResult>
  fullscreen(): Promise<void>
  cancelWait(id: string): Promise<void>
  restoreLayout?(boardId: string): CanvasLayout | null
  saveLayoutState?(layout: CanvasLayout): void
}

// Install before mounting the app. ESM bindings stay live for all UI modules.
export let isHosted = false
export let hostService: CanvasHost
export function configureCanvasHost(host: CanvasHost) {
  if (isHosted) throw new Error('The canvas host is already configured')
  hostService = host
  isHosted = true
}
