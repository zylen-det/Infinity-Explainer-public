import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequestTrace } from './trace.ts'

test('runtime trace correlates UI instances, mutations and private layout without retaining answer text', t => {
  const directory = mkdtempSync(join(tmpdir(), 'infinity-trace-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'mcp.jsonl')
  const board = { boardId: 'board', revision: 1, blocks: [{ id: 'card', parentId: null,
    status: 'ready', requestId: 'request', content: 'Private answer body' }], layout: { viewport: { x: 20, y: 40, zoom: 1 } } }
  const trace = createRequestTrace(file, { host: 'plugin.example.com' }, () => board)
  trace.receive({ id: 7, method: 'tools/call', params: { name: 'write_block',
    arguments: { boardId: 'board', id: 'card', content: 'User-supplied answer body' },
    _meta: { 'infinity/uiInstanceId': 'instance', 'openai/session': 'private-session',
      'infinity/canvasTrace': [{ sequence: 1, instanceId: 'instance', event: 'viewport-request', detail: { source: 'host-initial-fit' } }] } } })
  board.revision = 2
  trace.send({ id: 7, result: { structuredContent: board, content: [{ type: 'text', text: 'Private reply text' }],
    _meta: { canvasLayout: board.layout } } })
  const raw = readFileSync(file, 'utf8')
  const [request, response] = raw.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(request.uiInstanceId, 'instance')
  assert.equal(request.canvasTrace[0].event, 'viewport-request')
  assert.equal(request.canvasTrace[0].detail.source, 'host-initial-fit')
  assert.equal(response.correlationId, request.correlationId)
  assert.equal(response.before.revision, 1)
  assert.equal(response.after.revision, 2)
  assert.deepEqual(response.returnedLayout, board.layout)
  for (const privateText of ['Private answer body', 'User-supplied answer body', 'Private reply text', 'private-session']) assert.ok(!raw.includes(privateText))
})

test('runtime trace records JSON-RPC resource errors rather than mistaking HTTP 200 for success', t => {
  const directory = mkdtempSync(join(tmpdir(), 'infinity-resource-trace-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'mcp.jsonl')
  const trace = createRequestTrace(file, {}, () => undefined)
  trace.receive({ id: 1, method: 'resources/read', params: { uri: 'ui://old.html' } })
  trace.send({ id: 1, error: { code: -32602, message: 'Resource not found' } })
  const response = JSON.parse(readFileSync(file, 'utf8').trim().split('\n')[1])
  assert.equal(response.uri, 'ui://old.html')
  assert.equal(response.rpcError.code, -32602)
})
