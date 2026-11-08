import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { request } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('real localhost server rejects attacker Host/Origin before tools, preflight or static routes', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'infinity-localhost-security-'))
  const canvases = join(directory, 'canvases')
  const child = fork(new URL('./index.ts', import.meta.url), [], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', CANVAS_DATA_DIR: canvases, MCP_TRACE_FILE: join(directory, 'trace.jsonl') },
    execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill(); await exited
    }
    rmSync(directory, { recursive: true, force: true })
  })
  let errors = ''
  child.stderr?.on('data', chunk => { errors += chunk.toString() })
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${errors}`)), 5000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)) })
    child.once('message', message => {
      clearTimeout(timer)
      const ready = message as { type: string; port: number }
      assert.equal(ready.type, 'listening')
      resolve(ready.port)
    })
  })
  const localHost = `127.0.0.1:${port}`
  async function send(host: string, origin?: string, method = 'POST', path = '/mcp') {
    return new Promise<{ status: number; body: string; cors: string | string[] | undefined }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers: {
        Host: host, ...(origin === undefined ? {} : { Origin: origin }),
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      } }, res => {
        let body = ''
        res.setEncoding('utf8').on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode!, body, cors: res.headers['access-control-allow-origin'] }))
      })
      req.on('error', reject)
      req.end(method === 'POST' ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'open_canvas', arguments: {} } }) : undefined)
    })
  }
  const original = await send(localHost)
  assert.equal(original.status, 200)
  assert.match(original.body, /boardId/)
  const count = readdirSync(canvases).length
  for (const [host, origin, method, path] of [
    ['attacker.example', 'http://attacker.example', 'POST', '/mcp'],
    ['attacker.example', undefined, 'POST', '/mcp'],
    ['attacker.example', 'http://localhost:5173', 'POST', '/mcp'],
    [localHost, 'http://attacker.example', 'POST', '/mcp'],
    [localHost, 'null', 'POST', '/mcp'],
    [localHost, 'invalid origin', 'POST', '/mcp'],
    [localHost, 'ftp://localhost', 'POST', '/mcp'],
    ['localhost.attacker.example', undefined, 'POST', '/mcp'],
    ['attacker.example', 'http://attacker.example', 'OPTIONS', '/mcp'],
    [localHost, 'http://attacker.example', 'OPTIONS', '/mcp'],
    ['attacker.example', undefined, 'GET', '/health'],
    ['attacker.example', undefined, 'GET', '/'],
  ]) {
    const result = await send(host!, origin, method, path)
    assert.equal(result.status, 403, `${method} ${path}: Host=${host}, Origin=${origin}`)
    assert.equal(result.cors, undefined, 'untrusted requests receive no CORS permission')
  }
  assert.equal(readdirSync(canvases).length, count, 'rejected requests must not create canvases')
  for (const host of [`localhost:${port}`, localHost, `[::1]:${port}`]) {
    const result = await send(host, 'http://localhost:5173')
    assert.equal(result.status, 200)
    assert.match(result.body, /boardId/)
    assert.equal(result.cors, 'http://localhost:5173')
  }
  assert.equal((await send(localHost, 'http://[::1]:5173', 'OPTIONS')).status, 204)
  assert.equal((await send(localHost, undefined, 'GET', '/health')).status, 200)
})
