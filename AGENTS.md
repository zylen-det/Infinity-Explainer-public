## Trace root cause first. Patching is the last choice

## Repository scope

This repo is a standalone local tool and reusable canvas UI source. Do not add Sites/plugin adapters, remote persistence clients, host protocols, account authorization, or platform bootstraps. UI callback types may remain transport-free; concrete implementations belong in the consuming private repo. Run `npm run check:public` after boundary changes.

Dependencies must point from a consumer to this package, never from public to a private repo. Reuse the same UI through props, callbacks and children; do not duplicate the canvas UI in consumers. See [UI reuse and repository boundary](docs/integration.md).
