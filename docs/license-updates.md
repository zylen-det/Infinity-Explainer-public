# Third-party notice reconciliation

The public notice file was compared with the exact package versions in the root
and `server/package-lock.json` production dependency trees. Development-only and
optional entries were excluded. Duplicate package/version pairs across installations
were combined. Installed package manifests were checked against the lockfiles.

The comparison found **200 package versions** without their own matching notice
entry, including packages previously absent and additional versions of packages
already listed. All 200 entries have been added to
[`public/THIRD_PARTY_LICENSES.txt`](../public/THIRD_PARTY_LICENSES.txt).

This inventory conservatively covers the production dependency trees, including
transitive type packages and modules a browser build may remove. It does not claim
that every listed dependency is bundled. Existing notices, source-header
supplements, and font terms are retained. The introduction now describes the
standalone app and optional local MCP server rather than private deployment products.

License and NOTICE files were copied from installed packages without changing
their text (apart from surrounding whitespace and line-ending normalization).
Four packages need supplements: `strictdom` includes full MIT terms in its README;
`format` includes a copyright and MIT declaration, supplemented with full MIT terms;
`react-remove-scroll-bar` declares MIT but omits a license file, so the upstream
LICENSE is included with its pinned revision; `highlightjs-vue` declares CC0-1.0,
supplemented with Creative Commons' full legal code. Sources are identified below
and alongside the supplemented text.

## Entries added

| Package and version | Declared license | Installation | License text source |
| --- | --- | --- | --- |
| `@antfu/install-pkg@2.1.0` | MIT | Root | Packaged LICENSE |
| `@babel/runtime@7.29.10` | MIT | Root | Packaged LICENSE |
| `@chevrotain/types@11.1.2` | Apache-2.0 | Root | Packaged LICENSE.txt |
| `@codemirror/lint@6.9.7` | MIT | Root | Packaged LICENSE |
| `@codemirror/streamparser@6.0.0` | MIT | Root | Packaged LICENSE |
| `@floating-ui/core@1.8.0` | MIT | Root | Packaged LICENSE |
| `@floating-ui/dom@1.8.0` | MIT | Root | Packaged LICENSE |
| `@floating-ui/react-dom@2.1.9` | MIT | Root | Packaged LICENSE |
| `@floating-ui/utils@0.2.12` | MIT | Root | Packaged LICENSE |
| `@hono/node-server@2.1.6` | MIT | Server | Packaged LICENSE |
| `@iconify/types@2.0.0` | MIT | Root | Packaged license.txt |
| `@modelcontextprotocol/core@2.4.0` | Apache-2.0 | Server | Packaged LICENSE |
| `@modelcontextprotocol/node@2.1.2` | Apache-2.0 | Server | Packaged LICENSE |
| `@modelcontextprotocol/server@2.4.0` | Apache-2.0 | Server | Packaged LICENSE |
| `@radix-ui/number@1.1.3` | MIT | Root | Packaged LICENSE |
| `@radix-ui/primitive@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-accessible-icon@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-accordion@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-alert-dialog@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-arrow@1.1.17` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-aspect-ratio@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-avatar@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-checkbox@1.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-collapsible@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-collection@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-compose-refs@1.1.5` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-context-menu@2.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-context@1.3.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-dialog@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-direction@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-dismissable-layer@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-dropdown-menu@2.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-focus-guards@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-focus-scope@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-form@0.3.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-hover-card@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-id@1.1.4` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-label@2.1.17` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-menu@2.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-menubar@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-navigation-menu@1.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-one-time-password-field@0.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-password-toggle-field@0.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-popover@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-popper@1.4.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-portal@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-presence@1.1.11` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-primitive@2.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-progress@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-radio-group@1.5.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-roving-focus@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-scroll-area@1.4.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-select@2.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-separator@1.2.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-slider@1.6.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-slot@1.5.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-switch@1.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-tabs@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-toast@1.3.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-toggle-group@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-toggle@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-toolbar@1.2.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-tooltip@1.4.1` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-callback-ref@1.1.5` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-controllable-state@1.3.0` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-effect-event@0.0.5` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-escape-keydown@1.1.6` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-is-hydrated@0.1.3` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-layout-effect@1.1.4` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-previous@1.1.4` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-rect@1.1.4` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-use-size@1.1.5` | MIT | Root | Packaged LICENSE |
| `@radix-ui/react-visually-hidden@1.2.13` | MIT | Root | Packaged LICENSE |
| `@radix-ui/rect@1.1.3` | MIT | Root | Packaged LICENSE |
| `@types/d3-array@3.2.2` | MIT | Root | Packaged LICENSE |
| `@types/d3-axis@3.0.6` | MIT | Root | Packaged LICENSE |
| `@types/d3-brush@3.0.6` | MIT | Root | Packaged LICENSE |
| `@types/d3-chord@3.0.6` | MIT | Root | Packaged LICENSE |
| `@types/d3-color@3.1.3` | MIT | Root | Packaged LICENSE |
| `@types/d3-contour@3.0.6` | MIT | Root | Packaged LICENSE |
| `@types/d3-delaunay@6.0.4` | MIT | Root | Packaged LICENSE |
| `@types/d3-dispatch@3.0.7` | MIT | Root | Packaged LICENSE |
| `@types/d3-drag@3.0.7` | MIT | Root | Packaged LICENSE |
| `@types/d3-dsv@3.0.7` | MIT | Root | Packaged LICENSE |
| `@types/d3-ease@3.0.2` | MIT | Root | Packaged LICENSE |
| `@types/d3-fetch@3.0.7` | MIT | Root | Packaged LICENSE |
| `@types/d3-force@3.0.10` | MIT | Root | Packaged LICENSE |
| `@types/d3-format@3.0.4` | MIT | Root | Packaged LICENSE |
| `@types/d3-geo@3.1.1` | MIT | Root | Packaged LICENSE |
| `@types/d3-hierarchy@3.1.7` | MIT | Root | Packaged LICENSE |
| `@types/d3-interpolate@3.0.4` | MIT | Root | Packaged LICENSE |
| `@types/d3-path@3.1.1` | MIT | Root | Packaged LICENSE |
| `@types/d3-polygon@3.0.2` | MIT | Root | Packaged LICENSE |
| `@types/d3-quadtree@3.0.6` | MIT | Root | Packaged LICENSE |
| `@types/d3-random@3.0.4` | MIT | Root | Packaged LICENSE |
| `@types/d3-scale-chromatic@3.1.0` | MIT | Root | Packaged LICENSE |
| `@types/d3-scale@4.0.9` | MIT | Root | Packaged LICENSE |
| `@types/d3-selection@3.0.12` | MIT | Root | Packaged LICENSE |
| `@types/d3-shape@3.2.0` | MIT | Root | Packaged LICENSE |
| `@types/d3-time-format@4.0.3` | MIT | Root | Packaged LICENSE |
| `@types/d3-time@3.0.4` | MIT | Root | Packaged LICENSE |
| `@types/d3-timer@3.0.2` | MIT | Root | Packaged LICENSE |
| `@types/d3-transition@3.0.9` | MIT | Root | Packaged LICENSE |
| `@types/d3-zoom@3.0.9` | MIT | Root | Packaged LICENSE |
| `@types/d3@7.4.3` | MIT | Root | Packaged LICENSE |
| `@types/debug@4.1.13` | MIT | Root | Packaged LICENSE |
| `@types/estree-jsx@1.0.5` | MIT | Root | Packaged LICENSE |
| `@types/estree@1.0.8` | MIT | Root | Packaged LICENSE |
| `@types/geojson@7946.0.16` | MIT | Root | Packaged LICENSE |
| `@types/hast@3.0.5` | MIT | Root | Packaged LICENSE |
| `@types/katex@0.16.8` | MIT | Root | Packaged LICENSE |
| `@types/mdast@4.0.4` | MIT | Root | Packaged LICENSE |
| `@types/ms@2.1.0` | MIT | Root | Packaged LICENSE |
| `@types/prismjs@1.26.6` | MIT | Root | Packaged LICENSE |
| `@types/react-dom@19.2.3` | MIT | Root | Packaged LICENSE |
| `@types/react@19.2.14` | MIT | Root | Packaged LICENSE |
| `@types/unist@2.0.11` | MIT | Root | Packaged LICENSE |
| `@types/unist@3.0.3` | MIT | Root | Packaged LICENSE |
| `aria-hidden@1.2.6` | MIT | Root | Packaged LICENSE |
| `character-entities-html4@2.1.0` | MIT | Root | Packaged license |
| `character-entities-legacy@3.0.0` | MIT | Root | Packaged license |
| `character-entities@2.0.2` | MIT | Root | Packaged license |
| `character-reference-invalid@2.0.1` | MIT | Root | Packaged license |
| `commander@15.0.0` | MIT | Root | Packaged LICENSE |
| `commander@7.2.0` | MIT | Root | Packaged LICENSE |
| `crelt@1.0.6` | MIT | Root | Packaged LICENSE |
| `cross-spawn@7.0.6` | MIT | Root | Packaged LICENSE |
| `csstype@3.2.3` | MIT | Root | Packaged LICENSE |
| `debug@4.4.3` | MIT | Root | Packaged LICENSE |
| `delaunator@5.1.0` | ISC | Root | Packaged LICENSE |
| `dequal@2.0.3` | MIT | Root | Packaged license |
| `detect-node-es@1.1.0` | MIT | Root | Packaged LICENSE |
| `entities@6.0.1` | BSD-2-Clause | Root | Packaged LICENSE |
| `eventsource@3.0.7` | MIT | Root | Packaged LICENSE |
| `fault@1.0.4` | MIT | Root | Packaged license |
| `format@0.2.2` | MIT | Root | Packaged Readme.md copyright and MIT declaration; full MIT text supplement |
| `get-nonce@1.0.1` | MIT | Root | Packaged LICENSE |
| `hachure-fill@0.5.2` | MIT | Root | Packaged LICENSE |
| `hast-util-from-html@2.0.3` | MIT | Root | Packaged license |
| `hast-util-from-parse5@8.0.3` | MIT | Root | Packaged license |
| `highlight.js@10.7.3` | BSD-3-Clause | Root | Packaged LICENSE |
| `highlightjs-vue@1.0.0` | CC0-1.0 | Root | Packaged CC0 declaration; [full CC0 text](https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt) |
| `hono@4.13.16` | MIT | Server | Packaged LICENSE |
| `iconv-lite@0.6.3` | MIT | Root | Packaged LICENSE |
| `import-meta-resolve@4.2.0` | MIT | Root | Packaged license |
| `internmap@1.0.1` | ISC | Root | Packaged LICENSE |
| `is-alphabetical@2.0.1` | MIT | Root | Packaged license |
| `is-alphanumerical@2.0.1` | MIT | Root | Packaged license |
| `is-decimal@2.0.1` | MIT | Root | Packaged license |
| `is-hexadecimal@2.0.1` | MIT | Root | Packaged license |
| `isexe@2.0.0` | ISC | Root | Packaged LICENSE |
| `jose@6.2.13` | MIT | Root | Packaged LICENSE.md |
| `lodash@4.18.1` | MIT | Root | Packaged LICENSE |
| `lowlight@1.20.0` | MIT | Root | Packaged license |
| `luxon@3.7.1` | MIT | Root | Packaged LICENSE.md |
| `mdast-util-directive@3.1.1` | MIT | Root | Packaged license |
| `mdast-util-mdx-expression@2.0.1` | MIT | Root | Packaged license |
| `mdast-util-mdx-jsx@3.2.0` | MIT | Root | Packaged license |
| `mdast-util-mdxjs-esm@2.0.1` | MIT | Root | Packaged license |
| `mdast-util-newline-to-break@2.0.0` | MIT | Root | Packaged license |
| `micromark-extension-directive@3.0.2` | MIT | Root | Packaged license |
| `micromark-extension-gfm-tagfilter@2.0.0` | MIT | Root | Packaged license |
| `micromark-util-encode@2.0.1` | MIT | Root | Packaged license |
| `micromark-util-symbol@2.0.1` | MIT | Root | Packaged license |
| `micromark-util-types@2.0.3` | MIT | Root | Packaged license |
| `ms@2.1.3` | MIT | Root | Packaged license.md |
| `package-manager-detector@1.9.0` | MIT | Root | Packaged LICENSE |
| `parse-entities@4.0.2` | MIT | Root | Packaged license |
| `parse5@7.3.0` | MIT | Root | Packaged LICENSE |
| `path-data-parser@0.1.0` | MIT | Root | Packaged LICENSE |
| `path-key@3.1.1` | MIT | Root | Packaged license |
| `points-on-curve@0.2.0` | MIT | Root | Packaged LICENSE |
| `points-on-path@0.2.1` | MIT | Root | Packaged LICENSE |
| `prismjs@1.30.0` | MIT | Root | Packaged LICENSE |
| `radix-ui@1.8.1` | MIT | Root | Packaged LICENSE |
| `react-markdown@9.1.0` | MIT | Root | Packaged license |
| `react-remove-scroll-bar@2.3.8` | MIT | Root | [Upstream LICENSE supplement](https://raw.githubusercontent.com/theKashey/react-remove-scroll-bar/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE); packaged MIT declaration |
| `react-remove-scroll@2.7.2` | MIT | Root | Packaged LICENSE |
| `react-style-singleton@2.2.3` | MIT | Root | Packaged LICENSE |
| `react-syntax-highlighter@16.1.2` | MIT | Root | Packaged LICENSE |
| `refractor@5.0.0` | MIT | Root | Packaged license |
| `remark-breaks@4.0.0` | MIT | Root | Packaged license |
| `remark-directive@3.0.1` | MIT | Root | Packaged license |
| `remark-stringify@11.0.0` | MIT | Root | Packaged license |
| `robust-predicates@3.0.3` | Unlicense | Root | Packaged LICENSE |
| `rw@1.3.3` | BSD-3-Clause | Root | Packaged LICENSE |
| `safer-buffer@2.1.2` | MIT | Root | Packaged LICENSE |
| `shebang-command@2.0.0` | MIT | Root | Packaged license |
| `shebang-regex@3.0.0` | MIT | Root | Packaged license |
| `strictdom@1.0.1` | MIT | Root | Packaged README.md license section |
| `stringify-entities@4.0.4` | MIT | Root | Packaged license |
| `tailwindcss@4.3.3` | MIT | Root | Packaged LICENSE |
| `tinyexec@1.3.1` | MIT | Root | Packaged LICENSE |
| `tslib@2.8.1` | 0BSD | Root | Packaged LICENSE.txt |
| `unist-util-remove-position@5.0.0` | MIT | Root | Packaged license |
| `use-callback-ref@1.3.3` | MIT | Root | Packaged LICENSE |
| `use-sidecar@1.1.3` | MIT | Root | Packaged LICENSE |
| `vfile-location@5.0.3` | MIT | Root | Packaged license |
| `which@2.0.2` | ISC | Root | Packaged LICENSE |
| `zwitch@2.0.4` | MIT | Root | Packaged license |

## Updating dependencies

After installing both lockfiles with `npm ci` and `npm ci --prefix server`, compare
production package/version pairs with the `=== package@version ===` notice headings.
For new or changed packages, retain their exact copyright, LICENSE, COPYING, and
NOTICE text. Review README and upstream sources when a tarball omits those files.
Keep bundled font terms and existing supplements when updating the inventory.

## AI SDK provider integration

The provider integration adds the following production package versions. Full
license and notice text is retained in the public notice file.

| Package and version | Declared license | License text source |
| --- | --- | --- |
| `@ai-sdk/anthropic@4.0.103` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/cohere@4.0.82` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/deepseek@3.0.85` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/gateway@4.0.144` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/google@4.0.119` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/groq@4.0.82` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/mistral@4.0.85` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/openai@4.0.116` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/openai-compatible@3.0.91` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/provider@4.0.38` | Apache-2.0 | Packaged LICENSE |
| `@ai-sdk/xai@5.0.44` | Apache-2.0 | Packaged LICENSE |
| `@standard-schema/spec@1.1.0` | MIT | Packaged LICENSE |
| `@vercel/oidc@3.2.0` | Apache-2.0 | Packaged LICENSE |
| `@workflow/serde@4.1.0` | Apache-2.0 | Packaged LICENSE.md |
| `ai@7.0.171` | Apache-2.0 | Packaged LICENSE |
| `json-schema@0.4.0` | (AFL-2.1 OR BSD-3-Clause) | Packaged LICENSE |
| `@ai-sdk/provider-utils@5.0.80` | Apache-2.0 | [Upstream license supplement](https://raw.githubusercontent.com/vercel/ai/%40ai-sdk%2Fprovider-utils%405.0.80/LICENSE) (package omits LICENSE) |
