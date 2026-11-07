import type { Node, Viewport } from '../canvas/store'
import type { CanvasLayout } from '../../shared/layout'
import { hostService, isHosted } from './CanvasHost'

export function captureHostLayout(boardId: string, nodes: Node[], viewport: Viewport): CanvasLayout {
  return {
    boardId, viewport,
    cards: nodes.map(node => ({
      id: node.id, position: { ...node.position },
      width: node.width ?? (Number(node.data.w) || 360),
      height: node.height ?? (Number(node.data.h) || 280),
    })),
  }
}


export function restoreHostLayout(boardId: string): CanvasLayout | null {
  return isHosted ? hostService.restoreLayout?.(boardId) ?? null : null
}

export function saveHostLayout(layout: CanvasLayout) {
  if (isHosted) hostService.saveLayoutState?.(layout)
}
