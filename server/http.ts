import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server'
import { createMcpServer } from './mcp.ts'
import { createRequestTrace } from './trace.ts'
import type { CanvasStore } from './store.ts'

/** One tool/resource factory serves both per-request discovery and legacy MCP. */
export function createCanvasHttpHandler(store: CanvasStore, widgetHtml: () => string | undefined = () => undefined, traceFile?: string): McpHttpHandler {
  const handler = createMcpHandler(() => createMcpServer(store, widgetHtml()))
  if (!traceFile) return handler
  return {
    ...handler,
    async fetch(request, options) {
      const trace = createRequestTrace(traceFile, {
        route: new URL(request.url).pathname, host: request.headers.get('host'),
        origin: request.headers.get('origin'), userAgent: request.headers.get('user-agent'),
      }, boardId => store.read(boardId))
      const message = options?.parsedBody ?? await request.clone().json().catch(() => undefined)
      if (message) trace.receive(message)
      try {
        const response = await handler.fetch(request, options)
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          trace.send(await response.clone().json())
        } else if (contentType.includes('text/event-stream') && message?.method !== 'subscriptions/listen') {
          // The legacy SDK responds over a finite SSE exchange. Record its
          // JSON-RPC outcome too; a 200 alone does not establish tool success.
          const body = await response.clone().text()
          for (const line of body.split('\n')) {
            if (line.startsWith('data:')) trace.send(JSON.parse(line.slice(5)))
          }
        }
        return response
      } catch (error) {
        trace.error(error)
        throw error
      }
    },
  }
}
