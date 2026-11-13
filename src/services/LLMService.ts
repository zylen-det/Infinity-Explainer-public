import { generateText, streamText } from 'ai'
import type { ILLMService, LLMConfig, ExplanationResult } from '../core/types'
import { isLLMProvider } from '../core/llmProviders.ts'
import { createLanguageModel } from './LLMProvider.ts'

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'disabled',
  model: '',
  endpoint: '',
  apiKey: '',
  maxTokens: 8192,
}

const STORAGE_KEY = 'infinity-explainer-llm-config'

function loadConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as LLMConfig
      if (isLLMProvider(config.provider)) return config
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_CONFIG }
}

function saveConfig(cfg: LLMConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function requireAnswer(content: string, finishReason?: string | null): string {
  if (finishReason === 'length') {
    throw new Error(content.trim()
      ? '模型已達生成 token 上限，正文尚未完成。請在 LLM 設定提高「最大生成 tokens」後重試。'
      : '模型已達生成 token 上限，但尚未回傳正文。思考與正文共用生成額度，請在 LLM 設定提高「最大生成 tokens」後重試。')
  }
  if (finishReason && !['stop', 'tool-calls'].includes(finishReason)) {
    throw new Error(`模型未完成回覆（${finishReason}），請重試或檢查模型設定。`)
  }
  if (content.trim()) return content
  throw new Error('模型沒有回傳正文（content）。請確認模型與伺服器的回覆格式；思考內容不會作為解釋顯示。')
}

/* ── 非串流 prompt：回傳完整 JSON（跟串流前一樣） ── */

function buildJSONPrompt(term: string, context?: string): string {
  const ctx = context ? `（上下文：${context}）` : ''
  return `你是一個技術解釋助手。請用繁體中文、淺顯易懂的方式解釋「${term}」${ctx}。
解釋中如包含其他技術名詞，請一併列出。

請嚴格以 JSON 格式回覆，格式如下：
{
  "explanation": "繁體中文解釋文字",
  "technical_terms": ["名詞1", "名詞2"]
}

只回覆 JSON，不要包含其他文字。`
}

/* ── 串流 prompt：先輸出解釋文字，再用分隔線標記 technical_terms ── */

function buildStreamPrompt(term: string, context?: string): string {
  const ctx = context ? `（上下文：${context}）` : ''
  return `你是一個技術解釋助手。請用繁體中文、淺顯易懂的方式解釋「${term}」${ctx}。

先直接輸出解釋文字（純文字、不要 JSON）。
解釋完畢後換行，然後輸出「---TERMS---」，
再下一行輸出一個 JSON 陣列，列出你解釋中出現的關鍵技術名詞。

輸出格式：
...解釋文字...
---TERMS---
["名詞1", "名詞2"]`
}

/* ── Parse helpers ── */

/**
 * 從完整的 LLM 回應中分割 explanation + technical_terms。
 * 支援兩種格式：
 * 1. 完整 JSON 物件（非串流舊格式）
 * 2. 純文字 + ---TERMS--- + JSON 陣列（串流新格式）
 */
function parseResult(raw: string): ExplanationResult {
  // 先嘗試當完整 JSON 解析（非串流）
  const jsonObj = tryParseJSONObject(raw)
  if (jsonObj && typeof jsonObj.explanation === 'string') {
    return {
      explanation: jsonObj.explanation,
      technical_terms: Array.isArray(jsonObj.technical_terms)
        ? jsonObj.technical_terms.filter((t: unknown) => typeof t === 'string')
        : [],
    }
  }

  // 嘗試 ---TERMS--- 分隔格式
  const marker = '---TERMS---'
  const markerIdx = raw.indexOf(marker)
  if (markerIdx !== -1) {
    const explanation = raw.slice(0, markerIdx).trim()
    const termsPart = raw.slice(markerIdx + marker.length).trim()
    const terms = tryParseJSONArray(termsPart)
    return { explanation, technical_terms: terms }
  }

  // Fallback：整段當解釋，從文字中 heuristic 提取 terms
  return { explanation: raw.trim(), technical_terms: extractTerms(raw) }
}

/**
 * 串流過程中提取「到目前為止的純解釋文字」：
 * 回傳 accumulated 中在 ---TERMS--- 之前的部分
 */
function extractDisplayText(raw: string): string {
  const marker = '---TERMS---'
  const idx = raw.indexOf(marker)
  return idx !== -1 ? raw.slice(0, idx) : raw
}

function tryParseJSONObject(text: string): Record<string, unknown> | null {
  // Try direct parse
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch { /* fall through */ }

  // Try extracting JSON block from markdown
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try {
      return JSON.parse(blockMatch[1].trim()) as Record<string, unknown>
    } catch { /* fall through */ }
  }

  // Try finding { } block
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as Record<string, unknown>
    } catch { /* fall through */ }
  }

  return null
}

function tryParseJSONArray(text: string): string[] {
  const trimmed = text.trim()

  // Direct parse
  try {
    const arr = JSON.parse(trimmed)
    if (Array.isArray(arr)) return arr.filter((t): t is string => typeof t === 'string')
  } catch { /* fall through */ }

  // Allow markdown fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\[([\s\S]*?)\]```/)
  if (fenceMatch) {
    try {
      const arr = JSON.parse(`[${fenceMatch[1]}]`)
      if (Array.isArray(arr)) return arr.filter((t): t is string => typeof t === 'string')
    } catch { /* fall through */ }
  }

  // Allow square brackets without markdown
  const bracketMatch = trimmed.match(/\[[\s\S]*\]/)
  if (bracketMatch) {
    try {
      const arr = JSON.parse(bracketMatch[0])
      if (Array.isArray(arr)) return arr.filter((t): t is string => typeof t === 'string')
    } catch { /* fall through */ }
  }

  return []
}

/**
 * Heuristic term extraction（作為最後 fallback）
 */
function extractTerms(text: string): string[] {
  const set = new Set<string>()
  // 中文引號內的詞彙
  const quoteRe = /「([^」]+)」/g
  for (const m of text.matchAll(quoteRe)) {
    const t = m[1].trim()
    if (t.length >= 2) set.add(t)
  }
  // 大寫開頭的英文技術名詞
  const engRe = /[A-Z][a-zA-Z0-9/-]{1,60}/g
  for (const m of text.matchAll(engRe)) {
    set.add(m[0])
  }
  return [...set]
}

/* ============================================================
   LLMService 實作
   ============================================================ */

export class LLMService implements ILLMService {
  private config: LLMConfig

  constructor() {
    this.config = loadConfig()
  }

  configure(cfg: LLMConfig): void {
    this.config = { ...cfg }
    saveConfig(this.config)
  }

  getConfig(): LLMConfig {
    return { ...this.config }
  }

  /** 非串流：沿用原始 JSON prompt，等待完整回應後解析 */
  async explain(term: string, context?: string): Promise<ExplanationResult> {
    if (this.config.provider === 'disabled') {
      return {
        explanation: `「${term}」的 LLM 解釋功能尚未設定。請先在設定面板中啟用 LLM 服務（右上角 ⚙）。`,
        technical_terms: [],
      }
    }

    const { text, finishReason } = await generateText({
      model: await createLanguageModel(this.config),
      system: '你是一個技術知識助手。請以繁體中文回覆。',
      prompt: buildJSONPrompt(term, context),
      maxOutputTokens: this.config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      maxRetries: 0,
    })
    return parseResult(requireAnswer(text, finishReason))
  }

  /** 串流：先顯示解釋文字，串流結束後解析 technical_terms */
  async explainStream(
    term: string,
    onProgress: (fullText: string) => void,
    signal?: AbortSignal,
    context?: string,
  ): Promise<ExplanationResult> {
    if (this.config.provider === 'disabled') {
      const msg = `「${term}」的 LLM 解釋功能尚未設定。請先在設定面板中啟用 LLM 服務（右上角 ⚙）。`
      onProgress(msg)
      return { explanation: msg, technical_terms: [] }
    }

    signal?.throwIfAborted()
    const result = streamText({
      model: await createLanguageModel(this.config),
      system: '你是一個技術知識助手。請以繁體中文回覆。',
      prompt: buildStreamPrompt(term, context),
      maxOutputTokens: this.config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
      maxRetries: 0,
      abortSignal: signal,
      // Errors are propagated below; avoid the SDK's default console logging.
      onError: () => {},
    })
    let accumulated = ''
    let finishReason: string | undefined
    for await (const part of result.fullStream) {
      signal?.throwIfAborted()
      if (part.type === 'error') throw part.error
      if (part.type === 'abort') throw new DOMException('生成已取消', 'AbortError')
      if (part.type === 'text-delta') {
        accumulated += part.text
        onProgress(extractDisplayText(accumulated))
      }
      if (part.type === 'finish') finishReason = part.finishReason
    }
    signal?.throwIfAborted()
    return parseResult(requireAnswer(accumulated, finishReason))
  }
}
