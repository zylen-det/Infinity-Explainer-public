import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHostImport } from '../src/services/HostTransferService.ts'

test('host import preserves standalone text, terms, geometry and selection while isolating old replies', () => {
  const make = (id: string, parentId: string | null) => ({ id, type: 'explainer', position: { x: 10, y: -20 },
    width: 420, height: 310, data: { text: 'Untitled MFCC text', terms: ['MFCC'], userTerms: ['text'], parentId, status: 'loading' } })
  const file = { format: 'infinity-explainer-rf', nodes: [make('root', null), make('child', 'root')],
    edges: [{ source: 'root', target: 'child', data: { selection: { text: 'MFCC', start: 9, end: 13, prefix: 'Untitled ', suffix: ' text' } } }],
    viewport: { x: -25, y: 45, zoom: 0.6 } }
  const imported = parseHostImport(JSON.stringify(file), 'current-board')
  assert.deepEqual(imported.layout.viewport, file.viewport)
  assert.equal(imported.layout.boardId, 'current-board')
  assert.deepEqual(imported.layout.cards[0].position, file.nodes[0].position)
  assert.equal(imported.layout.cards[0].width, 420)
  assert.equal(imported.layout.cards[0].height, 310)
  assert.equal(imported.blocks[0].text, 'Untitled MFCC text')
  assert.deepEqual(imported.blocks[0].userTerms, ['text'])
  assert.equal(imported.blocks[1].parentId, imported.blocks[0].id)
  assert.deepEqual(imported.blocks[1].selection, file.edges[0].data.selection)
  assert.ok(imported.blocks.every(block => !['root', 'child'].includes(block.id) && block.requestId === null && block.status === 'ready'))
  const detached = parseHostImport(JSON.stringify({ ...file, edges: [] }), 'current-board')
  assert.ok(detached.blocks.every(block => block.parentId === null), 'deleted edges are not recreated from stale node metadata')
  for (const invalid of [
    { ...file, nodes: [file.nodes[0], file.nodes[0]] },
    { ...file, viewport: { ...file.viewport, zoom: 0 } },
    { ...file, edges: [{ source: 'missing', target: 'child' }] },
    { ...file, edges: [...file.edges, { source: 'child', target: 'root' }] },
  ]) assert.throws(() => parseHostImport(JSON.stringify(invalid), 'current-board'))
})
