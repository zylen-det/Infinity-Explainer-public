import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createCanvasHttpHandler } from './http.ts'
import { CanvasStore } from './store.ts'
import { UI_URI } from './mcp.ts'
import { isCanvasSnapshot } from '../shared/canvas.ts'

test('MCP modern discovery advertises all tools and serves layout writes on the production HTTP handler', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'infinity-discovery-test-'))
  const file = join(dir, 'trace.jsonl')
  const store = new CanvasStore(dir)
  const handler = createCanvasHttpHandler(store, () => '<html>modern widget</html>', file)
  const sent: { method: string; params?: Record<string, unknown> }[] = []
  const client = new Client({ name: 'discovery-test', version: '' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' } },
  })
  t.after(async () => {
    await client.close()
    await handler.close()
    rmSync(dir, { recursive: true, force: true })
  })
  // Reproduce the exact discovery envelope used by modern clients, including the
  // protocol header rejected by the former v1 transport before tracing ran.
  const discovery = await handler.fetch(new Request('http://test.local/mcp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'test-mcp-discover', method: 'server/discover', params: { _meta: {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'test-mcp', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
    } } }),
  }))
  assert.equal(discovery.status, 200)
  const advertisement = await discovery.json()
  assert.equal(advertisement.error, undefined)
  assert.ok(advertisement.result.supportedVersions.includes('2026-07-28'))
  assert.ok(advertisement.result.capabilities.tools)

  await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: async (url, init) => {
      const request = new Request(url, init)
      if (request.method === 'POST') sent.push(await request.clone().json())
      return handler.fetch(request)
    },
  }))
  assert.equal(client.getProtocolEra(), 'modern')
  const listed = await client.listTools()
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['cancel_block', 'delete_blocks', 'import_canvas', 'open_canvas', 'prepare_block', 'read_canvas', 'save_layout', 'write_block'])
  assert.deepEqual(listed.tools.find(tool => tool.name === 'save_layout')?._meta?.ui, { visibility: ['app'] })
  const resource = await client.readResource({ uri: UI_URI })
  assert.ok('text' in resource.contents[0])
  assert.equal(resource.contents[0].text, '<html>modern widget</html>')
  const opened = await client.callTool({ name: 'open_canvas', arguments: {} })
  assert.ok(isCanvasSnapshot(opened.structuredContent))
  const boardId = opened.structuredContent.boardId
  const layout = { boardId, cards: [{ id: 'root', position: { x: 30, y: -80 }, width: 400, height: 300 }],
    viewport: { x: 100, y: 20, zoom: 0.8 } }
  const saved = await client.callTool({ name: 'save_layout', arguments: { boardId, layout } })
  assert.notEqual(saved.isError, true)
  assert.deepEqual(store.read(boardId).layout, layout)
  const restored = await client.callTool({ name: 'read_canvas', arguments: { boardId } })
  assert.deepEqual(restored._meta?.canvasLayout, layout)
  assert.ok(!sent.some(message => message.method === 'initialize'), 'modern calls do not depend on a legacy handshake')
  const trace = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.ok(trace.some(event => event.method === 'server/discover' && event.protocolVersion === '2026-07-28' && event.clientInfo?.name === 'test-mcp'))
  assert.ok(trace.some(event => event.event === 'response' && event.method === 'server/discover' && !event.rpcError))
  assert.ok(trace.some(event => event.event === 'response' && event.tool === 'save_layout' && event.isError === false))
})
