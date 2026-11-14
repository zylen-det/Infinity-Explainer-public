import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CanvasStore } from './store.ts'
import { createMcpServer, UI_URI } from './mcp.ts'
import { isCanvasSnapshot } from '../shared/canvas.ts'

test('real MCP client: discover, render, recursive writes, retry, persistence and isolation', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'infinity-test-'))
  const store = new CanvasStore(dir)
  const server = createMcpServer(store, '<html>canvas fixture</html>')
  const client = new Client({ name: 'integration-test', version: '' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close(); rmSync(dir, { recursive: true, force: true }) })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const tools = await client.listTools()
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), ['cancel_block', 'delete_blocks', 'import_canvas', 'open_canvas', 'prepare_block', 'read_canvas', 'save_layout', 'write_block'])
  assert.ok(tools.tools.every(tool => tool.outputSchema?.type === 'object'), 'all structured tool results declare their output contract')
  const listedResources = await client.listResources()
  assert.equal(listedResources.resources.find(resource => resource.uri === UI_URI)?.mimeType, 'text/html;profile=mcp-app')
  const write = tools.tools.find(tool => tool.name === 'write_block')!
  assert.equal((write._meta?.ui as { resourceUri?: string })?.resourceUri, undefined, 'writing a response must not request a new widget')
  const open = tools.tools.find(tool => tool.name === 'open_canvas')!
  assert.equal((open._meta?.ui as { resourceUri: string }).resourceUri, UI_URI)
  assert.deepEqual(tools.tools.filter(tool => (tool._meta?.ui as { resourceUri?: string })?.resourceUri).map(tool => tool.name), ['open_canvas'])
  assert.deepEqual((tools.tools.find(tool => tool.name === 'prepare_block')!._meta?.ui as { visibility: string[] }).visibility, ['app'])
  const resource = await client.readResource({ uri: UI_URI })
  assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app')
  assert.equal(resource.contents[0]._meta?.['openai/ui'], undefined, 'platform presentation belongs to the adapter')
  for (const uri of [UI_URI, 'ui://infinity-explainer/cached-canvas.html']) {
    const aliased = await client.readResource({ uri })
    assert.equal(aliased.contents[0].uri, uri)
    assert.equal('text' in aliased.contents[0] ? aliased.contents[0].text : undefined, '<html>canvas fixture</html>', 'cached resource references resolve to current UI')
  }

  const opened = await client.callTool({ name: 'open_canvas', arguments: {} })
  assert.ok(isCanvasSnapshot(opened.structuredContent))
  const boardId = opened.structuredContent.boardId
  const other = store.create()
  let result = await client.callTool({ name: 'write_block', arguments: {
    boardId, id: 'root', parentId: null, title: '音色', content: '音色可以用 MFCC 描述。', terms: ['MFCC', 'missing', 'MFCC'],
  } })
  assert.ok(isCanvasSnapshot(result.structuredContent))
  assert.deepEqual(result.structuredContent.blocks[0].terms, ['MFCC'])

  result = await client.callTool({ name: 'prepare_block', arguments: {
    boardId, id: 'child', parentId: 'root', title: 'MFCC', requestId: 'request-one',
  } })
  assert.ok(isCanvasSnapshot(result.structuredContent))
  assert.equal(result.structuredContent.blocks[1].status, 'pending')
  await client.callTool({ name: 'cancel_block', arguments: { boardId, id: 'child', requestId: 'request-one', error: 'Timed out' } })
  await client.callTool({ name: 'prepare_block', arguments: { boardId, id: 'child', parentId: 'root', title: 'MFCC', requestId: 'request-two' } })
  const child = { boardId, id: 'child', parentId: 'root', title: 'MFCC', content: 'MFCC 使用 Mel scale。', terms: ['Mel scale'] }
  result = await client.callTool({ name: 'write_block', arguments: { ...child, requestId: 'request-one' } })
  assert.equal(result.isError, true, 'an old reply must not overwrite a retried request')
  result = await client.callTool({ name: 'write_block', arguments: { ...child, id: 'wrong-child', requestId: 'request-two' } })
  assert.equal(result.isError, true, 'a response cannot create a replacement for its reserved card')
  result = await client.callTool({ name: 'write_block', arguments: { ...child, id: 'invented-child' } })
  assert.equal(result.isError, true, 'inventing an ID and omitting requestId cannot bypass the reservation')
  assert.match(JSON.stringify(result.content), /request-two/)
  assert.match(JSON.stringify(result.content), /original target/)
  assert.equal(store.read(boardId).blocks.length, 2)
  result = await client.callTool({ name: 'write_block', arguments: { ...child, requestId: 'request-two' } })
  assert.ok(isCanvasSnapshot(result.structuredContent))
  assert.equal(result.structuredContent.blocks[1].status, 'ready')
  await client.callTool({ name: 'write_block', arguments: { ...child, requestId: 'request-two' } })
  assert.equal(store.read(boardId).blocks.length, 2, 'repeated writes do not duplicate nodes')
  await client.callTool({ name: 'write_block', arguments: {
    boardId, id: 'grandchild', parentId: 'child', title: 'Mel scale', content: '人耳的音高感知尺度。', terms: [],
  } })
  const restored = new CanvasStore(dir).read(boardId)
  assert.equal(restored.blocks[2].parentId, 'child')
  assert.equal(store.read(other.boardId).blocks.length, 0)
  result = await client.callTool({ name: 'write_block', arguments: { ...child, boardId: other.boardId, requestId: 'request-two' } })
  assert.equal(result.isError, true, 'parent IDs cannot cross canvases')
  result = await client.callTool({ name: 'read_canvas', arguments: { boardId: '../../outside' } })
  assert.equal(result.isError, true)
  result = await client.callTool({ name: 'write_block', arguments: { ...child, id: 'root', parentId: 'grandchild' } })
  assert.equal(result.isError, true, 'cannot reparent existing blocks or create cycles')
})


test('empty user cards persist alongside a pending answer and retain selection when edited', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'infinity-empty-card-'))
  const store = new CanvasStore(dir)
  const server = createMcpServer(store, '<html></html>')
  const client = new Client({ name: 'empty-card-test', version: '' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close(); rmSync(dir, { recursive: true, force: true }) })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const boardId = store.create().boardId
  const write = (args: object) => client.callTool({ name: 'write_block', arguments: { boardId, terms: [], ...args } })
  await write({ id: 'root', parentId: null, title: '', content: 'Source word' })
  await client.callTool({ name: 'prepare_block', arguments: { boardId, id: 'answer', parentId: 'root', title: 'word', requestId: 'pending-answer' } })
  const selection = { text: 'word', start: 7, end: 11, prefix: 'Source ', suffix: '' }
  const created = await write({ id: 'note', parentId: 'root', title: '', content: '', selection })
  assert.ok(isCanvasSnapshot(created.structuredContent))
  assert.equal(created.structuredContent.blocks.find(block => block.id === 'note')?.status, 'ready')
  assert.equal(new CanvasStore(dir).read(boardId).blocks.find(block => block.id === 'note')?.content, '')
  const edited = await write({ id: 'note', parentId: 'root', title: '', content: 'My **note**' })
  assert.ok(isCanvasSnapshot(edited.structuredContent))
  assert.deepEqual(edited.structuredContent.blocks.find(block => block.id === 'note')?.selection, selection)
  assert.equal(edited.structuredContent.blocks.find(block => block.id === 'note')?.content, 'My **note**')
  const cleared = await write({ id: 'note', parentId: 'root', title: '', content: '' })
  assert.ok(isCanvasSnapshot(cleared.structuredContent))
  assert.equal(cleared.structuredContent.blocks.find(block => block.id === 'note')?.content, '')
  const deleted = await client.callTool({ name: 'delete_blocks', arguments: { boardId, ids: ['root'] } })
  assert.ok(isCanvasSnapshot(deleted.structuredContent))
  assert.equal(deleted.structuredContent.blocks.length, 2, 'deleting a parent preserves its children')
  assert.ok(deleted.structuredContent.blocks.every(block => block.parentId === null && !block.selection))
  await client.callTool({ name: 'delete_blocks', arguments: { boardId, ids: ['note', 'answer'] } })
  assert.deepEqual(new CanvasStore(dir).read(boardId).blocks, [], 'deleting every card persists an empty board')
})

test('rewrite a completed generated card without requestId and reject its late replies', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'infinity-rewrite-'))
  const store = new CanvasStore(dir)
  const server = createMcpServer(store, '<html></html>')
  const client = new Client({ name: 'rewrite-test', version: '' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close(); rmSync(dir, { recursive: true, force: true }) })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const boardId = store.create().boardId
  const call = (name: string, args: object) => client.callTool({name, arguments:{boardId,...args}})
  await call('write_block', {id:'root',parentId:null,title:'HTTPS',content:'HTTPS uses Encryption.',terms:['Encryption']})
  const selection = {text:'Encryption',start:11,end:21,prefix:'HTTPS uses ',suffix:'.'}
  await call('prepare_block', {id:'child',parentId:'root',title:'Encryption',requestId:'generation-one',selection})
  const answer = {id:'child',parentId:'root',title:'Encryption',content:'Encryption protects transmitted data.',terms:['Encryption']}
  assert.equal((await call('write_block',answer)).isError,true,'pending generation still requires its matching request')
  assert.equal((await call('write_block',{...answer,requestId:'wrong-generation'})).isError,true)
  assert.notEqual((await call('write_block',{...answer,requestId:'generation-one'})).isError,true)
  assert.notEqual((await call('write_block',{...answer,requestId:'generation-one'})).isError,true,'completion retries remain valid before editing')
  const layout = {boardId,cards:[{id:'child',position:{x:450,y:80},width:400,height:300}],viewport:{x:20,y:30,zoom:0.8}}
  store.saveLayout(boardId,layout)

  const rewritten = await call('write_block',{...answer,title:'HELLO WORLD',content:'HELLO WORLD',terms:[]})
  assert.notEqual(rewritten.isError,true,'ordinary rewrites do not require the completed generation ID')
  const saved = new CanvasStore(dir).read(boardId)
  const child = saved.blocks.find(block=>block.id==='child')!
  assert.equal(child.title,'HELLO WORLD')
  assert.equal(child.content,'HELLO WORLD')
  assert.equal(child.requestId,null,'an explicit rewrite retires the completed generation')
  assert.equal(child.parentId,'root')
  assert.deepEqual(child.selection,selection)
  assert.deepEqual(saved.layout,layout)
  assert.equal(saved.blocks.length,2)
  assert.equal((await call('write_block',{...answer,requestId:'generation-one'})).isError,true,'a late generation must not overwrite the rewrite')
  assert.equal((await call('write_block',{...answer,requestId:'invented-edit'})).isError,true,'an invented request does not become valid after editing')
  assert.deepEqual(store.read(boardId),saved,'rejected writes do not alter content or revision')
  assert.notEqual((await call('write_block',{...answer,title:'Second edit',content:'Second edit',terms:[]})).isError,true)
})
