import type { LanguageModel } from 'ai'
import type { LLMConfig } from '../core/types'
import { isLLMProvider, LLM_PROVIDERS } from '../core/llmProviders.ts'

/** Some local servers close their last SSE event without its newline delimiter. */
async function fetchCompatible(...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await globalThis.fetch(...args)
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    return response
  }
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) { controller.enqueue(chunk) },
    // Leave event parsing to the SDK while preserving the old local-server tolerance.
    flush(controller) { controller.enqueue(new Uint8Array([10, 10])) },
  }))
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

/** Load only the selected SDK adapter. No provider protocol is implemented here. */
export async function createLanguageModel(config: LLMConfig): Promise<LanguageModel> {
  if (!isLLMProvider(config.provider) || config.provider === 'disabled') {
    throw new Error('請選擇有效的 LLM Provider。')
  }
  if (!config.model.trim()) throw new Error('請在 LLM 設定填寫 Model。')
  const baseURL = (config.endpoint.trim() || LLM_PROVIDERS[config.provider].endpoint).replace(/\/+$/, '')
  if (!baseURL) throw new Error('請在 LLM 設定填寫 Endpoint。')
  const url = new URL(baseURL)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Endpoint 必須使用 HTTP 或 HTTPS。')
  // Resolve fetch at call time, including after a host/test has replaced it.
  const options = { baseURL, apiKey: config.apiKey.trim(), fetch: globalThis.fetch }
  const model = config.model.trim()
  switch (config.provider) {
    case 'openai': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      // Keep existing OpenAI settings and custom /chat/completions endpoints working.
      return createOpenAI(options).chat(model)
    }
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ ...options, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })(model)
    }
    case 'google': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI(options)(model)
    }
    case 'deepseek': {
      const { createDeepSeek } = await import('@ai-sdk/deepseek')
      return createDeepSeek(options)(model)
    }
    case 'mistral': {
      const { createMistral } = await import('@ai-sdk/mistral')
      return createMistral(options)(model)
    }
    case 'groq': {
      const { createGroq } = await import('@ai-sdk/groq')
      return createGroq(options)(model)
    }
    case 'xai': {
      const { createXai } = await import('@ai-sdk/xai')
      return createXai(options)(model)
    }
    case 'cohere': {
      const { createCohere } = await import('@ai-sdk/cohere')
      return createCohere(options)(model)
    }
    default: {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      return createOpenAICompatible({ ...options, fetch: fetchCompatible, name: config.provider, apiKey: options.apiKey || undefined })(model)
    }
  }
}
