/** All dimensions and positions are in unscaled canvas units. */
export function readingProgress(position: number, cardHeight: number, visibleHeight: number, overflow: number) {
  const cameraTravel = Math.max(0, cardHeight - visibleHeight)
  const total = cameraTravel + Math.max(0, overflow)
  const current = Math.max(0, Math.min(total, position))
  return {
    current, total,
    camera: Math.min(current, cameraTravel),
    scroll: Math.max(0, current - cameraTravel),
    visible: Math.min(cardHeight, visibleHeight),
    content: cardHeight + Math.max(0, overflow),
  }
}
