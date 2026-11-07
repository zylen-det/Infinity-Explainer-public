import { useEffect, useRef, useState } from 'react'
import { useSafeFloatingPosition } from './useSafeFloatingPosition'
import { captureSelection, type SelectionAnchor } from '../core/selectionAnchor'
import { hostService, isHosted } from '../services/CanvasHost'

export type CardSelection = { nodeId: string; text: string; x: number; y: number; selection: SelectionAnchor }
type Selection = CardSelection

export function SelectionPopover({ onAddCard }: { onAddCard: (selection: CardSelection) => void }) {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  useSafeFloatingPosition(popoverRef, selection && !asking ? selection.x - 180 : undefined,
    selection && !asking ? selection.y + 12 : undefined)
  useEffect(() => {
    const update = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelection(null); return }
      const root = sel.anchorNode?.parentElement?.closest('[data-node-root]')
      if (!root || !root.contains(sel.focusNode)) { setSelection(null); return }
      const body = root.querySelector<HTMLElement>('.markdown-content')
      if (!body) { setSelection(null); return }
      const selection = captureSelection(body, sel.getRangeAt(0))
      if (!selection) { setSelection(null); return }
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setSelection({ nodeId: root.getAttribute('data-node-root')!, selection, text: selection.text, x: rect.left + rect.width / 2, y: rect.bottom })
    }
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelection(null); setAsking(false) } }
    document.addEventListener('selectionchange', update)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('selectionchange', update); document.removeEventListener('keydown', close) }
  }, [])
  const [askSelection, setAskSelection] = useState<Selection | null>(null)
  const explain = (picked: Selection, question = '') => {
    window.dispatchEvent(new CustomEvent('infinity-explain', { detail: { ...picked, text: question ? `${picked.text} — ${question}` : picked.text } }))
    setSelection(null); setAsking(false); setQuestion(''); window.getSelection()?.removeAllRanges()
  }
  return <>
    {selection && !asking && <div ref={popoverRef} role="toolbar" aria-label="Selected text actions" className="selection-popover" onPointerDown={e => e.preventDefault()}>
      <button onClick={() => { onAddCard(selection); setSelection(null); window.getSelection()?.removeAllRanges() }}>＋ Add card</button>
      <button onClick={() => explain(selection)}>↗ Explain</button>
      <button onClick={() => {
        if (!isHosted) { setAskSelection(selection); setAsking(true); return }
        void hostService.stageQuestion(selection.nodeId, selection.text, selection.selection).then(() => {
          setNotice('已選取「' + selection.text + '」。' + hostService.questionHint);
          setSelection(null); window.getSelection()?.removeAllRanges()
        }).catch(error => setError(error instanceof Error ? error.message : String(error)))
      }}>☷ Ask</button>
      <button onClick={() => { void navigator.clipboard.writeText(selection.text).then(() => { setSelection(null); window.getSelection()?.removeAllRanges() }).catch(() => setError('Could not copy. Use your browser’s Copy action.')) }}>▢ Copy</button>
    </div>}
    {asking && askSelection && <form className="ask-composer" onSubmit={e => { e.preventDefault(); if (question.trim()) explain(askSelection, question.trim()) }}>
      <div className="ask-quote">{askSelection.text}</div>
      <textarea autoFocus aria-label="Your question" placeholder="Ask about the selected text…" value={question} onChange={e => setQuestion(e.target.value)} />
      <div className="ask-actions"><button type="button" onClick={() => setAsking(false)}>Cancel</button><button type="submit" disabled={!question.trim()}>Send ↗</button></div>
    </form>}
    {notice && <button className="feedback-toast" onClick={() => setNotice('')}>{notice}</button>}
    {error && <button className="feedback-toast" onClick={() => setError('')}>{error}</button>}
  </>
}
