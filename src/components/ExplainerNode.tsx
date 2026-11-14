import { Button } from '@openai/apps-sdk-ui/components/Button';
import { ArrowLeft, DotsVerticalMoreMenu, ExitLogout } from '@openai/apps-sdk-ui/components/Icon';
import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvas, useNodes, useEdges } from "../canvas/context";
import { NodeResizer } from "../canvas/Canvas";
import type { ExplainerNodeData } from "../core/types";
import { HybridMarkdownEditor } from "./HybridMarkdownEditor";
import { MarkdownContent } from "./MarkdownContent";
import { CardSurface } from "./CardSurface";
import { CardActions } from './CardActions';
import { getClickableTerms } from "../core/types";
import { termRegistry, llmService } from "../core/services";
import { useCanvasBehavior } from '../canvas/behavior';
import type { ILLMService } from '../core/types';
import type { SelectionAnchor } from '../core/selectionAnchor';
import { createId } from '../core/createId';
import { traceCanvas } from '../services/CanvasTrace';

import { useReadingMode } from "../reading/context";

/* ── Helpers ──────────────────────────────────── */

function genId(): string {
  return createId();
}

/* ============================================================
   SectorSearch — 碰撞避讓演算法
   ============================================================ */

function boundsCollide(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  extraPadding = 0,
) {
  const PADDING = 40 + extraPadding;
  return !(
    a.maxX + PADDING < b.minX ||
    a.minX - PADDING > b.maxX ||
    a.maxY + PADDING < b.minY ||
    a.minY - PADDING > b.maxY
  );
}

function findPosition(
  centerX: number,
  centerY: number,
  baseAngle: number,
  checkCollision: (cx: number, cy: number) => boolean,
  initialRadius = 0,
  sourceBounds?: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number } | null {
  let radius = initialRadius || 140;
  let searchStep = 0;
  const maxAttempts = 1000;
  const sweepRange = Math.PI * 0.8;
  const radiusStep = 4;
  const angleSpeed = 0.15;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const angleOffset = Math.sin(searchStep * 2) * (sweepRange / 2);
    const currentAngle = baseAngle + angleOffset;

    for (let r = radius; r < radius + 500; r += radiusStep) {
      const cx = centerX + Math.cos(currentAngle) * r;
      const cy = centerY + Math.sin(currentAngle) * r;

      if (sourceBounds) {
        const testBounds = {
          minX: cx - 180,
          minY: cy - 120,
          maxX: cx + 180,
          maxY: cy + 120,
        };
        if (boundsCollide(testBounds, sourceBounds, 0)) continue;
      }

      if (!checkCollision(cx, cy)) {
        return { x: cx, y: cy };
      }
    }

    radius += radiusStep;
    searchStep += angleSpeed;
  }
  return null;
}

function ExplainerNode({
  id,
  data,
  selected = false,
  width,
  height,
}: {
  id: string;
  data: ExplainerNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}) {
  const canvas = useCanvas();
  const behavior = useCanvasBehavior();
  const manualResults = behavior.resultUpdates === 'manual';
  const explainStream = useMemo<ILLMService['explainStream']>(() => behavior.explain ?? llmService.explainStream.bind(llmService), [behavior.explain]);
  const reading = useReadingMode();
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editText, setEditText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);

  // sync ref with state for guard reads in stale closures
  useEffect(() => {
    isLoadingRef.current = !!loadingTerm;
  }, [loadingTerm]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 目前節點的所有可點擊詞彙
  const allTerms = useMemo(
    () => getClickableTerms({ terms: data.terms, userTerms: data.userTerms }),
    [data.terms, data.userTerms],
  );
  // 向 TermRegistry 註冊/清除此節點的詞彙
  useEffect(() => {
    termRegistry.registerAll(allTerms, id);
    return () => {
      termRegistry.deregisterShape(id);
    };
  }, [id, allTerms]);

  const handleSaveEdit = useCallback(async () => {
    try {
      if (editText !== data.text) {
        await behavior.onSaveCard?.(id, editText);
        canvas.updateNodeData(id, { text: editText, errorMessage: '' });
      }
      setEditing(false);
    } catch (error) {
      canvas.updateNodeData(id, { errorMessage: error instanceof Error ? error.message : String(error) });
    }
  }, [canvas, id, editText, data.text, behavior]);

  const handleCancelEdit = useCallback(() => { setEditing(false); setEditText(''); }, []);

  /* ---- Flow A: 點擊名詞 → 立即建立節點 + 連接線 + 串流 LLM ---- */
  const handleTermClick = useCallback(
    async (term: string, e: React.PointerEvent, selection?: SelectionAnchor) => {
      e.stopPropagation();
      e.preventDefault();
      if (isLoadingRef.current) return;

      const currentNodes = canvas.getNodes();
      const sourceNode = currentNodes.find((n) => n.id === id);
      if (!sourceNode) return;

      const srcData = sourceNode.data as unknown as ExplainerNodeData;
      // Use actual DOM dimensions from the ref for accurate collision & anchor
      const sourceW = containerRef.current?.offsetWidth ?? srcData.w ?? 360;
      const sourceH = containerRef.current?.offsetHeight ?? srcData.h ?? 240;
      const srcPos = sourceNode.position;
      const srcBounds = {
        minX: srcPos.x,
        minY: srcPos.y,
        maxX: srcPos.x + sourceW,
        maxY: srcPos.y + sourceH,
      };

      const centerX = (srcBounds.minX + srcBounds.maxX) / 2;
      const centerY = (srcBounds.minY + srcBounds.maxY) / 2;

      // 將螢幕座標轉換為 flow 座標
      const flowPos = canvas.screenToCanvasPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const baseAngle = Math.atan2(flowPos.y - centerY, flowPos.x - centerX);

      // SectorSearch
      const W = 360,
        H = 240;

      const checkCollision = (cx: number, cy: number) => {
        const testBounds = {
          minX: cx - W / 2,
          minY: cy - H / 2,
          maxX: cx + W / 2,
          maxY: cy + H / 2,
        };
        for (const n of canvas.getNodes()) {
          if (n.type === "explainer" && n.id !== id) {
            // Use the persisted card dimensions
            const nW = n.width ?? n.measured?.width ?? 360;
            const nH = n.height ?? n.measured?.height ?? 240;
            const b = {
              minX: n.position.x,
              minY: n.position.y,
              maxX: n.position.x + nW,
              maxY: n.position.y + nH,
            };
            if (boundsCollide(testBounds, b)) return true;
          }
        }
        return false;
      };

      const initialRadius = Math.max(sourceW, sourceH) / 2 + 50;
      const pos = findPosition(
        centerX,
        centerY,
        baseAngle,
        checkCollision,
        initialRadius,
        srcBounds,
      );

      const newX = pos ? pos.x - W / 2 : centerX + 150;
      const newY = pos ? pos.y - H / 2 : centerY + 100;

      // 建立新節點
      const newId = genId();
      traceCanvas('node-create', { source: 'explain', id: newId, parentId: id, position: { x: newX, y: newY } }, true);
      const header = `【${term}】\n\n`;

      // 計算錨點位置 (相對於來源節點的比例)
      const anchorX = sourceW > 0 ? (flowPos.x - srcPos.x) / sourceW : 0.5;
      const anchorY = sourceH > 0 ? (flowPos.y - srcPos.y) / sourceH : 0.5;

      const edgeId = genId();

      canvas.setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type: "explainer",
          position: { x: newX, y: newY },
          width: W,
          height: H,
          data: {
            parentId: id,
            text: header,
            terms: [] as string[],
            userTerms: [] as string[],
            status: "loading",
            errorMessage: "",
            w: W,
            h: H,
          },
        },
      ]);

      canvas.setEdges((eds) => [
        ...eds,
        {
          id: edgeId,
          source: id,
          target: newId,
          sourceHandle: "s",
          targetHandle: "t",
          type: "animatedEdge",
          data: {
            selection,
            startAnchorX: anchorX,
            startAnchorY: anchorY,
            endAnchorX: 0.5,
            endAnchorY: 0.5,
          },
        },
      ]);

      // Stream LLM response
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setLoadingTerm(term);

      const targetId = newId;

      try {
        const result = await explainStream(
          term,
          (fullText) => {
            if (abort.signal.aborted || manualResults) return;
            canvas.setNodes((nds) =>
              nds.map((n) =>
                n.id === targetId
                  ? { ...n, data: { ...n.data, text: header + fullText } }
                  : n,
              ),
            );
          },
          abort.signal,
          srcData.text,
          { blockId: targetId, parentId: id, selection },
        );
        if (abort.signal.aborted || manualResults) return;

        canvas.setNodes((nds) =>
          nds.map((n) =>
            n.id === targetId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    text: header + result.explanation,
                    terms: result.technical_terms,
                    status: "idle",
                  },
                }
              : n,
          ),
        );
      } catch (err: unknown) {
        if (abort.signal.aborted) return;
        console.error("LLM explain error:", err);
        traceCanvas('explain-error', { blockId: targetId, error: err instanceof Error ? err.message : String(err) });
        canvas.setNodes((nds) =>
          nds.map((n) =>
            n.id === targetId && (!manualResults || n.data.status === "loading")
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "error",
                    errorMessage:
                      err instanceof Error ? err.message : String(err),
                  },
                }
              : n,
          ),
        );
      } finally {
        if (!abort.signal.aborted) {
          setLoadingTerm(null);
        }
      }
    },
    [id, canvas, explainStream, manualResults],
  );

  /* ---- Error Retry ---- */
  const handleRetry = useCallback(async () => {
    const match = data.text.match(/^【(.+?)】/);
    if (!match) return;
    const term = match[1];
    const header = `【${term}】\n\n`;

    canvas.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, status: "loading", errorMessage: "" } }
          : n,
      ),
    );

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoadingTerm(term);
    try {
      const result = await explainStream(
        term,
        (fullText) => {
          if (abort.signal.aborted || manualResults) return;
          canvas.setNodes((nds) =>
            nds.map((n) =>
              n.id === id
                ? { ...n, data: { ...n.data, text: header + fullText } }
                : n,
            ),
          );
        },
        abort.signal,
        data.parentId ? String(canvas.getNode(data.parentId)?.data.text ?? '') : '',
        { blockId: id, parentId: data.parentId ?? null },
      );
      if (abort.signal.aborted || manualResults) return;

      canvas.setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  text: header + result.explanation,
                  status: "idle",
                  terms: result.technical_terms,
                },
              }
            : n,
        ),
      );
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("LLM retry error:", err);
      traceCanvas('explain-error', { blockId: id, error: err instanceof Error ? err.message : String(err) });
      canvas.setNodes((nds) =>
        nds.map((n) =>
          n.id === id && (!manualResults || n.data.status === "loading")
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : String(err),
                },
              }
            : n,
        ),
      );
    } finally {
      if (!abort.signal.aborted) setLoadingTerm(null);
    }
  }, [id, data.text, data.parentId, canvas, explainStream, manualResults]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; text: string; x: number; y: number; selection?: SelectionAnchor }>).detail;
      if (detail.nodeId !== id) return;
      void handleTermClick(detail.text, { clientX: detail.x, clientY: detail.y, stopPropagation() {}, preventDefault() {} } as React.PointerEvent, detail.selection);
    };
    window.addEventListener('infinity-explain', handler);
    return () => window.removeEventListener('infinity-explain', handler);
  }, [id, handleTermClick]);

  /* ---- Wheel event: content scroll wins over zoom ---- */
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
        e.stopPropagation();
      }
    };

    el.addEventListener("wheel", handler, { capture: true });
    return () =>
      el.removeEventListener("wheel", handler, {
        capture: true,
      } as EventListenerOptions);
  }, []);

  /* ---- Render ---- */
  const isError = data.status === "error";
  const isLoading = data.status === "loading";
  const title = data.text.match(/^【(.+?)】/)?.[1];
  const body = data.text.replace(/^【.+?】\s*/, "");

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || reading.activeId) return;
      const target = event.target;
      if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="dialog"]')) return;
      // Hover takes priority over a card that retained keyboard focus.
      const activeCard = document.querySelector('.explainer-card:hover') ?? target.closest('.explainer-card');
      if (activeCard !== containerRef.current) return;
      const key = event.key.toLowerCase();
      if (!['e', 'r', 'z'].includes(key) || (key === 'e' && isLoading)) return;
      event.preventDefault();
      event.stopPropagation();
      if (key === 'e') {
        if (editing) void handleSaveEdit();
        else { setEditText(data.text); setEditing(true); }
      } else if (key === 'r') setFocused(true);
      else reading.enter(id);
    };
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  }, [id, data.text, editing, isLoading, reading, handleSaveEdit]);


  return (
    <div
       ref={containerRef}
       data-node-id={id}
       className={`explainer-card animate-pop${selected ? " has-focus" : ""}${reading.activeId === id ? " reading-active" : ""}`}
       tabIndex={0}
       style={{
         border: "1px solid transparent",
         padding: 24,
         borderRadius: 20,
         overflow: "visible",
         fontSize: 13.5,
         lineHeight: 1.78,
         fontFamily: "system-ui, sans-serif",
         color: "var(--secondary)",
         minWidth: 200,
         minHeight: 100,
         pointerEvents: "all",
         boxSizing: "border-box",
         position: "relative",
         width: width,
         height: height,
       }}
     >
      <CardSurface />
      <CardActions id={id}><div role="group" aria-label="Card actions" className={`card-actions nodrag nopan${reading.activeId ? " reading-card-actions" : ""}`} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <button disabled={isLoading} title={editing ? "Save (Ctrl/⌘ Enter)" : "Edit card (E)"} aria-label={editing ? "Save card" : "Edit card"} aria-keyshortcuts={editing ? "Control+Enter Meta+Enter" : "E"} onClick={() => { if (editing) void handleSaveEdit(); else { setEditText(data.text); setEditing(true); } }}>{editing ? <><span aria-hidden="true">✓</span><span>Save</span></> : <><kbd>E</kbd><span>dit</span></>}</button>
        {editing && <button aria-label="Cancel editing" title="Cancel (Escape)" onClick={handleCancelEdit}>×</button>}
        <button title="Read card (R)" aria-label="Read card" aria-keyshortcuts="R" onClick={() => setFocused(true)}><kbd>R</kbd><span>ead</span></button>
        <button title="在畫布中縮放 (Z)" aria-label="Zoom card" aria-keyshortcuts="Z" onClick={() => reading.enter(id)}><kbd>Z</kbd><span>oom</span></button>
      </div></CardActions>
      {focused && <FocusCard initialId={id} onClose={() => setFocused(false)} />}
      <NodeResizer minWidth={200} minHeight={100} isVisible={selected && !reading.activeId} />


      <div
        className={`card-content${isLoading ? " is-loading" : ""}`}
        aria-busy={isLoading}
        ref={contentRef}
        data-node-root={id}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto",
          margin: !isLoading && (data.text.trim() || editing) ? "5px" : 0,
        }}
      >
        {editing && !reading.activeId ? (
          <>
            <HybridMarkdownEditor initialText={editText} onChange={setEditText} onSave={() => { void handleSaveEdit(); }} onCancel={handleCancelEdit} />
            {data.errorMessage && <div role="alert">{data.errorMessage}</div>}
          </>
        ) : (
          <>
            {isError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  marginBottom: 10,
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "#dc2626",
                }}
              >
                <span>⚠️</span>
                <span style={{ flex: 1 }}>{data.errorMessage}</span>
                <button
                  onClick={handleRetry}
                  style={{
                    padding: "2px 10px",
                    borderRadius: 4,
                    border: "1px solid #fca5a5",
                    background: "#fff",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  重試
                </button>
              </div>
            )}

            {title && <h2 className="card-title">{title}</h2>}
            {isLoading && (
              <div className="card-loading-status" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                <span>Preparing explanation…</span>
              </div>
            )}
            {isLoading && !body.trim() && (
              <div className="card-loading-skeleton" aria-hidden="true">
                <span /><span /><span />
              </div>
            )}
            {!data.text.trim() && !isLoading && <button className="empty-card-hint nodrag nopan" onPointerDown={e => e.stopPropagation()} onClick={() => { setEditText(''); setEditing(true); }}>Tap to edit</button>}
            {body.trim() && <div className="card-explanation nodrag nopan" onPointerDown={e => e.stopPropagation()}><MarkdownContent text={body} /></div>}
            {isLoading && behavior.onCancel && (
              <div className="card-loading-footer nodrag nopan" onPointerDown={e => e.stopPropagation()}>
                <button className="card-stop-waiting" onClick={() => {
                  void behavior.onCancel!(id).catch(error => {
                    canvas.updateNodeData(id, { status: 'error', errorMessage: error.message });
                  });
                }}>Stop waiting</button>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}

function FocusCard({ initialId, onClose }: { initialId: string; onClose: () => void }) {
  const flow = useCanvas();
  const nodes = useNodes();
  const edges = useEdges();
  const [activeId, setActiveId] = useState(initialId);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const card = nodes.find(node => node.id === activeId);
  // Older local canvases stored the relationship only on the connection.
  // Explicit parent metadata (including a root's null) takes precedence.
  const parentOf = (node: (typeof nodes)[number] | undefined) => {
    if (!node) return null;
    if (typeof node.data.parentId === 'string' || node.data.parentId === null) return node.data.parentId;
    return edges.find(edge => edge.target === node.id && edge.source !== node.id)?.source ?? null;
  };
  const leaves = nodes.filter(node => node.id !== activeId && node.type === 'explainer' && parentOf(node) === activeId);
  const text = String(card?.data.text ?? '');
  const ancestors: { id: string; title: string }[] = [];
  const visited = new Set([activeId]);
  let parentId = parentOf(card);
  while (typeof parentId === 'string' && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find(node => node.id === parentId);
    if (!parent) break;
    const parentText = String(parent.data.text ?? '');
    ancestors.unshift({ id: parent.id, title: parentText.match(/^【(.+?)】/)?.[1] ?? parentText.split('\n')[0] });
    parentId = parentOf(parent);
  }
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    triggerRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (navigationOpen) { setNavigationOpen(false); triggerRef.current?.focus(); }
        else onClose();
      }
      if (e.key === 'Tab') {
        const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, [tabindex="0"]') ?? [])];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    const outside = (e: PointerEvent) => {
      if (navigationOpen && !navigationRef.current?.contains(e.target as Node)) setNavigationOpen(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, [onClose, navigationOpen]);
  const title = text.match(/^【(.+?)】/)?.[1] ?? text.split('\n')[0];
  const body = text.startsWith('【') ? text.replace(/^【.+?】\s*/, '') : text;
  const jump = (id: string) => {
    setActiveId(id);
    traceCanvas('viewport-request', { source: 'focus-navigation', target: id, before: flow.getViewport() }, true);
    void flow.fitView({ nodes: [{ id }], padding: 0.3, maxZoom: 1, duration: 250 });
    document.querySelector('.focus-view')?.scrollTo(0, 0);
  };
  return createPortal(<section ref={dialogRef} className="focus-view" role="dialog" aria-modal="true" aria-label={title}>
    <div className="focus-navigation" ref={navigationRef}>
      <Button ref={triggerRef} className="canvas-icon" color="secondary" variant="outline" size="2xl" uniform
        aria-label="Node navigation" title="Node navigation" aria-expanded={navigationOpen} aria-controls="focus-node-navigation"
        onClick={() => setNavigationOpen(!navigationOpen)}><DotsVerticalMoreMenu /></Button>
      {navigationOpen && <aside id="focus-node-navigation" className="wordlist" aria-label="Node navigation">
        <div className="wordlist-title">Parent</div>
        {ancestors.length ? <nav aria-label="Parent cards">{[...ancestors].reverse().map(parent => <button className="wordlist-link parent-link" key={parent.id} onClick={() => jump(parent.id)}><ArrowLeft aria-hidden="true" /><span>{parent.title}</span></button>)}</nav> : <span className="navigation-empty">Starting card</span>}
        <div className="wordlist-section"><div className="wordlist-title">Child nodes <span>{leaves.length}</span></div>
          {leaves.length ? <nav aria-label="Leaf cards">{leaves.map((leaf, index) => {
            const leafText = String(leaf.data.text ?? '');
            const leafTitle = leafText.match(/^【(.+?)】/)?.[1] ?? leafText.split('\n')[0];
            return <button className="wordlist-link child-link" key={leaf.id} onClick={() => jump(leaf.id)} aria-busy={leaf.data.status === 'loading'}>
              <span className="child-number" aria-hidden="true" data-index={index + 1} /><span>{leafTitle}
              {leaf.data.status === 'loading' && <span className="wordlist-status" role="status"><span className="loading-spinner" aria-hidden="true" />Loading…</span>}
              {leaf.data.status === 'error' && <span className="wordlist-status">Failed</span>}</span>
            </button>;
          })}</nav> : <span className="navigation-empty">No child cards</span>}
        </div>
      </aside>}
    </div>
    <Button className="focus-close canvas-icon" color="secondary" variant="outline" size="2xl" uniform onClick={onClose} aria-label="Back to canvas" title="Exit read mode (Esc)"><ExitLogout /></Button>
    <main className="focus-paper"><h1>{title}</h1><div className="focus-body" data-node-root={activeId}><MarkdownContent text={body} /></div></main>
  </section>, document.querySelector('.app')!);
}

export default memo(ExplainerNode);
