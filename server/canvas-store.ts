import type { CanvasBlock, CanvasSnapshot } from '../shared/canvas.ts'
import type { CanvasLayout } from '../shared/layout.ts'

export type BlockInput = Pick<CanvasBlock, 'id' | 'parentId' | 'title' | 'content' | 'terms' | 'selection'>
type Awaitable<T> = T | Promise<T>

/** The same MCP tools support local files and hosted, asynchronous storage. */
export interface CanvasRepository {
  create(): Awaitable<CanvasSnapshot>
  read(boardId: string): Awaitable<CanvasSnapshot>
  saveLayout(boardId: string, layout: CanvasLayout): Awaitable<CanvasSnapshot>
  prepare(boardId: string, id: string, parentId: string | null, title: string, requestId: string, selection?: CanvasBlock['selection']): Awaitable<CanvasSnapshot>
  write(boardId: string, block: BlockInput, requestId?: string): Awaitable<CanvasSnapshot>
  cancel(boardId: string, id: string, requestId: string, error: string): Awaitable<CanvasSnapshot>
  replace(boardId: string, revision: number, blocks: CanvasBlock[], layout: CanvasLayout): Awaitable<CanvasSnapshot>
  remove(boardId: string, ids: string[], detachIds?: string[]): Awaitable<CanvasSnapshot>
}
