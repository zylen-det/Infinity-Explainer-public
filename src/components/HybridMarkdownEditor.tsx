import { useEffect, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { hybridMarkdown, setTheme } from 'codemirror-markdown-hybrid'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Upstream previews use marked HTML. Sanitize before widgets insert it into DOM.
marked.use({ hooks: { postprocess: html => DOMPurify.sanitize(html, { ADD_TAGS: ['annotation'], ADD_ATTR: ['encoding'] }) } })

type Props = { initialText: string; onChange: (text: string) => void; onSave: () => void; onCancel: () => void }
export function HybridMarkdownEditor({ initialText, onChange, onSave, onCancel }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onSave, onCancel })
  useEffect(() => { callbacks.current = { onChange, onSave, onCancel } }, [onChange, onSave, onCancel])
  useEffect(() => {
    const app = container.current!.closest('.app')!
    const theme = () => app.classList.contains('light') ? 'light' : 'dark'
    const view = new EditorView({ parent: container.current!, state: EditorState.create({
      doc: initialText,
      extensions: [
        hybridMarkdown({ theme: theme(), enableCollapse: false }),
        EditorView.contentAttributes.of({ 'aria-label': 'Card Markdown editor' }),
        Prec.highest(keymap.of([
          { key: 'Escape', run: () => { callbacks.current.onCancel(); return true } },
          { key: 'Mod-Enter', run: () => { callbacks.current.onSave(); return true } },
        ])),
        EditorView.updateListener.of(update => { if (update.docChanged) callbacks.current.onChange(update.state.doc.toString()) }),
      ],
    }) })
    const observer = new MutationObserver(() => setTheme(view, theme()))
    observer.observe(app, { attributes: true, attributeFilter: ['class'] })
    view.focus()
    return () => { observer.disconnect(); view.destroy() }
    // A mounted editor owns its draft; props update callbacks without resetting selection/history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <div className="hybrid-editor nodrag nopan nowheel" ref={container} onKeyDown={e => e.stopPropagation()} />
}
