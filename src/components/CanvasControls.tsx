import { useContext, useState } from 'react'
import { CardActionsContext } from './CardActionsContext'
import { useCanvas, useViewport } from '../canvas/context'
import { useReadingMode } from '../reading/context'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { BookOpen, Collapse, Expand, Minus, Plus } from '@openai/apps-sdk-ui/components/Icon'

export function CanvasControls({ onAddCard, readingMode, connectionsVisible, onConnectionsChange, onReadingModeChange }: {
  onAddCard: () => void
  onReadingModeChange: () => void
  readingMode: boolean
  connectionsVisible: boolean
  onConnectionsChange: () => void
}) {
  const { setTarget } = useContext(CardActionsContext)
  const [expanded, setExpanded] = useState(true)
  const flow = useCanvas()
  const reading = useReadingMode()
  const { zoom } = useViewport()
  const [draft, setDraft] = useState<string | null>(null)
  const percent = Math.round(zoom * 100)
  const position = (percent - 10) / 390
  const changeZoom = (value: number) => {
    const next = Math.max(0.1, Math.min(4, value))
    if (readingMode) reading.zoomTo(next)
    else void flow.zoomTo(next)
  }
  const commit = () => {
    if (draft === null) return
    const value = Number(draft.replace('%', '').trim())
    if (Number.isFinite(value) && value > 0) changeZoom(value / 100)
    setDraft(null)
  }
  return <aside className="canvas-controls" aria-label="Canvas controls">
    <div className={`canvas-controls-reveal${expanded ? ' is-expanded' : ''}`} inert={!expanded}>
    <div id="canvas-controls-items" className="canvas-controls-items">
    {!readingMode && <Button className="canvas-icon" color="secondary" variant="outline" size="2xl" uniform aria-label="Add card" title="Add card" onClick={onAddCard}><Plus /></Button>}
    <fieldset className="zoom-control">
      <Button color="secondary" variant="ghost" size="xl" uniform aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.1} onClick={() => changeZoom(zoom / 1.2)}><Minus /></Button>
      <div className="zoom-track">
        <input className="zoom-range" type="range" aria-label="Canvas zoom" aria-valuetext={`${percent}%`}
          min="10" max="400" value={percent} onChange={e => changeZoom(Number(e.target.value) / 100)} />
        <div className="zoom-value" style={{ left: `calc(var(--zoom-thumb-width) / 2 + (100% - var(--zoom-thumb-width)) * ${position})` }}>
          {draft === null ? <button type="button" className="zoom-percentage" title="Double-click to edit zoom" aria-label={`Zoom ${percent}%, double-click to edit`}
            onDoubleClick={() => setDraft(String(percent))}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setDraft(String(percent)) } }}
            onPointerDown={e => {
              if (e.detail > 1) return
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId) || !e.buttons) return
              const track = e.currentTarget.closest('.zoom-track')!.getBoundingClientRect()
              const thumbWidth = e.currentTarget.getBoundingClientRect().width
              changeZoom(0.1 + Math.max(0, Math.min(1, (e.clientX - track.left - thumbWidth / 2) / (track.width - thumbWidth))) * 3.9)
            }}>{percent}%</button>
            : <input autoFocus className="zoom-input" aria-label="Zoom percentage" inputMode="decimal" value={draft}
              onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setDraft(null) }} />}
        </div>
      </div>
      <Button color="secondary" variant="ghost" size="xl" uniform aria-label="Zoom in" title="Zoom in" disabled={zoom >= 4} onClick={() => changeZoom(zoom * 1.2)}><Plus /></Button>
    </fieldset>
    <Button className="canvas-icon" color="secondary" variant="outline" size="2xl" uniform aria-label="Reset zoom"
      title={readingMode ? 'Reset zoom · Fit reading card' : 'Reset zoom · Show all cards'} onClick={() => {
        if (readingMode) reading.zoomTo()
        else void flow.fitView({ padding: 0.2, maxZoom: 1, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 })
      }}><Expand /></Button>
    <Button className="canvas-icon" color="secondary" variant="outline" size="2xl" uniform
      aria-label="Show connections" aria-pressed={connectionsVisible} disabled={readingMode}
      title={readingMode ? '縮放模式中連線已隱藏' : connectionsVisible ? '隱藏連線' : '顯示連線'} onClick={onConnectionsChange}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="5" cy="5" r="3" /><circle cx="19" cy="19" r="3" /><path d="M7 7l10 10" />
        {!connectionsVisible && <path d="M3 21L21 3" />}
      </svg>
    </Button>
    <Button className="canvas-icon" color="secondary" variant="outline" size="2xl" uniform
      aria-label={readingMode ? '退出縮放模式' : '縮放模式'} title={readingMode ? '退出縮放模式' : '縮放模式'}
      aria-pressed={readingMode} onClick={onReadingModeChange}>
      {readingMode ? <Collapse /> : <BookOpen />}
    </Button>
    </div>
    </div>
    <div className="controls-toggle-anchor">
    <div ref={setTarget} id="mobile-card-actions" role="toolbar" aria-label="Selected card actions" />
    <Button className="canvas-icon controls-toggle" color="secondary" variant="outline" size="2xl" uniform
      aria-label={expanded ? 'Collapse canvas controls' : 'Expand canvas controls'} aria-expanded={expanded}
      aria-controls="canvas-controls-items" title={expanded ? '收起工具列' : '展開工具列'} onClick={() => setExpanded(value => !value)}>
      <svg className={expanded ? 'is-expanded' : ''} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
    </Button>
    </div>
  </aside>
}
