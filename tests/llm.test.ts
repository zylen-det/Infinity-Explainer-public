import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import type { LLMConfig } from '../src/core/types.ts'
import { LLMService } from '../src/services/LLMService.ts'

const config = { provider: 'llama.cpp', model: 'test', endpoint: 'http://localhost:8001/v1', apiKey: '' } as const
const chunk = (content: string | null, reasoning: string | null, finish: string | null = null) =>
  'data:' + JSON.stringify({ choices: [{ delta: { content, reasoning_content: reasoning }, finish_reason: finish }] }) + '\n\n'

function setup(t: TestContext, raw: string, stream = true, maxTokens?: number, overrides: Partial<LLMConfig> = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify({ ...config, ...overrides }), setItem: () => {},
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })
  let request: Record<string, unknown> = {}
  let requestURL = ''
  let requestHeaders = new Headers()
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requestURL = String(_url)
    requestHeaders = new Headers(init.headers)
    request = JSON.parse(init.body as string)
    if (!stream) return new Response(raw, { headers: { 'content-type': 'application/json' } })
    const bytes = new TextEncoder().encode(raw)
    return new Response(new ReadableStream({ start(controller) {
      // Split inside JSON and multibyte text, as a real transport can.
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    } }), { headers: { 'content-type': 'text/event-stream' } })
  })
  const service = new LLMService()
  if (maxTokens) service.configure({ ...config, maxTokens })
  return { service, fetchMock, request: () => request, url: () => requestURL, headers: () => requestHeaders }
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

const answer = { explanation: '測試解釋', technical_terms: ['術語'] }
const chatResponse = (content: string) => JSON.stringify({
  id: 'chat-test', object: 'chat.completion', created: 1, model: 'test',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
})

test('existing OpenAI custom endpoints retain Chat Completions and bearer authentication', async t => {
  const { service, url, headers, request } = setup(t, chatResponse(JSON.stringify(answer)), false, undefined, {
    provider: 'openai', endpoint: 'https://example.com/v1///', apiKey: 'test-key',
  })
  assert.deepEqual(await service.explain('test', 'parent context'), answer)
  assert.equal(url(), 'https://example.com/v1/chat/completions')
  assert.equal(headers().get('authorization'), 'Bearer test-key')
  assert.match(JSON.stringify(request().messages), /parent context/)
})

test('Anthropic uses its native messages protocol and browser access header', async t => {
  const raw = JSON.stringify({ id: 'msg-test', type: 'message', role: 'assistant', model: 'test',
    content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 2 },
  })
  const { service, url, headers, request } = setup(t, raw, false, undefined, {
    provider: 'anthropic', endpoint: '', apiKey: 'anthropic-test',
  })
  assert.deepEqual(await service.explain('test'), answer)
  assert.equal(url(), 'https://api.anthropic.com/v1/messages')
  assert.equal(headers().get('x-api-key'), 'anthropic-test')
  assert.equal(headers().get('anthropic-dangerous-direct-browser-access'), 'true')
  assert.equal(request().max_tokens, 8192)
})

test('Gemini uses generateContent and native authentication', async t => {
  const raw = JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] },
    finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 } })
  const { service, url, headers, request } = setup(t, raw, false, undefined, {
    provider: 'google', endpoint: '', apiKey: 'google-test', model: 'gemini-2.5-flash',
  })
  assert.deepEqual(await service.explain('test'), answer)
  assert.match(url(), /generativelanguage.googleapis.com\/v1beta\/models\/gemini-2.5-flash:generateContent/)
  assert.equal(headers().get('x-goog-api-key'), 'google-test')
  assert.equal((request().generationConfig as Record<string, unknown>).maxOutputTokens, 8192)
})

test('native Gemini streaming displays answer text and extracts terms', async t => {
  const raw = 'data: ' + JSON.stringify({ candidates: [{ content: { role: 'model', parts: [
    { text: 'hidden reasoning', thought: true }, { text: '串流解釋\n---TERMS---\n["術語"]' },
  ] }, finishReason: 'STOP', index: 0 }] }) + '\n\n'
  const { service, url } = setup(t, raw, true, undefined, { provider: 'google', endpoint: '', apiKey: 'test' })
  const updates: string[] = []
  assert.deepEqual(await service.explainStream('test', text => updates.push(text)), {
    explanation: '串流解釋', technical_terms: ['術語'],
  })
  assert.match(url(), /:streamGenerateContent\?alt=sse/)
  assert.ok(updates.length > 0)
  assert.ok(updates.every(text => !text.includes('hidden reasoning') && !text.includes('---TERMS---')))
})

test('native Anthropic streaming handles message events', async t => {
  const events = [
    { type: 'message_start', message: { id: 'msg-test', type: 'message', role: 'assistant', model: 'test', content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '原生串流' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ]
  const raw = events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  const { service } = setup(t, raw, true, undefined, { provider: 'anthropic', endpoint: '', apiKey: 'test' })
  assert.equal((await service.explainStream('test', () => {})).explanation, '原生串流')
})

test('compatible presets use their defaults and omit authorization for keyless local servers', async t => {
  for (const [provider, endpoint] of [
    ['ollama', 'http://127.0.0.1:11434/v1'], ['llama.cpp', 'http://127.0.0.1:8080/v1'],
    ['litellm', 'http://127.0.0.1:4000/v1'], ['openrouter', 'https://openrouter.ai/api/v1'],
    ['openai-compatible', 'https://custom.example/v1'],
  ] as const) {
    const { service, url, headers } = setup(t, chatResponse(JSON.stringify(answer)), false, undefined, {
      provider, endpoint: provider === 'openai-compatible' ? endpoint : '',
    })
    assert.deepEqual(await service.explain('test'), answer)
    assert.equal(url(), endpoint + '/chat/completions')
    assert.equal(headers().has('authorization'), false)
    t.mock.restoreAll()
  }
})

test('provider failures and midstream errors reject instead of accepting partial content', async t => {
  const { service } = setup(t, chunk('部分', null) + 'data: {"error":{"message":"quota exceeded","type":"quota"}}\n\n')
  await assert.rejects(service.explainStream('test', () => {}), /quota exceeded/)
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { message: 'invalid key' } }), {
    status: 401, headers: { 'content-type': 'application/json' },
  }))
  await assert.rejects(service.explainStream('test', () => {}), /invalid key/)
  await assert.rejects(service.explain('test'), /invalid key/)
})

test('aborted generation and exceptions from progress callbacks propagate', async t => {
  const { service, fetchMock } = setup(t, chunk('正文', null) + chunk(null, null, 'stop'))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(service.explainStream('test', () => {}, controller.signal), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 0)
  await assert.rejects(service.explainStream('test', () => { throw new Error('callback failed') }), /callback failed/)
  const midstream = new AbortController()
  await assert.rejects(service.explainStream('test', () => midstream.abort(), midstream.signal), { name: 'AbortError' })
})

test('disabled and invalid configurations never send model requests', async t => {
  const { service } = setup(t, '', true, undefined, { provider: 'disabled' })
  assert.match((await service.explain('test')).explanation, /尚未設定/)
  assert.match((await service.explainStream('test', () => {})).explanation, /尚未設定/)
  service.configure({ ...config, model: '' })
  await assert.rejects(service.explain('test'), /Model/)
  service.configure({ ...config, provider: 'openai-compatible', endpoint: '' })
  await assert.rejects(service.explain('test'), /Endpoint/)
})

test('DeepSeek, Mistral and Groq use their SDK adapters with default endpoints', async t => {
  for (const [provider, base] of [
    ['deepseek', 'https://api.deepseek.com'], ['mistral', 'https://api.mistral.ai/v1'],
    ['groq', 'https://api.groq.com/openai/v1'],
  ] as const) {
    const { service, url } = setup(t, chatResponse(JSON.stringify(answer)), false, undefined, {
      provider, endpoint: '', apiKey: 'test-key',
    })
    assert.deepEqual(await service.explain('test'), answer)
    assert.equal(url(), base + '/chat/completions')
    t.mock.restoreAll()
  }
})

test('Cohere uses native chat content blocks', async t => {
  const raw = JSON.stringify({ id: 'cohere-test', message: {
    role: 'assistant', content: [{ type: 'text', text: JSON.stringify(answer) }],
  }, finish_reason: 'COMPLETE' })
  const { service, url } = setup(t, raw, false, undefined, { provider: 'cohere', endpoint: '', apiKey: 'test-key' })
  assert.deepEqual(await service.explain('test'), answer)
  assert.equal(url(), 'https://api.cohere.com/v2/chat')
})

test('xAI uses its native Responses API adapter', async t => {
  const raw = JSON.stringify({ id: 'xai-test', object: 'response', status: 'completed', model: 'test',
    output: [{ type: 'message', id: 'msg-test', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: JSON.stringify(answer), annotations: [] }] }],
  })
  const { service, url } = setup(t, raw, false, undefined, { provider: 'xai', endpoint: '', apiKey: 'test-key' })
  assert.deepEqual(await service.explain('test'), answer)
  assert.equal(url(), 'https://api.x.ai/v1/responses')
})
