import { readdir, readFile } from 'node:fs/promises'
import { resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const ignored = new Set(['.git', 'node_modules', 'dist', '.data'])
const forbidden = new Set(['.openai', 'sites', 'hosting.json', '.app.json', 'HostService.ts'])
const patterns = [
  /appgprj_[a-zA-Z0-9]{10,}/,
  /plugin_asdk_[a-zA-Z0-9_]{10,}/,
  /https:\/\/[^\s'"<>]+\.chatgpt\.site/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:gh[pousr]_|github_pat_)[a-zA-Z0-9_]{25,}/,
]
const problems = []
let checked = 0
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) { problems.push(relative(root, path) + ': unexpected symlink'); continue }
    if (forbidden.has(entry.name)) problems.push(relative(root, path) + ': private integration file')
    if (entry.isDirectory()) { await walk(path); continue }
    if (!/\.(?:[cm]?[jt]sx?|json|md|css|html|ya?ml)$/.test(basename(path))) continue
    const text = await readFile(path, 'utf8')
    checked++
    if (patterns.some(pattern => pattern.test(text))) problems.push(relative(root, path) + ': private identifier or credential pattern')
  }
}
await walk(root)
if (problems.length) throw new Error(problems.join('\n'))
console.log(`Checked ${checked} public text files; no private deployment files or identifiers found.`)
