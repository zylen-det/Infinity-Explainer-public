import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer } from './mcp.ts'
import { CanvasStore } from './store.ts'

test('standalone tools need no widget or platform adapter', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'infinity-standalone-'))
  const store = new CanvasStore(directory)
  const server = createMcpServer(store)
  const client = new Client({ name: 'standalone-test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => {
    await client.close()
    await server.close()
    rmSync(directory, { recursive: true, force: true })
  })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  assert.equal(client.getServerCapabilities()?.resources, undefined)
  const { tools } = await client.listTools()
  const open = tools.find(tool => tool.name === 'open_canvas')!
  assert.equal(open._meta, undefined)
  for (const tool of tools) {
    const ui = tool._meta?.ui as { visibility?: string[] } | undefined
    assert.ok(!ui?.visibility || ui.visibility.includes('model'))
  }
  const opened = await client.callTool({ name: 'open_canvas', arguments: {} })
  const boardId = (opened.structuredContent as { boardId: string }).boardId
  const prepared = await client.callTool({ name: 'prepare_block', arguments: {
    boardId, id: 'root', parentId: null, title: 'Agent answer', requestId: 'request',
  } })
  assert.notEqual(prepared.isError, true)
  const written = await client.callTool({ name: 'write_block', arguments: {
    boardId, id: 'root', parentId: null, title: 'Agent answer', requestId: 'request',
    content: 'Written by the calling agent.', terms: [],
  } })
  assert.notEqual(written.isError, true)
  assert.equal(store.read(boardId).blocks[0].status, 'ready')
})
