import type { CanvasBlock, CanvasSnapshot } from '../shared/canvas.ts'
import { isCanvasLayout } from '../shared/layout.ts'
import type { CanvasLayout } from '../shared/layout.ts'
import type { BlockInput } from './canvas-store.ts'

/** Storage-independent mutations; each successful change advances revision. */
export function saveLayout(board: CanvasSnapshot, layout: CanvasLayout) {
  if (!isCanvasLayout(layout) || layout.boardId !== board.boardId) throw new Error('Invalid canvas layout')
  // An Explain placeholder can be laid out before prepare_block arrives.
  if (JSON.stringify(board.layout) === JSON.stringify(layout)) return board
  board.layout = layout
  board.revision++
  return board
}

export function prepareBlock(board: CanvasSnapshot, id: string, parentId: string | null, title: string, requestId: string, selection?: CanvasBlock['selection']) {
  const existing = board.blocks.find(b => b.id === id)
  if (existing?.status === 'ready') throw new Error('Cannot overwrite a completed block with a pending request')
  return upsert(board, { id, parentId, title, ...(selection ? { selection } : {}), content: '', terms: [], status: 'pending', requestId, error: '' })
}

export function writeBlock(board: CanvasSnapshot, block: BlockInput, requestId?: string) {
  const existing = board.blocks.find(b => b.id === block.id)
  if (requestId && !existing) throw new Error('Stale request: reserved block no longer exists')
  const waiting = board.blocks.filter(b => b.parentId === block.parentId && b.status === 'pending' && b.requestId)
  // A user can add an empty card while another answer is being generated.
  if (!existing && waiting.length && (block.title !== '' || block.content !== '')) {
    throw new Error(`An explanation is already reserved for this parent. Call write_block with the original target instead of creating a new ID: ${JSON.stringify(waiting.map(b => ({ boardId: board.boardId, id: b.id, parentId: b.parentId, requestId: b.requestId })))}`)
  }
  const reserved = requestId ? board.blocks.find(b => b.requestId === requestId) : undefined
  if (reserved && reserved.id !== block.id) throw new Error('Reply must update its reserved block ID')
  if (existing?.requestId && existing.requestId !== requestId) throw new Error('Stale or missing requestId')
  if (existing && existing.parentId !== block.parentId) throw new Error('Cannot change a block parent')
  return upsert(board, { ...block, ...(existing?.userTerms ? { userTerms: existing.userTerms } : {}),
    ...(block.selection ?? existing?.selection ? { selection: block.selection ?? existing?.selection } : {}), status: 'ready', requestId: requestId ?? null, error: '' })
}

export function replaceCanvas(board: CanvasSnapshot, revision: number, blocks: CanvasBlock[], layout: CanvasLayout) {
  if (board.revision !== revision) throw new Error('Canvas changed; please retry the import')
  if (!isCanvasLayout(layout) || layout.boardId !== board.boardId) throw new Error('Invalid canvas layout')
  const byId = new Map(blocks.map(block => [block.id, block]))
  if (blocks.length > 500 || byId.size !== blocks.length || layout.cards.length !== blocks.length ||
      layout.cards.some(card => !byId.has(card.id))) throw new Error('Invalid canvas cards')
  for (const block of blocks) {
    const visited = new Set([block.id])
    let parent = block.parentId
    while (parent !== null) {
      if (visited.has(parent) || !byId.has(parent)) throw new Error('Invalid parent or cyclic canvas')
      visited.add(parent)
      parent = byId.get(parent)!.parentId
    }
  }
  board.blocks = blocks.map(block => ({ ...block, status: block.status === 'pending' ? 'ready' : block.status, requestId: null }))
  board.layout = layout
  board.revision++
  return board
}

export function removeBlocks(board: CanvasSnapshot, ids: string[], detachIds: string[] = []) {
  const removed = new Set(ids)
  const detached = new Set(detachIds)
  if (!board.blocks.some(block => removed.has(block.id) || (block.parentId && detached.has(block.id)))) return board
  board.blocks = board.blocks.filter(block => !removed.has(block.id)).map(block => {
    if (!block.parentId || (!removed.has(block.parentId) && !detached.has(block.id))) return block
    const detachedBlock = { ...block, parentId: null }
    delete detachedBlock.selection
    return detachedBlock
  })
  if (board.layout) board.layout = { ...board.layout, cards: board.layout.cards.filter(card => !removed.has(card.id)) }
  board.revision++
  return board
}

export function cancelBlock(board: CanvasSnapshot, id: string, requestId: string, error: string) {
  const block = board.blocks.find(b => b.id === id)
  if (!block || block.requestId !== requestId) throw new Error('Unknown or stale request')
  if (block.status !== 'pending') return board
  return upsert(board, { ...block, status: 'error', error })
}

function upsert(board: CanvasSnapshot, block: CanvasBlock) {
  if (block.id === block.parentId) throw new Error('A block cannot be its own parent')
  if (block.parentId && !board.blocks.some(b => b.id === block.parentId)) throw new Error('Parent block not found')
  const index = board.blocks.findIndex(b => b.id === block.id)
  if (index >= 0 && board.blocks[index].parentId !== block.parentId) throw new Error('Cannot change a block parent')
  if (index < 0 && board.blocks.length >= 500) throw new Error('Canvas limit reached (500 blocks)')
  if (index < 0) board.blocks.push(block)
  else board.blocks[index] = block
  board.revision++
  return board
}
