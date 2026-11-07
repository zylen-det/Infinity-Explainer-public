# Integration boundaries

The public core owns card data, layout, selection anchors, rendering, editing,
local persistence, model-provider requests, and generic MCP operations. It can
build and run without any private integration repository.

An adapter owns its platform's conversation bridge, authentication, hosted
storage, resource presentation metadata, deployment configuration, and review
materials. It imports this package; the core never imports an adapter.

## Browser entry

```ts
import { configureCanvasHost } from '@infinity-explainer/core/runtime'

configureCanvasHost(myHost)
await import('@infinity-explainer/core/mount')
```

Implement `CanvasHost` to supply authoritative snapshots, subscriptions, writes,
follow-up generation, and layout persistence. `questionHint` tells users where to
continue an Ask action. Optional layout-state hooks support platform-local caches;
the adapter's durable snapshots remain authoritative. No platform global is read
by the shared UI. Without configuration, the standalone app uses its own model
provider and browser storage.

The package exports source files for integration builds. Install this checkout's
own dependencies before consuming it through a local `file:` link. Include
`node_modules/@infinity-explainer/core/src/hybrid-markdown.d.ts` in a consumer
TypeScript project to load the editor dependency declarations. The consumer
must bundle the TSX entry and CSS, and deduplicate React, React DOM, and CodeMirror
state/view when combining dependencies from separate checkouts.

## MCP entry

`server/mcp.ts` exports the shared factory. Without widget HTML, all operations
are available to the calling model and no UI resource is registered. With HTML,
it exposes the standard MCP Apps resource and app-only editing actions.

Adapters may supply instructions and render/resource metadata. When linked
checkouts contain separate SDK copies, pass the transport's `McpServer` constructor
as `serverClass`; the SDK transport uses constructor identity during dispatch.
Keep platform-specific metadata in the adapter rather than adding it to the core.

MCP snapshots and standalone browser storage are separate. An agent-controlled
browser experience needs a real adapter connecting them, including a supported
way to deliver browser follow-ups back to a running agent. A skill alone cannot
wake an agent after its execution has ended.
