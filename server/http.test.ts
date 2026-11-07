import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CanvasStore } from './store.ts'
import { UI_URI } from './mcp.ts'
import { createCanvasHttpHandler } from './http.ts'
import { isCanvasSnapshot } from '../shared/canvas.ts'

test('Streamable HTTP: initialization, stateless tool calls and UI resource without opening a port', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'infinity-http-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = new CanvasStore(dir)
  const handler = createCanvasHttpHandler(store, () => '<html>widget</html>')
  t.after(() => handler.close())
  let id = 0
  async function rpc(method: string, params: Record<string, unknown>) {
    const response = await handler.fetch(new Request('http://localhost:8787/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    }))
    assert.equal(response.status, 200)
    const body = await response.text()
    const message = JSON.parse(response.headers.get('content-type')?.includes('text/event-stream')
      ? body.split('\n').find(line => line.startsWith('data:'))!.slice(5) : body)
    assert.equal(message.id, id)
    assert.equal(message.error, undefined)
    return message.result
  }
  const initialized = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'http-test', version: '' } })
  assert.ok(initialized.capabilities.tools)
  const resources = await rpc('resources/list', {})
  assert.equal(resources.resources.find((resource: { uri: string }) => resource.uri === UI_URI)?.mimeType, 'text/html;profile=mcp-app')
  const resource = await rpc('resources/read', { uri: UI_URI })
  assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app')
  assert.equal(resource.contents[0].text, '<html>widget</html>')
  const opened = await rpc('tools/call', { name: 'open_canvas', arguments: {} })
  assert.ok(isCanvasSnapshot(opened.structuredContent))
  const boardId = opened.structuredContent.boardId
  const written = await rpc('tools/call', { name: 'write_block', arguments: { boardId, id: 'root', parentId: null, title: 'HTTP test', content: 'MFCC', terms: ['MFCC'] } })
  assert.equal(written.structuredContent.blocks[0].content, 'MFCC')
  const restored = await rpc('tools/call', { name: 'read_canvas', arguments: { boardId } })
  assert.deepEqual(restored.structuredContent, written.structuredContent)
  const invalid = await rpc('tools/call', { name: 'read_canvas', arguments: { boardId: 'invalid' } })
  assert.equal(invalid.isError, true, 'HTTP 200 does not mean tool execution succeeded')
})
