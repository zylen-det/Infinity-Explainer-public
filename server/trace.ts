import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { sha256 } from './hash.ts'

type ObjectValue = Record<string, unknown>
const object = (value: unknown): ObjectValue => value && typeof value === 'object' ? value as ObjectValue : {}
const text = (value: unknown) => typeof value === 'string' ? value : undefined

export function summarizeBoard(value: unknown) {
  const board = object(value)
  if (typeof board.boardId !== 'string') return undefined
  return { boardId: board.boardId, revision: board.revision, layout: board.layout,
    blocks: Array.isArray(board.blocks) ? board.blocks.map(value => {
      const block = object(value)
      return { id: block.id, parentId: block.parentId, requestId: block.requestId, status: block.status,
        contentChars: text(block.content)?.length, contentSha256: typeof block.content === 'string' ? sha256(block.content) : undefined }
    }) : undefined }
}

/** Record protocol outcomes, including JSON-RPC errors inside HTTP 200 replies.
 * Never retain authorization headers, model prompts, or generated answer text. */
export function createRequestTrace(file: string, context: ObjectValue, readBoard: (boardId: string) => unknown) {
  const correlationId = randomUUID()
  let request: ObjectValue = {}
  let before: ReturnType<typeof summarizeBoard>
  let boardId: string | undefined
  const write = (event: ObjectValue) => {
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      if (existsSync(file) && statSync(file).size > 10 * 1024 * 1024) renameSync(file, `${file}.1`)
      appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), pid: process.pid, correlationId, ...context, ...event }) + '\n', { mode: 0o600 })
    } catch (error) { console.warn('MCP trace write failed:', error instanceof Error ? error.message : String(error)) }
  }
  const read = () => {
    try { return boardId ? summarizeBoard(readBoard(boardId)) : undefined } catch { return undefined }
  }
  return {
    receive(value: unknown) {
      const message = object(value), params = object(message.params), args = object(params.arguments), meta = object(params._meta)
      boardId = text(args.boardId)
      before = read()
      request = { rpcId: message.id, method: message.method, tool: params.name, uri: params.uri,
        boardId, blockId: args.id, parentId: args.parentId, requestId: args.requestId,
        inputLayout: args.layout, uiInstanceId: meta['infinity/uiInstanceId'],
        canvasTrace: Array.isArray(meta['infinity/canvasTrace']) ? meta['infinity/canvasTrace'].slice(-40) : undefined,
        sessionHash: typeof meta['openai/session'] === 'string' ? sha256(meta['openai/session']).slice(0, 16) : undefined,
        metaKeys: Object.keys(meta),
        protocolVersion: meta['io.modelcontextprotocol/protocolVersion'] ?? params.protocolVersion,
        clientInfo: message.method === 'initialize' ? params.clientInfo : meta['io.modelcontextprotocol/clientInfo'] }
      write({ event: 'request', ...request, before })
    },
    send(value: unknown) {
      const message = object(value), result = object(message.result), meta = object(result._meta)
      const summary = summarizeBoard(result.structuredContent)
      if (!boardId) boardId = summary?.boardId
      write({ event: 'response', ...request, rpcId: message.id,
        rpcError: message.error, isError: result.isError ?? false,
        toolError: result.isError ? result.content : undefined,
        result: summary, returnedLayout: meta.canvasLayout, resultMetaKeys: Object.keys(meta),
        resources: Array.isArray(result.contents) ? result.contents.map(value => {
          const resource = object(value), html = text(resource.text)
          return { uri: resource.uri, htmlSha256: html ? sha256(html) : undefined, htmlChars: html?.length }
        }) : undefined,
        tools: Array.isArray(result.tools) ? result.tools.map(value => {
          const tool = object(value), ui = object(object(tool._meta).ui)
          return { name: tool.name, resourceUri: ui.resourceUri, visibility: ui.visibility }
        }) : undefined,
        before, after: read() })
    },
    error(error: unknown) { write({ event: 'transport-error', ...request, error: error instanceof Error ? error.message : String(error) }) },
  }
}
