import { z } from 'zod'
import type { CanvasBlock } from '../../shared/canvas'
import type { CanvasLayout } from '../../shared/layout'
import { createId } from '../core/createId.ts'

const point = z.object({ x: z.number().finite(), y: z.number().finite() })
const dimension = z.number().finite().positive()
const terms = z.array(z.string().max(200)).max(80)
const selection = z.object({ text: z.string().min(1).max(40000), start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(), prefix: z.string().max(32), suffix: z.string().max(32) })
  .refine(value => value.end === value.start + value.text.length)
const envelope = z.object({
  format: z.literal('infinity-explainer-rf'),
  nodes: z.array(z.object({ id: z.string().min(1), type: z.literal('explainer'), position: point,
    width: dimension.optional(), height: dimension.optional(),
    data: z.object({ text: z.string().max(41000), terms: terms.default([]), userTerms: terms.default([]),
      parentId: z.string().nullable().optional(), status: z.string().optional(), errorMessage: z.string().max(500).optional(),
      w: dimension.optional(), h: dimension.optional() }),
  })).max(500),
  edges: z.array(z.object({ source: z.string(), target: z.string(),
    data: z.object({ selection: selection.optional() }).optional() })).max(500),
  viewport: point.extend({ zoom: z.number().min(0.1).max(4) }),
})

/** Convert the standalone file format to authoritative hosted blocks and geometry. */
export function parseHostImport(json: string, boardId: string): { blocks: CanvasBlock[]; layout: CanvasLayout } {
  const parsed = envelope.safeParse(JSON.parse(json))
  if (!parsed.success) throw new Error('無效的畫布 JSON：請選擇 Infinity Explainer 匯出的檔案。')
  const data = parsed.data
  // Fresh IDs isolate imported cards from replies still arriving for the old canvas.
  const ids = new Map(data.nodes.map(node => [node.id, createId()]))
  if (ids.size !== data.nodes.length) throw new Error('畫布包含重複的卡片 ID。')
  const incoming = new Map<string, typeof data.edges[number]>()
  for (const edge of data.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || incoming.has(edge.target)) throw new Error('畫布包含無效的連線。')
    incoming.set(edge.target, edge)
  }
  const blocks = data.nodes.map((node): CanvasBlock => {
    const edge = incoming.get(node.id)
    // Edges are authoritative: local deletion may leave a stale data.parentId.
    const parent = edge?.source ?? null
    const text = node.data.text
    const title = text.match(/^【(.+?)】/)?.[1] ?? text.split('\n')[0]
    if (title.length > 300) throw new Error('卡片標題超過 300 字。')
    const content = text.replace(/^【.+?】\s*/, '')
    if (content.length > 40000) throw new Error('卡片內容超過 40000 字。')
    return { id: ids.get(node.id)!, parentId: parent ? ids.get(parent)! : null, title, content,
      text, terms: node.data.terms, userTerms: node.data.userTerms,
      status: node.data.status === 'error' ? 'error' : 'ready', requestId: null, error: node.data.errorMessage ?? '',
      ...(edge?.data?.selection ? { selection: edge.data.selection } : {}) }
  })
  const byId = new Map(blocks.map(block => [block.id, block]))
  for (const block of blocks) {
    const seen = new Set([block.id])
    let parent = block.parentId
    while (parent) {
      if (seen.has(parent)) throw new Error('畫布連線不能形成循環。')
      seen.add(parent)
      parent = byId.get(parent)!.parentId
    }
  }
  return { blocks, layout: { boardId, viewport: data.viewport, cards: data.nodes.map(node => ({
    id: ids.get(node.id)!, position: node.position,
    width: node.width ?? node.data.w ?? 360, height: node.height ?? node.data.h ?? 280,
  })) } }
}
