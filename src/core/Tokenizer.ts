import type { ITokenizer, TextSegment } from './types'

/**
 * 預設 Tokenizer 實作：longest-match-first 策略。
 *
 * 1. 將 terms 依長度降冪排序（最長優先）
 * 2. 用正則表達式將文字拆成 segment 陣列
 * 3. 每個 segment 標記是否為可點擊的 term
 */
export class Tokenizer implements ITokenizer {
  /**
   * 轉義正則特殊字元
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  tokenize(text: string, terms: string[]): TextSegment[] {
    if (terms.length === 0) {
      return [{ text, isTerm: false, isUserTerm: false }]
    }

    // longest-match-first: 較長的詞優先比對
    const sorted = [...terms].sort((a, b) => b.length - a.length)
    const escaped = sorted.map((t) => this.escapeRegExp(t))

    // 用 capture group 保留比對到的詞彙
    const pattern = escaped.join('|')
    const regex = new RegExp(`(${pattern})`, 'g')

    const termSet = new Set(terms)
    const parts = text.split(regex)
    const segments: TextSegment[] = []

    for (const part of parts) {
      if (part === '') continue
      const isTerm = termSet.has(part)
      segments.push({
        text: part,
        isTerm,
        // 預設所有 term 都不標記為 userTerm—由呼叫端自行覆蓋
        isUserTerm: false,
      })
    }

    return segments
  }
}
