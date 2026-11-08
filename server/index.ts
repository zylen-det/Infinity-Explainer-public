import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node'
import { CanvasStore } from './store.ts'
import { createCanvasHttpHandler } from './http.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const store = new CanvasStore(process.env.CANVAS_DATA_DIR ?? resolve(root, '.data/canvases'))
const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'
const traceFile = resolve(process.env.MCP_TRACE_FILE ?? resolve(root, '.data/diagnostics/mcp.jsonl'))

const mcp = createCanvasHttpHandler(store, undefined, traceFile)
const handleMcp = toNodeHandler(mcp, { onerror: error => console.error('MCP request failed:', error.message) })
const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

const httpServer = createServer(async (req, res) => {
  // A matching Origin/Host pair is not proof of trust: both can name a domain
  // rebound to loopback. Validate Host independently, before serving any route.
  if (!validateHost(req, res)) return
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({
      ok: true, appBuilt: existsSync(resolve(dist, 'index.html')),
    }))
    return
  }
  if (url.pathname === '/mcp') {
    if (!validateOrigin(req, res)) return
    const origin = req.headers.origin
    if (origin && !/^https?:\/\//i.test(origin)) {
      res.writeHead(403).end('Origin not allowed')
      return
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID')
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return }
    await handleMcp(req, res)
    return
  }
  if (req.method === 'GET') {
    const path = resolve(dist, `.${url.pathname === '/' ? '/index.html' : url.pathname}`)
    if (path.startsWith(dist + sep) && existsSync(path)) {
      try {
        const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
        res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(readFileSync(path))
        return
      } catch { /* Not a static file. */ }
    }
  }
  res.writeHead(404).end('Not found')
})

httpServer.listen(port, host, () => {
  const address = httpServer.address()
  const boundPort = address && typeof address === 'object' ? address.port : port
  console.log(`Infinity Explainer MCP: http://${host}:${boundPort}/mcp`)
  console.log(`Canvas: http://${host}:${boundPort}/`)
  process.send?.({ type: 'listening', port: boundPort })
  console.log('Development server: no account authentication; use only for personal testing.')
})
