/** Offsets address rendered text, so Markdown syntax does not affect anchoring. */
export interface SelectionAnchor {
  text: string
  start: number
  end: number
  prefix: string
  suffix: string
}

export function captureSelection(root: HTMLElement, range: Range): SelectionAnchor | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const before = document.createRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const raw = range.toString()
  const text = raw.trim()
  if (!text) return null
  const start = before.toString().length + raw.indexOf(text)
  const full = root.textContent ?? ''
  return { text, start, end: start + text.length, prefix: full.slice(Math.max(0, start - 32), start), suffix: full.slice(start + text.length, start + text.length + 32) }
}

export function resolveSelection(root: HTMLElement, anchor: SelectionAnchor): Range | null {
  const full = root.textContent ?? ''
  let best = -1
  let score = -Infinity
  for (let index = full.indexOf(anchor.text); index >= 0; index = full.indexOf(anchor.text, index + 1)) {
    let context = 0
    for (let i = 1; i <= anchor.prefix.length && full[index - i] === anchor.prefix.at(-i); i++) context++
    for (let i = 0; i < anchor.suffix.length && full[index + anchor.text.length + i] === anchor.suffix[i]; i++) context++
    const candidate = context * 100000 - Math.abs(index - anchor.start)
    if (candidate > score) { score = candidate; best = index }
  }
  if (best < 0) return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (!started && best < offset + length) { range.setStart(node, best - offset); started = true }
    const end = best + anchor.text.length
    if (started && end <= offset + length) { range.setEnd(node, end - offset); return range }
    offset += length
  }
  return null
}

export function selectionBody(nodeId: string): HTMLElement | null {
  return document.querySelector(`[data-node-id="${CSS.escape(nodeId)}"] .card-content .markdown-content`)
}
