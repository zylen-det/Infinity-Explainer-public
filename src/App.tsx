import { Button } from '@openai/apps-sdk-ui/components/Button'
import { DotsHorizontalMoreMenu, Download, FileUpload, Settings, Trash } from '@openai/apps-sdk-ui/components/Icon'
import { CardActionsContext } from './components/CardActionsContext'
import { CanvasControls } from './components/CanvasControls'
import { useSafeFloatingPosition } from './components/useSafeFloatingPosition'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Canvas, Background, CanvasProvider } from './canvas/Canvas'
import { useCanvas } from './canvas/context'
import type { Node as CanvasNode, Edge as CanvasEdge } from './canvas/store'

import ExplainerNode from './components/ExplainerNode'
import AnimatedEdge from './components/AnimatedEdge'
import { SelectionPopover, type CardSelection } from './components/SelectionPopover'
import { createId } from './core/createId'
import { SettingsPage } from './components/SettingsPage'
import { loadAppearance, type Appearance } from './services/Appearance'
import { PersistenceService } from './services/PersistenceService'
import { createSeedNode } from './core/seed'
import { llmService } from './core/services'
import type { LLMConfig } from './core/types'
import { hostService, isHosted } from './services/CanvasHost'
import { HostCanvas } from './components/HostCanvas'
import { useReadingMode } from './reading/context'
import { ReadingModeProvider, ReadingOverlay } from './reading/ReadingMode'

const nodeTypes = { explainer: ExplainerNode }
const edgeTypes = { animatedEdge: AnimatedEdge }

/** Card data and camera state live in the shared canvas store. */
function InnerApp() {
  const canvas = useCanvas()
  const reading = useReadingMode()
  const [showConfig, setShowConfig] = useState(false)
  const [appearance, setAppearance] = useState(loadAppearance)
  const light = appearance.theme === 'light'
  const [connectionsVisible, setConnectionsVisible] = useState(true)
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => llmService.getConfig())

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
  }, [light])

  const handleAppearanceChange = (next: Appearance) => {
    setAppearance(next)
    localStorage.setItem('infinity-appearance', JSON.stringify(next))
    localStorage.setItem('infinity-theme', next.theme)
  }
  const appearanceStyle = {
    '--bg': appearance.canvas, '--card': appearance.card, '--text': appearance.text,
    ...(appearance.text ? { '--color-text': appearance.text, '--secondary': appearance.text, '--muted': appearance.text } : {}),
  } as CSSProperties

  // ── Initialize from persistence or seed ──
  const [initial] = useState(() => {
    const restored = isHosted ? null : PersistenceService.tryRestore()
    const nodes = (restored?.nodes ?? []) as CanvasNode[]
    if (!isHosted && !restored) nodes.push(createSeedNode() as unknown as CanvasNode)
    return { nodes, edges: (restored?.edges ?? []) as CanvasEdge[], viewport: restored?.viewport }
  })

  // Auto-save & force render tracking
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (isHosted) return
    const save = () => {
      PersistenceService.save(
        canvas.getNodes(),
        canvas.getEdges(),
        canvas.getViewport(),
      )
    }
    const interval = setInterval(save, 500)
    return () => {
      clearInterval(interval)
      save()
    }
  }, [canvas])

  // ── Import / Export ──
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hostError, setHostError] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  useSafeFloatingPosition(contextMenuRef, contextMenu?.x, contextMenu?.y)

  useEffect(() => {
    if (!contextMenu) return
    contextMenuRef.current?.querySelector('button')?.focus()
    const close = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as HTMLElement)) setContextMenu(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [contextMenu])

  const handleAddCard = useCallback((point?: { x: number; y: number }, selection?: CardSelection) => {
    const width = 360, height = 240, gap = 40
    const nodes = canvas.getNodes()
    const source = selection ? canvas.getNode(selection.nodeId) : undefined
    if (selection && !source) return
    const surface = document.querySelector('.canvas-surface')!.getBoundingClientRect()
    const center = canvas.screenToCanvasPosition({ x: surface.left + surface.width / 2, y: surface.top + surface.height / 2 })
    const position = source
      ? { x: source.position.x + (source.width ?? source.measured?.width ?? width) + gap, y: source.position.y }
      : point ? canvas.screenToCanvasPosition(point) : { x: center.x - width / 2, y: center.y - height / 2 }
    // Keep the clicked position for the context menu; find free space for the other entrances.
    if (!point || source) {
      for (let attempt = 0; attempt <= nodes.length; attempt++) {
        const collision = nodes.find(node => position.x < node.position.x + (node.width ?? node.measured?.width ?? width) + gap &&
          position.x + width + gap > node.position.x && position.y < node.position.y + (node.height ?? node.measured?.height ?? height) + gap &&
          position.y + height + gap > node.position.y)
        if (!collision) break
        position.y = collision.position.y + (collision.height ?? collision.measured?.height ?? height) + gap
      }
    }
    const id = createId()
    canvas.setNodes(current => [...current.map(node => ({ ...node, selected: false })), {
      id, type: 'explainer', position, width, height, selected: true,
      data: { parentId: source?.id ?? null, text: '', terms: [], userTerms: [], status: 'idle', errorMessage: '', w: width, h: height },
    }])
    if (source && selection) canvas.setEdges(current => [...current, {
      id: createId(), source: source.id, target: id, sourceHandle: 's', targetHandle: 't', type: 'animatedEdge',
      data: { selection: selection.selection, startAnchorX: 1, startAnchorY: 0.5, endAnchorX: 0, endAnchorY: 0.5 },
    }])
    setContextMenu(null)
    if (isHosted) void hostService.createBlock(id, source?.id ?? null, selection?.selection).catch(error => {
      canvas.setNodes(current => current.filter(node => node.id !== id))
      canvas.setEdges(current => current.filter(edge => edge.target !== id))
      setHostError(error instanceof Error ? error.message : String(error))
    })
    // Bring cards placed beyond the current viewport into view, then focus the card itself.
    requestAnimationFrame(() => {
      if (!point || source) void canvas.fitView({ nodes: [{ id }], padding: 0.4, maxZoom: Math.min(1, canvas.getZoom()),
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200 })
      document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)?.focus({ preventScroll: true })
    })
  }, [canvas])

  const handleExport = useCallback(() => {
    const blob = PersistenceService.exportToBlob(
      canvas.getNodes(),
      canvas.getEdges(),
      canvas.getViewport(),
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `infinity-explainer-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [canvas])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      if (isHosted) {
        try {
          setHostError('')
          await hostService.importCanvas(reader.result as string)
          const layout = hostService.getSnapshot()?.layout
          if (layout) await canvas.setViewport(layout.viewport)
        } catch (error) { setHostError(error instanceof Error ? error.message : String(error)) }
        return
      }
      const data = PersistenceService.importFromString(reader.result as string)
      if (data) {
        canvas.setNodes(data.nodes as CanvasNode[])
        canvas.setEdges(data.edges as CanvasEdge[])
        if (data.viewport) {
          canvas.setViewport(data.viewport)
        }
        PersistenceService.save(data.nodes, data.edges, data.viewport)
        forceRender((n) => n + 1)
      }
    }
    if (isHosted) reader.onerror = () => setHostError('無法讀取畫布檔案，請重新選擇。')
    reader.readAsText(file)
    e.target.value = ''
  }, [canvas])

  const handleClear = useCallback(() => {
    PersistenceService.clear()
    window.location.reload()
  }, [])

  // ── LLM config ──
  const handleSaveConfig = useCallback((cfg: LLMConfig) => {
    llmService.configure(cfg)
    setLlmConfig(cfg)
  }, [])

  const providerStatus =
    llmConfig.provider === 'disabled'
      ? '⚫ LLM 未設定'
      : llmConfig.provider === 'openai'
        ? '🟢 OpenAI'
        : '🟢 llama.cpp'


  return (
    <div className={`app${light ? ' light' : ''}${reading.activeId ? ' reading-mode' : ''}`} style={appearanceStyle}
      onKeyDown={e => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing || e.key.toLowerCase() !== 'z') return
        const target = e.target as HTMLElement
        if (target.closest('input, textarea, button, a, [contenteditable], [role="dialog"]')) return
        e.preventDefault()
        e.stopPropagation()
        const card = target.closest('[data-node-id], .canvas__node')
        reading.enter(card?.getAttribute('data-node-id') ?? card?.getAttribute('data-id') ?? undefined)
      }}>
      <div className="canvas-surface">
        <Canvas
          defaultNodes={initial.nodes}
          defaultEdges={initial.edges}
          defaultViewport={initial.viewport}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          zoomOnScroll={!reading.activeId}
          zoomOnPinch={!reading.activeId}
          onMoveEnd={(event) => { if (event && reading.activeId) reading.snap() }}
          onPaneContextMenu={event => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }) }}
          onMoveStart={() => setContextMenu(null)}
          deleteKeyCode={reading.activeId ? null : ['Backspace', 'Delete']}
          onDelete={!isHosted ? ({ edges }) => {
            const detached = new Set(edges.map(edge => edge.target))
            canvas.setNodes(nodes => nodes.map(node => detached.has(node.id)
              ? { ...node, data: { ...node.data, parentId: null } } : node))
          } : undefined}
          onBeforeDelete={isHosted ? async ({ nodes, edges }) => {
            try {
              if (nodes.length || edges.length) await hostService.deleteBlocks(nodes.map(node => node.id), edges.map(edge => edge.target))
            } catch (error) { setHostError(error instanceof Error ? error.message : String(error)) }
            return false
          } : undefined}
          edgesVisible={connectionsVisible && !reading.activeId}
          nodesDraggable={!reading.activeId}
        >
          <Background />
        </Canvas>
      </div>

      <CanvasControls onAddCard={() => handleAddCard()} readingMode={!!reading.activeId}
        onReadingModeChange={() => reading.activeId ? reading.exit() : reading.enter()}
        connectionsVisible={connectionsVisible && !reading.activeId}
        onConnectionsChange={() => setConnectionsVisible(value => !value)} />
      <ReadingOverlay />
      <SelectionPopover onAddCard={selection => handleAddCard(undefined, selection)} />
      {contextMenu && <div ref={contextMenuRef} role="menu" aria-label="Canvas actions" className="selection-popover canvas-context-menu">
        <button role="menuitem" onClick={() => handleAddCard(contextMenu)}>＋ Add card</button>
      </div>}
      {isHosted && <HostCanvas />}

      <details className="canvas-menu">
        <summary aria-label="Canvas menu" title="Canvas menu"><DotsHorizontalMoreMenu /></summary>
        <div className="canvas-menu-panel">
          <Button color="secondary" variant="ghost" block onClick={() => fileInputRef.current?.click()}>
            <span className="menu-item-content"><FileUpload /><span>匯入畫布</span></span>
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} hidden />
          <Button color="secondary" variant="ghost" block onClick={handleExport}>
            <span className="menu-item-content"><Download /><span>匯出畫布</span></span>
          </Button>
          <Button color="secondary" variant="ghost" block onClick={event => {
            event.currentTarget.closest('details')?.removeAttribute('open')
            setShowConfig(true)
          }}><span className="menu-item-content"><Settings /><span>設定{!isHosted && ` · ${providerStatus.replace(/[⚫🟢] /gu, '')}`}</span></span></Button>
          {!isHosted && <>
          <div className="menu-divider" />
          <Button color="danger" variant="ghost" block onClick={handleClear}>
            <span className="menu-item-content"><Trash /><span>清除畫布並重新開始</span></span>
          </Button>
          </>}
        </div>
      </details>
      {isHosted && hostError && <button className="feedback-toast" role="alert" onClick={() => setHostError('')}>{hostError}</button>}

      {showConfig && (
        <SettingsPage appearance={appearance} onAppearanceChange={handleAppearanceChange}
          config={isHosted ? undefined : llmConfig} onSaveConfig={handleSaveConfig} onClose={() => setShowConfig(false)} />
      )}
    </div>
  )
}

function App() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return (
    <CardActionsContext value={{ target, setTarget }}>
    <CanvasProvider>
      <ReadingModeProvider><InnerApp /></ReadingModeProvider>
    </CanvasProvider>
    </CardActionsContext>
  )
}

export default App
