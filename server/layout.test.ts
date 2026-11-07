import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CanvasStore } from './store.ts'
import { createMcpServer } from './mcp.ts'
import type { CanvasLayout } from '../shared/layout.ts'

test('layout survives disk restore and answer writes, stays private, and validates board and geometry', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'infinity-layout-test-'))
  const store = new CanvasStore(directory)
  const board = store.create()
  const other = store.create()
  store.write(board.boardId, { id: 'root', parentId: null, title: 'Root', content: 'MFCC', terms: ['MFCC'] })
  const server = createMcpServer(store, '<html></html>')
  const client = new Client({ name: 'layout-test', version: '' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close(); rmSync(directory, { recursive: true, force: true }) })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const tools = await client.listTools()
  const save = tools.tools.find(tool => tool.name === 'save_layout')!
  assert.deepEqual(save._meta?.ui, { visibility: ['app'] })
  const layout: CanvasLayout = { boardId: board.boardId, cards: [
    { id: 'root', position: { x: -230, y: 590 }, width: 410, height: 330 },
    { id: 'child', position: { x: 310, y: -80 }, width: 380, height: 250 },
  ], viewport: { x: 190, y: -95, zoom: 0.75 } }
  const saved = await client.callTool({ name: 'save_layout', arguments: { boardId: board.boardId, layout } })
  assert.notEqual(saved.isError, true)
  assert.equal(store.read(board.boardId).blocks.length, 1, 'saving placeholder geometry must not invent an answer block')
  assert.deepEqual(new CanvasStore(directory).read(board.boardId).layout, layout)
  store.prepare(board.boardId, 'child', 'root', 'MFCC', 'request')
  store.write(board.boardId, { id: 'child', parentId: 'root', title: 'MFCC', content: 'Generated answer', terms: [] }, 'request')
  for (const name of ['read_canvas', 'open_canvas']) {
    const result = await client.callTool({ name, arguments: { boardId: board.boardId } })
    assert.deepEqual(result._meta?.canvasLayout, layout)
    assert.equal((result.structuredContent as Record<string, unknown>).layout, undefined, 'coordinates stay out of model-visible content')
  }
  assert.deepEqual(store.read(other.boardId).layout, undefined)
  for (const invalid of [
    { ...layout, boardId: other.boardId },
    { ...layout, viewport: { ...layout.viewport, zoom: 0 } },
    { ...layout, cards: [{ ...layout.cards[0], width: -1 }] },
    { ...layout, cards: [layout.cards[0], layout.cards[0]] },
  ]) {
    const result = await client.callTool({ name: 'save_layout', arguments: { boardId: board.boardId, layout: invalid } })
    assert.equal(result.isError, true)
    assert.deepEqual(store.read(board.boardId).layout, layout, 'invalid saves preserve the last valid layout')
  }
})
