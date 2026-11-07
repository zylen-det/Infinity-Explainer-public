import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CanvasBlock, CanvasSnapshot } from '../shared/canvas.ts'
import { isCanvasSnapshot } from '../shared/canvas.ts'
import { cancelBlock, prepareBlock, removeBlocks, replaceCanvas, saveLayout, writeBlock } from './canvas-operations.ts'
import type { BlockInput, CanvasRepository } from './canvas-store.ts'
import type { CanvasLayout } from '../shared/layout.ts'

export class CanvasStore implements CanvasRepository {
  constructor(privateDirectory: string) {
    this.directory = privateDirectory
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
  }
  private directory: string

  private file(boardId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(boardId)) {
      throw new Error('Invalid canvas ID')
    }
    return join(this.directory, `${boardId}.json`)
  }

  read(boardId: string): CanvasSnapshot {
    const data: unknown = JSON.parse(readFileSync(this.file(boardId), 'utf8'))
    if (!isCanvasSnapshot(data) || data.boardId !== boardId) throw new Error('Invalid saved canvas')
    return data
  }

  private save(board: CanvasSnapshot) {
    const file = this.file(board.boardId)
    const temporary = `${file}.tmp`
    writeFileSync(temporary, JSON.stringify(board), { mode: 0o600 })
    renameSync(temporary, file)
    return board
  }

  create() {
    return this.save({ boardId: randomUUID(), revision: 0, blocks: [] })
  }

  saveLayout(boardId: string, layout: CanvasLayout) {
    return this.save(saveLayout(this.read(boardId), layout))
  }

  prepare(boardId: string, id: string, parentId: string | null, title: string, requestId: string, selection?: CanvasBlock['selection']) {
    return this.save(prepareBlock(this.read(boardId), id, parentId, title, requestId, selection))
  }

  write(boardId: string, block: BlockInput, requestId?: string) {
    return this.save(writeBlock(this.read(boardId), block, requestId))
  }

  cancel(boardId: string, id: string, requestId: string, error: string) {
    return this.save(cancelBlock(this.read(boardId), id, requestId, error))
  }

  replace(boardId: string, revision: number, blocks: CanvasBlock[], layout: CanvasLayout) {
    return this.save(replaceCanvas(this.read(boardId), revision, blocks, layout))
  }

  remove(boardId: string, ids: string[], detachIds: string[] = []) {
    return this.save(removeBlocks(this.read(boardId), ids, detachIds))
  }

}
