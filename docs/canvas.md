# Canvas interaction layer

The canvas uses `d3-zoom`, `d3-drag`, and `d3-selection`. React renders the existing card components, SVG connections, and HTML selection marks. There is no node-editor framework or canvas branding UI.

`src/canvas/store.ts` owns card data, connections, selection, dimensions, and the camera. Its subscriptions supply both React and host layout persistence. Host updates continue to merge answer data without replacing local geometry. The existing `infinity-explainer-rf` persistence envelope remains readable and writable so saved canvases and exported files need no conversion.

`src/canvas/Canvas.tsx` attaches D3 gesture handlers and renders the world layers. The camera applies one `translate(x, y) scale(zoom)` to their common parent; camera movement does not require rerendering every card. Card positions and sizes use canvas coordinates. Pointer movement and DOM rectangles are converted using the same camera transform and surface origin. CSS-transformed HTML drag coordinates must explicitly account for zoom.

The surface uses `overflow: clip`: focus and `scrollIntoView` must not create an independent scroll offset in addition to the camera transform. Internal card content retains native scrolling. The paint order remains cards, connection strokes, then selection marks.

The interaction layer supports blank-space panning, space-drag panning, wheel/pinch zoom, mouse/touch card dragging, modifier and rectangle selection, group dragging, keyboard movement and offscreen focus navigation, deletion, and resizing from four corners or four edges. Resizing preserves the opposite edge and enforces the existing 200 × 100 minimum. Reading mode continues to own wheel/touch reading progress and uses cancellable camera transitions with a constant zoom between cards.

Engineering coverage lives in `tests/ui.test.mjs`. Existing assertions for editing, selection anchors, connection layering, reading, legacy data, deletion, local persistence remain. Additional D3 coverage exercises 25%, 100%, and 400% drag/resize coordinates, focal wheel zoom, touch pinch and drag, native text selection, internal scrolling, selection/group movement, resize limits, keyboard movement and focus navigation, and camera restoration. Browser-computed matrices are compared at subpixel precision where CSS serialization rounds floating-point values.

Visual acceptance remains a manual review of the existing light/dark and desktop/mobile presentations. Automated behavior checks do not substitute for that review.
