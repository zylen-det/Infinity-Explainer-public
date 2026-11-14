# Reusing the canvas UI

This repository is a local application and the source of reusable canvas UI.
It contains no remote storage client, account authorization, conversation bridge,
or platform bootstrap. Such implementations belong to the consuming application.

`App` accepts optional `behavior` callbacks and children, rendered inside its
canvas providers. `CanvasBehavior` contains only UI actions: create, edit, delete,
import, selected-text questions, generation, and cancellation. Defaults retain
the local browser persistence, streaming provider and model settings. A caller
can supply manual persistence or document updates without adding transport code
to this repository. Child controls use the same canvas store as the shared UI.

```tsx
import App from '@infinity-explainer/core/app'
import '@infinity-explainer/core/src/index.css'

root.render(<App />)
```

The package exposes source files. Consumers bundle TSX and CSS and deduplicate
React, React DOM, and CodeMirror state/view when combining separate checkouts.
Include `src/hybrid-markdown.d.ts` in a consumer TypeScript project for the editor
dependency declarations.

The local MCP tools persist file snapshots independently from browser storage.
They do not automatically synchronize the local browser app. Any transport or
service connecting them is implemented outside this repository.

## Repository boundary

- Keep local browser persistence, user-selected model providers, and shared canvas UI here.
- Keep Sites/plugin adapters, HTTP storage, host lifecycle and snapshot synchronization, authentication, pairing, conversation providers, polling, platform controls, deployment and submission materials in the consuming repository.
- Consumers depend on this package; this package never depends on private code.
- Reuse these components through UI props, callbacks and children instead of copying a second canvas UI. Callback types do not contain endpoints, credentials, account scopes or host protocols.
- Run `npm run check:public`, local tests and the build when changing this boundary. The inventory check complements source review; absence of private IDs alone does not make an adapter suitable for this repo.
