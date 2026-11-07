# Dependency security updates

Security updates apply to two independent npm installations: the repository
root and `server/`. Check each one; auditing the root does not
cover the other two. Commit the matching manifests and lockfiles together.

```sh
npm audit
npm audit --prefix server
```

The root also supports pnpm. Its `pnpm.overrides` must stay equivalent to the
root npm `overrides`, and `pnpm-lock.yaml` must be updated when dependencies
change. npm and pnpm use different syntax for parent-specific overrides.

## Overrides retained after the November 2026 update

Some upstream packages still require affected dependency versions. These
overrides select actual patched packages rather than suppressing audit results.
Review and remove each override when the upstream requirement includes the fix.

| Installation | Dependency | Reason and verification |
| --- | --- | --- |
| Root | Apps SDK UI's lodash → 4.18.1 | Upstream pins 4.17.21. Browser tests cover the UI using the replacement. |
| Root | All KaTeX copies → the root KaTeX range | Markdown and editor packages otherwise install affected 0.16.x copies. Build and browser checks cover formula rendering and editing. |
| Root | typescript-estree's minimatch → 11.0.5 | Upstream's 10.x range has no patched version. This crosses a major version; verify lint parsing and the named `minimatch` API used for project glob matching. Node.js 24 satisfies its runtime requirement. |

Update MCP's Node adapter and server together according to their peer
dependencies; use `npm update --prefix server @hono/node-server` when an older
allowed adapter version remains in the lockfile.

Use the README's build, type, unit, and browser checks after changes. A clean
audit only describes known advisories for the resolved versions; it does not
replace those checks or a review of application behavior. 
