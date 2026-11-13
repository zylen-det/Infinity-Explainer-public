import { useCallback, useState } from 'react'
import type { LLMConfig } from '../core/types'
import { LLM_PROVIDERS, type LLMProvider } from '../core/llmProviders'

interface Props {
  config: LLMConfig
  onSave: (cfg: LLMConfig) => void
}

const PROVIDER_OPTIONS = Object.entries(LLM_PROVIDERS)

export function LLMConfigPanel({ config, onSave }: Props) {
  const [form, setForm] = useState<LLMConfig>({ ...config })
  const [saved, setSaved] = useState(false)
  const handleSave = useCallback(() => {
    onSave(form)
    setSaved(true)
  }, [form, onSave])

  const isDisabled = form.provider === 'disabled'
  const provider = LLM_PROVIDERS[form.provider]

  return (
    <section className="llm-settings" onChange={() => setSaved(false)}>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 16 }}>
        LLM 設定
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="llm-provider" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          服務 Provider
        </label>
        <select id="llm-provider"
          value={form.provider}
          onChange={(e) => {
            const next = e.target.value as LLMProvider
            // Keep credentials and endpoint overrides scoped to their provider.
            setForm({ ...form, provider: next, endpoint: '', model: '', apiKey: '' })
          }}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--card-border)',
            fontSize: 14,
            backgroundColor: 'var(--card)',
            color: 'var(--text)',
          }}
        >
          {PROVIDER_OPTIONS.map(([value, opt]) => (
            <option key={value} value={value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="llm-endpoint" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Endpoint
        </label>
        <input id="llm-endpoint"
          type="text"
          value={form.endpoint}
          onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
          disabled={isDisabled}
          placeholder={provider.endpoint || 'https://your-provider.example/v1'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--card-border)',
            fontSize: 14,
            backgroundColor: 'var(--card)',
            color: 'var(--text)',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ fontSize: 12, marginTop: 6 }}>留空使用此 Provider 的預設位址；自訂位址請填 API base URL。</p>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="llm-model" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          Model
        </label>
        <input id="llm-model"
          type="text"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          disabled={isDisabled}
          placeholder={provider.model || 'model-id'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--card-border)',
            fontSize: 14,
            backgroundColor: 'var(--card)',
            color: 'var(--text)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="llm-key" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          API Key
        </label>
        <input id="llm-key"
          type="password"
          value={form.apiKey}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          disabled={isDisabled}
          placeholder={['llama.cpp', 'ollama', 'openai-compatible', 'litellm'].includes(form.provider) ? '(optional)' : 'API Key'}
          style={{
            width: '100%',
            padding: '6px 8px',
            borderRadius: 6,
            border: '1px solid var(--card-border)',
            fontSize: 14,
            backgroundColor: 'var(--card)',
            color: 'var(--text)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="llm-max-tokens" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
          最大生成 tokens
        </label>
        <input id="llm-max-tokens" type="number" min={1} step={1}
          value={form.maxTokens ?? 8192} disabled={isDisabled}
          onChange={e => {
            const value = Number(e.target.value)
            if (Number.isSafeInteger(value) && value > 0) setForm({ ...form, maxTokens: value })
          }}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--card-border)', background: 'var(--card)', color: 'var(--text)', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: 12, marginTop: 6 }}>思考與正文共用此額度；預設 8192，上限取決於模型與伺服器。</p>
      </div>

      {!isDisabled && <p style={{ fontSize: 12, marginBottom: 16 }}>
        直接從瀏覽器連接，Endpoint 須允許跨來源請求（CORS）。API Key 儲存在此瀏覽器；也可透過 LiteLLM Gateway 連接更多服務。
      </p>}

      {saved && <p role="status">LLM 設定已儲存</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleSave}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--text)',
            color: 'var(--card)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          儲存
        </button>
      </div>
    </section>
  )
}
