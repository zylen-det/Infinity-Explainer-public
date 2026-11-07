import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { LLMService } from '../src/services/LLMService.ts'

const config = { provider: 'llama.cpp', model: 'test', endpoint: 'http://localhost:8001/v1', apiKey: '' } as const
const chunk = (content: string | null, reasoning: string | null, finish: string | null = null) =>
  'data:' + JSON.stringify({ choices: [{ delta: { content, reasoning_content: reasoning }, finish_reason: finish }] }) + '\n\n'

function setup(t: TestContext, raw: string, stream = true, maxTokens?: number) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify(config), setItem: () => {},
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  let request: Record<string, unknown> = {}
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(init.body as string)
    if (!stream) return new Response(raw)
    const bytes = new TextEncoder().encode(raw)
    return new Response(new ReadableStream({ start(controller) {
      // Split inside JSON and multibyte text, as a real transport can.
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    } }))
  })
  const service = new LLMService()
  if (maxTokens) service.configure({ ...config, maxTokens })
  return { service, request: () => request }
}

test('thinking remains enabled and only streamed answer content reaches the card', async t => {
  const { service, request } = setup(t, chunk(null, 'reasoning') + chunk('音色解釋', null) + chunk(null, null, 'stop').trimEnd())
  const updates: string[] = []
  const result = await service.explainStream('音色', s => updates.push(s))
  assert.equal(result.explanation, '音色解釋')
  assert.deepEqual(updates, ['音色解釋'])
  assert.equal(request().max_tokens, 8192)
  assert.equal('chat_template_kwargs' in request(), false)
})

test('reasoning-only token exhaustion reports an actionable error', async t => {
  const { service, request } = setup(t, chunk(null, 'thinking') + chunk(null, null, 'length'), true, 16384)
  await assert.rejects(service.explainStream('音色', () => {}), /尚未回傳正文.*提高/)
  assert.equal(request().max_tokens, 16384)
})

test('a truncated answer is not marked successful', async t => {
  const { service } = setup(t, chunk('部分正文', null) + chunk(null, null, 'length'))
  await assert.rejects(service.explainStream('音色', () => {}), /正文尚未完成/)
})

test('empty successful responses are errors in both request modes', async t => {
  const { service } = setup(t, chunk(null, 'thinking') + chunk(null, null, 'stop'))
  await assert.rejects(service.explainStream('音色', () => {}), /沒有回傳正文/)
  t.mock.restoreAll()
  const second = setup(t, JSON.stringify({ choices: [{ message: { content: '', reasoning_content: 'thinking' }, finish_reason: 'length' }] }), false)
  await assert.rejects(second.service.explain('音色'), /尚未回傳正文/)
})
