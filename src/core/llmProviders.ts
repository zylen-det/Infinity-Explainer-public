/** UI metadata only; wire protocols and response parsing belong to AI SDK. */
export const LLM_PROVIDERS = {
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { label: 'Anthropic', endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  google: { label: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-chat' },
  mistral: { label: 'Mistral', endpoint: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  groq: { label: 'Groq', endpoint: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  xai: { label: 'xAI', endpoint: 'https://api.x.ai/v1', model: 'grok-4.7' },
  cohere: { label: 'Cohere', endpoint: 'https://api.cohere.com/v2', model: 'command-a-03-2025' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', model: 'provider/model' },
  ollama: { label: 'Ollama (local)', endpoint: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' },
  'llama.cpp': { label: 'llama.cpp (local)', endpoint: 'http://127.0.0.1:8080/v1', model: 'qwen3.5-9b' },
  litellm: { label: 'LiteLLM Gateway', endpoint: 'http://127.0.0.1:4000/v1', model: 'your-model-alias' },
  'openai-compatible': { label: 'OpenAI-compatible (custom)', endpoint: '', model: '' },
  disabled: { label: 'Disabled', endpoint: '', model: '' },
} as const

export type LLMProvider = keyof typeof LLM_PROVIDERS

export function isLLMProvider(value: unknown): value is LLMProvider {
  return typeof value === 'string' && Object.hasOwn(LLM_PROVIDERS, value)
}
