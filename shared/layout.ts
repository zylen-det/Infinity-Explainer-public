export interface CardLayout {
  id: string
  position: { x: number; y: number }
  width: number
  height: number
}

export interface CanvasLayout {
  boardId: string
  cards: CardLayout[]
  viewport: { x: number; y: number; zoom: number }
}

function point(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const p = value as { x?: unknown; y?: unknown }
  return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)
}

export function isCanvasLayout(value: unknown): value is CanvasLayout {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<CanvasLayout>
  return typeof v.boardId === 'string' && Array.isArray(v.cards) && v.cards.length <= 500 &&
    v.cards.every(card => card && typeof card.id === 'string' && point(card.position) &&
      Number.isFinite(card.width) && card.width > 0 && Number.isFinite(card.height) && card.height > 0) &&
    new Set(v.cards.map(card => card.id)).size === v.cards.length &&
    point(v.viewport) && typeof v.viewport.zoom === 'number' && Number.isFinite(v.viewport.zoom) && v.viewport.zoom >= 0.1 && v.viewport.zoom <= 4
}
