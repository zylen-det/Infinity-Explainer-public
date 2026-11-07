import type { SelectionAnchor } from '../src/core/selectionAnchor'
import type { CanvasLayout } from './layout'
import { isCanvasLayout } from './layout.ts'

export interface CanvasBlock {
  id: string
  parentId: string | null
  selection?: SelectionAnchor
  title: string
  content: string
  terms: string[]
  /** Original card text and custom terms retained when importing a local canvas. */
  text?: string
  userTerms?: string[]
  status: 'pending' | 'ready' | 'error'
  requestId: string | null
  error: string
}

export interface CanvasSnapshot {
  boardId: string
  revision: number
  blocks: CanvasBlock[]
  /** Saved on the server; transported to the UI through tool-result _meta. */
  layout?: CanvasLayout
}

export interface ExplanationTarget {
  blockId: string
  parentId: string | null
  selection?: SelectionAnchor
}

export function isCanvasSnapshot(value: unknown): value is CanvasSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<CanvasSnapshot>
  return typeof v.boardId === 'string' && Number.isSafeInteger(v.revision) &&
    (v.layout === undefined || (isCanvasLayout(v.layout) && v.layout.boardId === v.boardId)) &&
    Array.isArray(v.blocks) && v.blocks.every(b => b && typeof b.id === 'string' &&
      (b.parentId === null || typeof b.parentId === 'string') && typeof b.title === 'string' &&
      (b.text === undefined || typeof b.text === 'string') &&
      (b.userTerms === undefined || (Array.isArray(b.userTerms) && b.userTerms.every((term: unknown) => typeof term === 'string'))) &&
      (b.selection === undefined || (b.selection && typeof b.selection === 'object' && typeof b.selection.text === 'string' && b.selection.text.length > 0 && Number.isSafeInteger(b.selection.start) && b.selection.start >= 0 && b.selection.end === b.selection.start + b.selection.text.length && typeof b.selection.prefix === 'string' && typeof b.selection.suffix === 'string')) &&
      typeof b.content === 'string' && Array.isArray(b.terms) && b.terms.every((t: unknown) => typeof t === 'string') &&
      ['pending', 'ready', 'error'].includes(b.status) &&
      (b.requestId === null || typeof b.requestId === 'string') && typeof b.error === 'string')
}
