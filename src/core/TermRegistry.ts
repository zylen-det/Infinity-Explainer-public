import type { ITermRegistry } from './types'

/**
 * TermRegistry：全域詞彙索引，支援依 shapeId 作作用域過濾。
 *
 * - 不傳 shapeId → 取得/檢查所有已註冊詞彙（全域）
 * - 傳 shapeId → 僅限該 shape 作用域內的詞彙
 *
 * 每個 ExplainerShape 在建立時應將其 props.terms + props.userTerms
 * 註冊到此 registry，刪除時應 deregister。
 */
export class TermRegistry implements ITermRegistry {
  /** shapeId → Set<term> */
  private shapeTerms = new Map<string, Set<string>>()
  /** term → Set<shapeId>（反向索引，供 isTerm 快速查詢） */
  private termShapes = new Map<string, Set<string>>()

  register(term: string, shapeId?: string): void {
    if (!shapeId) {
      // 全域註冊：插入到所有作用域（跳過反向索引）
      return
    }

    let terms = this.shapeTerms.get(shapeId)
    if (!terms) {
      terms = new Set()
      this.shapeTerms.set(shapeId, terms)
    }
    if (terms.has(term)) return // 已存在

    terms.add(term)

    let shapes = this.termShapes.get(term)
    if (!shapes) {
      shapes = new Set()
      this.termShapes.set(term, shapes)
    }
    shapes.add(shapeId)
  }

  /**
   * 批次註冊某個 shape 的所有詞彙
   */
  registerAll(terms: string[], shapeId: string): void {
    for (const t of terms) {
      this.register(t, shapeId)
    }
  }

  /**
   * 移除某個 shape 的所有詞彙註冊（刪除 shape 時呼叫）
   */
  deregisterShape(shapeId: string): void {
    const terms = this.shapeTerms.get(shapeId)
    if (!terms) return

    for (const term of terms) {
      const shapes = this.termShapes.get(term)
      if (shapes) {
        shapes.delete(shapeId)
        if (shapes.size === 0) this.termShapes.delete(term)
      }
    }
    this.shapeTerms.delete(shapeId)
  }

  getTerms(shapeId?: string): string[] {
    if (!shapeId) {
      // 回傳所有 term（全域）
      return [...this.termShapes.keys()]
    }
    const terms = this.shapeTerms.get(shapeId)
    return terms ? [...terms] : []
  }

  isTerm(text: string, shapeId?: string): boolean {
    if (!shapeId) {
      return this.termShapes.has(text)
    }
    const terms = this.shapeTerms.get(shapeId)
    return terms ? terms.has(text) : false
  }

  /**
   * 取得註冊了該 term 的所有 shapeId
   */
  getShapesForTerm(term: string): string[] {
    const shapes = this.termShapes.get(term)
    return shapes ? [...shapes] : []
  }
}
