import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { CanvasSnapshot } from '../shared/canvas.ts'
import type { CanvasRepository } from './canvas-store.ts'

export const UI_URI = 'ui://infinity-explainer/canvas.html'
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/)
const boardId = z.string().uuid()
const parentId = id.nullable()
const title = z.string().trim().min(1).max(300)
const annotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const selection = z.object({ text: z.string().min(1).max(40000), start: z.number().int().nonnegative(), end: z.number().int().nonnegative(), prefix: z.string().max(32), suffix: z.string().max(32) }).refine(s => s.end === s.start + s.text.length).optional()
const blockSchema = z.object({ id, parentId, title: z.string().max(300), content: z.string().max(40000),
  terms: z.array(z.string().max(200)).max(80), userTerms: z.array(z.string().max(200)).max(80).optional(),
  text: z.string().max(41000).optional(), status: z.enum(['pending', 'ready', 'error']),
  requestId: id.nullable(), error: z.string().max(500), selection })
const layoutSchema = z.object({
  boardId,
  cards: z.array(z.object({ id, position: z.object({ x: z.number().finite(), y: z.number().finite() }),
    width: z.number().finite().positive(), height: z.number().finite().positive() })).max(500),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(0.1).max(4) }),
})
const canvasOutput = z.object({
  boardId, revision: z.number().int().nonnegative(),
  blocks: z.array(z.object({ id, parentId, title: z.string(), content: z.string(), terms: z.array(z.string()),
    userTerms: z.array(z.string()).optional(), text: z.string().optional(),
    status: z.enum(['pending', 'ready', 'error']), requestId: id.nullable(), error: z.string(), selection })),
})

function result(board: CanvasSnapshot) {
  const { layout, ...snapshot } = board
  return {
    structuredContent: snapshot,
    ...(layout ? { _meta: { canvasLayout: layout } } : {}),
    content: [{ type: 'text' as const, text: `Canvas ${board.boardId}, revision ${board.revision}: ${board.blocks.length} blocks. Complete block content is in structuredContent.` }],
  }
}

export type McpPresentation = {
  /** Use the transport's SDK constructor when the core is linked from another checkout. */
  serverClass?: typeof McpServer
  instructions?: string
  renderMeta?: Record<string, unknown>
  resourceMeta?: Record<string, unknown>
}

export function createMcpServer(store: CanvasRepository, widgetHtml?: string, widgetUri = UI_URI, presentation: McpPresentation = {}) {
  const ui = { resourceUri: widgetUri }
  const version = widgetUri.match(/canvas-([a-f0-9]+)\.html$/)?.[1] ?? ''
  const server = new (presentation.serverClass ?? McpServer)({ name: 'infinity-explainer', version }, {
    instructions: presentation.instructions ?? 'Infinity Explainer arranges answers into connected text blocks. Use open_canvas once to start or when the user explicitly asks to reopen a canvas. For follow-ups, update the reserved block with write_block; do not call open_canvas to refresh or render the answer. Generate answers yourself using the current conversation and available tools, then write_block with the complete answer and terms that appear in it. For follow-up requests preserve the supplied boardId, id, parentId and requestId exactly. Do not call another language-model service. Keep any accompanying chat acknowledgement short; do not duplicate the full answer.',
  })

  const resource = (uri: string) => ({
    contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: widgetHtml ?? '',
      _meta: {
        ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
        ...presentation.resourceMeta,
      } }],
  })
  if (widgetHtml !== undefined) {
  server.registerResource('canvas', widgetUri, { mimeType: 'text/html;profile=mcp-app' }, async () => resource(widgetUri))
  // Resolve cached references within this app without encoding releases in names.
  server.registerResource('canvas-reference', new ResourceTemplate('ui://infinity-explainer/{resource}', { list: undefined }),
    { mimeType: 'text/html;profile=mcp-app' }, async uri => resource(uri.toString()))
  }

  server.registerTool('open_canvas', {
    title: 'Open explanation canvas',
    description: 'Open a new canvas, or resume an existing canvas by boardId. Then generate an answer and call write_block to add the first block.',
    inputSchema: z.object({ boardId: boardId.optional() }), outputSchema: canvasOutput,
    annotations: { ...annotations, idempotentHint: false }, _meta: widgetHtml === undefined ? undefined : { ui, ...presentation.renderMeta },
  }, async args => result(await (args.boardId ? store.read(args.boardId) : store.create())))

  server.registerTool('write_block', {
    title: 'Write an explanation block',
    description: 'Write your own generated answer into the canvas. Supply the complete content and clickable terms present in it. For a UI follow-up use its exact boardId, id, parentId and requestId. Use parentId:null for a root answer. Repeating the same ID updates that block without duplicating it. This is a data-only update to the already open canvas; do not call open_canvas after writing.',
    inputSchema: z.object({ boardId, id, parentId, title: z.string().trim().max(300), content: z.string().max(40000),
      terms: z.array(z.string().min(1).max(200)).max(80), selection, requestId: id.optional() }),
    outputSchema: canvasOutput, annotations, _meta: { ui: { visibility: ['app', 'model'] } },
  }, async args => result(await store.write(args.boardId, {
    id: args.id, parentId: args.parentId, title: args.title, content: args.content, selection: args.selection,
    terms: [...new Set(args.terms)].filter(term => args.content.includes(term)),
  }, args.requestId)))

  server.registerTool('read_canvas', {
    title: 'Read explanation canvas', description: 'Read the latest canvas snapshot, including pending blocks.',
    inputSchema: z.object({ boardId }), outputSchema: canvasOutput, annotations: { ...annotations, readOnlyHint: true },
    _meta: { ui: { visibility: ['app', 'model'] } },
  }, async args => result(await store.read(args.boardId)))

  server.registerTool('prepare_block', {
    title: 'Prepare explanation block', description: 'Reserve a pending block before asking the agent to fill it.',
    inputSchema: z.object({ boardId, id, parentId, title, selection, requestId: id }), outputSchema: canvasOutput, annotations,
    _meta: { ui: { visibility: widgetHtml === undefined ? ['app', 'model'] : ['app'] } },
  }, async args => result(await store.prepare(args.boardId, args.id, args.parentId, args.title, args.requestId, args.selection)))

  server.registerTool('save_layout', {
    title: 'Save canvas layout', description: 'Save card positions, dimensions and viewport for this canvas without opening a widget or changing answers.',
    inputSchema: z.object({ boardId, layout: layoutSchema }), outputSchema: z.object({ boardId, revision: z.number().int().nonnegative() }), annotations, _meta: { ui: { visibility: widgetHtml === undefined ? ['app', 'model'] : ['app'] } },
  }, async args => {
    const board = await store.saveLayout(args.boardId, args.layout)
    return { structuredContent: { boardId: board.boardId, revision: board.revision },
      content: [{ type: 'text' as const, text: 'Canvas layout saved.' }] }
  })

  server.registerTool('cancel_block', {
    title: 'Stop waiting for block', description: 'Mark a pending block as failed. Does not cancel the agent generation.',
    inputSchema: z.object({ boardId, id, requestId: id, error: z.string().min(1).max(500) }), outputSchema: canvasOutput, annotations,
    _meta: { ui: { visibility: widgetHtml === undefined ? ['app', 'model'] : ['app'] } },
  }, async args => result(await store.cancel(args.boardId, args.id, args.requestId, args.error)))

  server.registerTool('import_canvas', {
    title: 'Import canvas', description: 'Replace the current canvas with a user-selected JSON file.',
    inputSchema: z.object({ boardId, revision: z.number().int().nonnegative(), blocks: z.array(blockSchema).max(500), layout: layoutSchema }),
    outputSchema: canvasOutput, annotations: { ...annotations, destructiveHint: true }, _meta: { ui: { visibility: widgetHtml === undefined ? ['app', 'model'] : ['app'] } },
  }, async args => result(await store.replace(args.boardId, args.revision, args.blocks, args.layout)))

  server.registerTool('delete_blocks', {
    title: 'Delete selected cards', description: 'Delete selected cards and their connections, retaining child cards as roots.',
    inputSchema: z.object({ boardId, ids: z.array(id).max(500), detachIds: z.array(id).max(500).default([]) }), outputSchema: canvasOutput,
    annotations: { ...annotations, destructiveHint: true }, _meta: { ui: { visibility: widgetHtml === undefined ? ['app', 'model'] : ['app'] } },
  }, async args => result(await store.remove(args.boardId, args.ids, args.detachIds)))
  return server
}
