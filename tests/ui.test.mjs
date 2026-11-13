import { test } from 'node:test'
import { assertJsonValue } from './json-value.mjs'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'vite'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

async function startVite(t) {
  const cacheDir = mkdtempSync(join(tmpdir(), 'infinity-ui-cache-'))
  const vite = await createServer({ cacheDir, logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  const server = createHttpServer(vite.middlewares)
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await vite.close()
    rmSync(cacheDir, { recursive: true, force: true })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  assert.ok(address && typeof address === 'object' && address.port > 0)
  return `http://127.0.0.1:${address.port}`
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function eventually(check) {
  for (let i = 0; i < 60; i++) { if (await check()) return; await pause(100) }
  assert.fail('Timed out waiting for UI state')
}

async function chooseTheme(page, theme) {
  await page.getByLabel('Canvas menu', { exact: true }).click()
  await page.getByRole('button', { name: /^設定/ }).click()
  const settings = page.getByRole('dialog', { name: '設定', exact: true })
  await settings.getByRole('button', { name: theme, exact: true }).click()
  await settings.getByRole('button', { name: '返回畫布', exact: true }).click()
}

test('left drag, Markdown/math hybrid editing, save/cancel and parent navigation', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const make = (id, title, parentId, x, y) => ({ id, type: 'explainer', position: { x, y }, width: 360, height: 320,
    data: { text: `【${title}】\n\n**Bold** content\n\n$x^2$\n\nLast line\n\nPrefix one **duplicate** suffix one\n\nPrefix two **duplicate** suffix two`, terms: [], userTerms: [], parentId, status: 'idle', errorMessage: '', w: 360, h: 320 } })
  await page.addInitScript(nodes => localStorage.setItem('infinity-explainer-canvas', JSON.stringify({
    format: 'infinity-explainer-rf', nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 },
  })), [make('root', 'Root', null, 80, 120), make('parent', 'Parent', 'root', 520, 120), make('child', 'Child', 'parent', 960, 120)])
  await page.goto(base)
  const root = page.locator('[data-node-id="root"]')
  await root.waitFor()
  await eventually(async () => await root.locator('.markdown-content strong').count() === 3)
  await page.waitForTimeout(600) // Entrance animation must finish before coordinate assertions.
  assert.equal(await root.locator('.katex').count(), 1)
  const viewport = page.locator('.canvas__viewport')
  const beforePan = await viewport.getAttribute('style')
  await page.mouse.move(300, 750); await page.mouse.down({ button: 'left' }); await page.mouse.move(370, 800, { steps: 8 }); await page.mouse.up()
  assert.notEqual(await viewport.getAttribute('style'), beforePan)
  const before = await root.boundingBox()
  const title = await root.locator('.card-title').boundingBox()
  await page.mouse.move(title.x + 30, title.y + 10); await page.mouse.down({ button: 'left' }); await page.mouse.move(title.x + 100, title.y + 50, { steps: 8 }); await page.mouse.up()
  const after = await root.boundingBox()
  assert.ok(after.x - before.x > 60, 'left drag moves card horizontally')
  assert.ok(after.y - before.y > 30, 'left drag moves card vertically')
  const beforeShortcut = await root.locator('.markdown-content').innerText()
  await root.focus()
  await root.press('e')
  const shortcutEditor = root.getByRole('textbox', { name: 'Card Markdown editor' })
  await shortcutEditor.waitFor()
  await shortcutEditor.press('Control+Enter')
  await eventually(async () => await root.locator('.hybrid-editor').count() === 0)
  assert.equal(await root.locator('.markdown-content').innerText(), beforeShortcut, 'E opens the editor without inserting a character')
  await root.hover()
  await root.getByRole('button', { name: 'Edit card', exact: true }).click()
  const editor = root.getByRole('textbox', { name: 'Card Markdown editor' })
  await editor.waitFor()
  await eventually(async () => await root.locator('.cm-markdown-preview, .cm-math-preview').count() > 0)
  assert.ok(await root.locator('.katex').count() > 0, 'inactive math renders inside hybrid editor')
  await root.locator('.cm-markdown-preview').filter({ hasText: 'Bold' }).click()
  await eventually(async () => (await root.locator('.cm-line').allTextContents()).some(line => line.includes('**Bold**')))
  await chooseTheme(page, 'Light mode')
  assert.ok(await root.locator('.hybrid-editor').count(), 'theme switch preserves editor')
  await editor.focus()
  await editor.press('Control+End'); await editor.press('Enter'); await editor.pressSequentially('Saved change')
  await editor.press('Control+Enter')
  await eventually(async () => await root.locator('.hybrid-editor').count() === 0)
  assert.match(await root.locator('.markdown-content').innerText(), /Saved change/)
  await root.hover(); await root.getByRole('button', { name: 'Edit card', exact: true }).click()
  await editor.press('Control+End'); await editor.pressSequentially('Discard me'); await editor.press('Escape')
  await eventually(async () => await root.locator('.hybrid-editor').count() === 0)
  assert.doesNotMatch(await root.locator('.markdown-content').innerText(), /Discard me/)
  const child = page.locator('[data-node-id="child"]')
  await child.hover(); await child.getByRole('button', { name: 'Read card', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert.equal(await dialog.locator('.wordlist').count(), 0, 'navigation starts closed')
  await dialog.getByRole('button', { name: 'Node navigation', exact: true }).click()
  assert.equal(await dialog.locator('.wordlist-link').count(), 2)
  await dialog.getByRole('button', { name: 'Parent', exact: true }).click()
  assert.equal(await dialog.locator('h1').innerText(), 'Parent')
  assert.equal(await dialog.getByRole('navigation', { name: 'Leaf cards' }).innerText(), 'Child')
  await dialog.getByRole('navigation', { name: 'Leaf cards' }).getByRole('button', { name: 'Child' }).click()
  assert.equal(await dialog.locator('h1').innerText(), 'Child')
  await dialog.getByRole('button', { name: 'Root', exact: true }).click()
  assert.equal(await dialog.locator('h1').innerText(), 'Root')
  await page.keyboard.press('Escape')
  assert.equal(await dialog.locator('.wordlist').count(), 0, 'Escape closes navigation first')
  await page.keyboard.press('Escape')
  await eventually(async () => await page.getByRole('dialog').count() === 0)
  // Select the second occurrence: an anchor must not jump to the first match.
  const duplicate = root.locator('.markdown-content strong').filter({ hasText: 'duplicate' }).nth(1)
  await duplicate.evaluate(el => {
    el.scrollIntoView({ block: 'nearest' })
    const range = document.createRange(); range.selectNodeContents(el)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await page.getByRole('button', { name: '↗ Explain', exact: true }).click()
  const mark = page.locator('.selection-mark').first()
  await mark.waitFor()
  const targetId = await mark.getAttribute('data-selection-target')
  const generated = page.locator(`[data-node-id="${targetId}"]`)
  await generated.waitFor()
  const connection = page.locator('.selection-connection').first()
  await page.waitForTimeout(600)
  const anchorBox = await duplicate.boundingBox(), markBox = await mark.boundingBox()
  assert.ok(Math.abs(anchorBox.y - markBox.y) < 2, `mark follows second occurrence: ${JSON.stringify({ anchorBox, markBox })}`)
  assert.ok(Math.abs(anchorBox.x - markBox.x) < 2)
  const endpoints = () => connection.evaluate(path => {
    const matrix = path.getScreenCTM()
    const start = path.getPointAtLength(0).matrixTransform(matrix)
    const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix)
    return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } }
  })
  const points = await endpoints(), targetBox = await generated.boundingBox()
  assert.ok(Math.abs(points.start.y - (markBox.y + markBox.height / 2)) < 2, 'line starts on selection')
  assert.ok(Math.min(Math.abs(points.end.x - targetBox.x), Math.abs(points.end.x - targetBox.x - targetBox.width), Math.abs(points.end.y - targetBox.y), Math.abs(points.end.y - targetBox.y - targetBox.height)) < 2, 'line ends on child boundary')
  const layers = await page.evaluate(() => ({
    edge: +getComputedStyle(document.querySelector('.canvas__edges')).zIndex,
    mark: +getComputedStyle(document.querySelector('.canvas__viewport-portal')).zIndex,
    card: +getComputedStyle(document.querySelector('.canvas__node')).zIndex,
  }))
  assert.ok(layers.card < layers.edge && layers.edge < layers.mark)
  // Verify a real click lands on the overlay and navigates to its child.
  await mark.click()
  await eventually(async () => (await page.locator(`.canvas__node[data-id="${targetId}"]`).getAttribute('class')).includes('selected'))
  // Finish navigation before choosing an empty pointer location. During travel a
  // child can pass under the cursor, and hover intentionally wins over focus.
  await eventually(async () => {
    const box = await generated.boundingBox()
    return Math.abs(box.x + box.width / 2 - 720) < 1 && Math.abs(box.y + box.height / 2 - 500) < 1
  })
  // Bring parent back and prepend text; quote/context must reanchor after editing.
  await page.mouse.move(500, 800)
  await root.evaluate(el => el.focus())
  await page.keyboard.press('e')
  await editor.waitFor()
  await editor.press('Control+Home'); await editor.press('ArrowDown'); await editor.press('Home')
  await editor.press('Enter'); await editor.press('ArrowUp'); await editor.pressSequentially('Inserted before selection')
  await editor.press('Control+Enter')
  await eventually(async () => await root.locator('.hybrid-editor').count() === 0)
  // The source scroll container may clip the quote after insertion; restore it.
  await root.locator('.markdown-content strong').filter({ hasText: 'duplicate' }).nth(1).evaluate(el => el.scrollIntoView({ block: 'nearest' }))
  await eventually(async () => await page.locator('.selection-mark').count() > 0)
  await eventually(async () => {
    const updatedQuote = await root.locator('.markdown-content strong').filter({ hasText: 'duplicate' }).nth(1).boundingBox()
    const updatedMark = await page.locator('.selection-mark').first().boundingBox()
    return updatedQuote && updatedMark && Math.abs(updatedQuote.y - updatedMark.y) < 2
  })
  // Persistence contains the exact quote/context, not just a proportional point.
  await eventually(async () => page.evaluate(() => JSON.parse(localStorage.getItem('infinity-explainer-canvas')).edges.length > 0))
  const savedAnchor = await page.evaluate(() => JSON.parse(localStorage.getItem('infinity-explainer-canvas')).edges[0].data.selection)
  assert.equal(savedAnchor.text, 'duplicate')
  assert.match(savedAnchor.prefix, /Prefix two/)
  // Deleted source text must not leave a marker pointing at unrelated content.
  await root.evaluate(el => el.focus()); await page.keyboard.press('e')
  await editor.waitFor(); await editor.press('Control+a')
  await page.keyboard.insertText('【Root】\n\nThe original quote was removed.')
  await editor.press('Control+Enter')
  await eventually(async () => await root.locator('.hybrid-editor').count() === 0)
  await eventually(async () => await page.locator('.selection-mark').count() === 0)
  await eventually(async () => await connection.getAttribute('data-selection-connected') === 'false')
  assert.notEqual(await connection.getAttribute('stroke-dasharray'), '1 0')
  assert.deepEqual(errors, [])
})

test('hovered cards receive E/R/Z shortcuts without focus and preserve editor typing', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  await page.addInitScript(() => localStorage.setItem('infinity-explainer-canvas', JSON.stringify({
    format: 'infinity-explainer-rf', edges: [], viewport: { x: 0, y: 0, zoom: 1 },
    nodes: ['first', 'second'].map((id, i) => ({ id, type: 'explainer', position: { x: 60 + i * 440, y: 180 }, width: 360, height: 240,
      data: { text: `【${id}】\n\nOriginal content`, terms: [], userTerms: [], status: 'idle', w: 360, h: 240 } })),
  })))
  await page.goto(base)
  const first = page.locator('[data-node-id="first"]')
  const second = page.locator('[data-node-id="second"]')
  await second.waitFor()
  await page.waitForTimeout(600)
  await first.focus()
  await second.hover()
  await page.keyboard.press('e')
  const editor = second.getByRole('textbox', { name: 'Card Markdown editor' })
  await editor.waitFor()
  assert.equal(await first.locator('.hybrid-editor').count(), 0, 'hover takes priority over retained focus')
  await editor.focus()
  await editor.press('Control+End')
  await first.hover()
  await page.keyboard.type('erz')
  assert.match(await editor.innerText(), /erz/)
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.locator('.reading-mode').count(), 0)
  await editor.press('Escape')
  await eventually(async () => await second.locator('.hybrid-editor').count() === 0)
  await second.evaluate(el => el.blur())
  await second.hover()
  await page.keyboard.press('Alt+r')
  assert.equal(await page.getByRole('dialog').count(), 0, 'modified keys do not run card actions')
  await page.keyboard.press('r')
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.getByRole('dialog').locator('h1').innerText(), 'second')
  await page.keyboard.press('Escape')
  await eventually(async () => await page.getByRole('dialog').count() === 0)
  await second.hover()
  await page.keyboard.press('z')
  await eventually(async () => await second.evaluate(el => el.classList.contains('reading-active')))
})

test('canvas reading unifies camera and content scrolling, minimap navigation and snapping', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    const make = (id, title, x, h, body, parentId = null) => ({ id, type: 'explainer', position: { x, y: 120 }, width: 360, height: h,
      data: { text: `【${title}】\n\n${body}`, terms: [], userTerms: [], parentId, status: 'idle', w: 360, h } })
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [make('long', 'Long', 80, 1400, '**Child**\n\n' + Array.from({ length: 120 }, (_, i) => `Paragraph ${i} with enough text to read.`).join('\n\n')),
        make('short', 'Child', 700, 320, 'Short content', 'long')],
      edges: [{ id: 'link', source: 'long', target: 'short', sourceHandle: 's', targetHandle: 't', type: 'animatedEdge' }],
      viewport: { x: 0, y: 0, zoom: 1 } }))
  })
  await page.goto(base)
  const card = page.locator('[data-node-id="long"]')
  await card.waitFor(); await page.waitForTimeout(600)
  const viewport = page.locator('.canvas__viewport')
  const original = await viewport.getAttribute('style')
  const initialLayout = await card.evaluate(el => ({ width: el.style.width, height: el.style.height, position: el.parentElement.style.transform }))
  await card.locator('..').focus()
  await page.keyboard.press('z')
  await eventually(async () => await page.locator('.reading-active').getAttribute('data-node-id') === 'long')
  await page.keyboard.press('Escape')
  await eventually(async () => await page.locator('.reading-active').count() === 0)
  await page.waitForTimeout(300)
  await card.hover()
  await card.getByRole('button', { name: 'Zoom card', exact: true }).click()
  const slider = page.getByRole('slider', { name: '閱讀進度' })
  await slider.waitFor(); await page.waitForTimeout(350)
  const assertCentered = async (node, vertical = false) => {
    const pane = await page.locator('.canvas').boundingBox()
    const box = await node.boundingBox()
    assert.ok(Math.abs(box.x + box.width / 2 - pane.x - pane.width / 2) < 1, 'reading card is horizontally centered')
    if (vertical) assert.ok(Math.abs(box.y + box.height / 2 - pane.y - pane.height / 2) < 1, 'short reading card is vertically centered')
  }
  await assertCentered(card)
  assert.equal(await page.locator('.reading-active').getAttribute('data-node-id'), 'long')
  assert.equal(await page.getByRole('button', { name: '退出縮放模式' }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('PageDown')
  await eventually(async () => Number(await slider.getAttribute('aria-valuenow')) > 0)
  await page.keyboard.press('Home')
  await eventually(async () => await slider.getAttribute('aria-valuenow') === '0')
  const content = card.locator('.card-content')
  const start = await viewport.getAttribute('style')
  await page.mouse.move(600, 600); await page.mouse.wheel(0, 200)
  await eventually(async () => await viewport.getAttribute('style') !== start)
  assert.equal(await content.evaluate(el => el.scrollTop), 0, 'camera travels before internal scroll')
  assert.ok(Number(await slider.getAttribute('aria-valuenow')) > 0)
  await slider.focus(); await page.keyboard.press('End')
  await eventually(async () => await slider.getAttribute('aria-valuenow') === '100')
  assert.ok(await content.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2), 'end reaches actual content bottom')
  const end = await viewport.getAttribute('style')
  await page.mouse.wheel(0, 2000); await page.waitForTimeout(150)
  assert.equal(await viewport.getAttribute('style'), end, 'reading boundary never zooms or snaps')
  assert.equal(await page.locator('.reading-active').getAttribute('data-node-id'), 'long')
  await slider.press('Home')
  await eventually(async () => await slider.getAttribute('aria-valuenow') === '0')
  assert.equal(await content.evaluate(el => el.scrollTop), 0)
  await content.evaluate(el => {
    const touch = y => new Touch({ identifier: 1, target: el, clientY: y, clientX: 300 })
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(600)] }))
    el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(350)] }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }))
  })
  assert.ok(Number(await slider.getAttribute('aria-valuenow')) > 0, 'touch reading uses the same progress')
  await slider.press('Home')
  const box = await slider.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * .6)
  assert.ok(Number(await slider.getAttribute('aria-valuenow')) > 40, 'minimap click jumps into content')
  await slider.press('Home')
  const mark = page.locator('.selection-mark').first()
  await mark.waitFor()
  const line = page.locator('.selection-connection')
  assert.equal(await line.evaluate(el => getComputedStyle(el).opacity), '0')
  await mark.hover()
  await eventually(async () => await line.evaluate(el => getComputedStyle(el).opacity) === '1')
  await mark.click()
  await eventually(async () => await page.locator('.reading-active').getAttribute('data-node-id') === 'short')
  await page.waitForTimeout(300)
  assert.equal(await slider.getAttribute('aria-valuenow'), '0')
  const short = page.locator('[data-node-id="short"]')
  await assertCentered(short, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(350)
  await assertCentered(short, true)
  const mobileCard = await short.boundingBox()
  const minimap = await page.getByRole('complementary', { name: '閱讀導覽' }).boundingBox()
  assert.ok(mobileCard.x + mobileCard.width < minimap.x, 'centered card leaves room for the mobile minimap')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(350)
  await assertCentered(short, true)
  // Drag background toward the long card; release must snap without moving nodes.
  await page.mouse.move(300, 900); await page.mouse.down(); await page.mouse.move(1075, 900, { steps: 10 }); await page.mouse.up()
  await eventually(async () => await page.locator('.reading-active').getAttribute('data-node-id') === 'long')
  await page.waitForTimeout(300)
  assert.deepEqual(await card.evaluate(el => ({ width: el.style.width, height: el.style.height, position: el.parentElement.style.transform })), initialLayout)
  // Return through an incoming connection and restore the long card's progress.
  await slider.focus(); await slider.press('End')
  await page.getByRole('button', { name: '退出縮放模式' }).click()
  await page.waitForTimeout(300)
  assert.equal(await viewport.getAttribute('style'), original)
  await page.getByRole('button', { name: '縮放模式', exact: true }).click()
  await eventually(async () => await slider.getAttribute('aria-valuenow') === '100')
  await page.keyboard.press('Escape')
  await eventually(async () => await slider.count() === 0)
  assert.deepEqual(errors, [])
})

test('zoom mode animates distant snaps without jumping or zooming out', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' })
  await page.addInitScript(() => {
    const nodes = [80, 8080].map((x, i) => ({ id: `card-${i}`, type: 'explainer', position: { x, y: 120 }, width: 360, height: 320,
      data: { text: `【Card ${i}】\n\nShort content`, terms: [], userTerms: [], parentId: null, status: 'idle', w: 360, h: 320 } }))
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf', nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } }))
  })
  await page.goto(base)
  await page.locator('[data-node-id="card-0"]').waitFor()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '縮放模式', exact: true }).click()
  await page.waitForTimeout(400)

  const sample = () => page.evaluate(() => {
    const read = () => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.canvas__viewport')).transform)
      return { x: matrix.e, y: matrix.f, zoom: matrix.a }
    }
    window.snapFrames = [read()]
    const start = performance.now()
    const tick = () => {
      window.snapFrames.push(read())
      if (performance.now() - start < 800) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  for (const [endX, id] of [[-8700, 'card-1'], [3300, 'card-1']]) {
    await page.mouse.move(300, 900)
    await page.mouse.down()
    await page.mouse.move(endX, 900, { steps: 10 })
    await sample()
    await page.mouse.up()
    await page.waitForTimeout(900)
    assert.equal(await page.locator('.reading-active').getAttribute('data-node-id'), id)
    const frames = await page.evaluate(() => window.snapFrames)
    const distance = Math.abs(frames.at(-1).x - frames[0].x)
    assert.ok(distance > 500, 'fixture requires a distant snap')
    assert.ok(frames.some(frame => Math.abs(frame.x - frames[0].x) > distance * .1 && Math.abs(frame.x - frames.at(-1).x) > distance * .1), 'snap has intermediate camera positions')
    const largestStep = Math.max(...frames.slice(1).map((frame, i) => Math.abs(frame.x - frames[i].x)))
    assert.ok(largestStep < distance * .6, `snap must not teleport: largest step ${largestStep}, distance ${distance}`)
    assert.ok(frames.every(frame => Math.abs(frame.zoom - 1.25) < .01), 'panning between cards preserves reading zoom')
    const box = await page.locator(`[data-node-id="${id}"]`).boundingBox()
    assert.ok(Math.abs(box.x + box.width / 2 - 720) < 1, 'snap finishes centered')
  }
})

test('focus navigation reads legacy edge-only relationships after restoring a local canvas', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    const make = (id, x) => ({ id, type: 'explainer', position: { x, y: 120 }, width: 360, height: 320,
      data: { text: `【${id}】\n\nLegacy card`, terms: [], userTerms: [], status: 'idle', w: 360, h: 320 } })
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [make('Root', 80), make('Child', 520), make('Grandchild', 960),
        { ...make('Explicit root', 80), position: { x: 80, y: 600 }, data: { ...make('Explicit root', 80).data, parentId: null } }],
      edges: [{ id: 'first', source: 'Root', target: 'Child' }, { id: 'second', source: 'Child', target: 'Grandchild' },
        { id: 'stale', source: 'Root', target: 'Explicit root' }], viewport: { x: 0, y: 0, zoom: 1 } }))
  })
  await page.goto(base)
  const root = page.locator('[data-node-id="Root"]')
  await root.waitFor(); await page.waitForTimeout(600)
  await root.hover(); await root.getByRole('button', { name: 'Read card', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Node navigation', exact: true }).click()
  const children = dialog.getByRole('navigation', { name: 'Leaf cards' })
  assert.equal(await children.getByRole('button').count(), 1, 'edge-only child appears without overriding an explicit root')
  await children.getByRole('button', { name: 'Child', exact: true }).click()
  assert.equal(await dialog.locator('h1').innerText(), 'Child')
  assert.equal(await dialog.getByRole('navigation', { name: 'Parent cards' }).innerText(), 'Root')
  await children.getByRole('button', { name: 'Grandchild', exact: true }).click()
  assert.equal(await dialog.locator('h1').innerText(), 'Grandchild')
  assert.equal(await dialog.getByRole('navigation', { name: 'Parent cards' }).getByRole('button').count(), 2)
  await dialog.getByRole('button', { name: 'Root', exact: true }).click()
  assert.equal(await children.innerText(), 'Child')
  assert.deepEqual(errors, [])
})

test('canvas controls and compact focus navigation follow the two layouts', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base)
  const card = page.locator('.explainer-card').first()
  await card.waitFor()
  const zoom = page.getByRole('slider', { name: 'Canvas zoom' })
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await eventually(async () => Number(await zoom.inputValue()) > 100)
  await page.locator('.zoom-percentage').dblclick()
  const input = page.getByRole('textbox', { name: 'Zoom percentage' })
  await input.fill('75'); await input.press('Enter')
  await eventually(async () => await zoom.inputValue() === '75')
  await page.locator('.zoom-percentage').dblclick()
  await input.fill('200'); await input.press('Escape')
  assert.equal(await zoom.inputValue(), '75', 'Escape cancels zoom edit')
  await zoom.focus(); await zoom.press('ArrowUp')
  await eventually(async () => await zoom.inputValue() === '76')
  await chooseTheme(page, 'Light mode')
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: '/tmp/infinity-regular-light.png' })
  await card.hover(); await card.getByRole('button', { name: 'Read card', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const trigger = dialog.getByRole('button', { name: 'Node navigation', exact: true })
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
  const exit = await dialog.getByRole('button', { name: 'Back to canvas' }).boundingBox()
  assert.ok(exit.x > 1300 && exit.y > 900, 'exit sits at bottom right')
  await trigger.click(); await dialog.locator('.wordlist').waitFor()
  await page.screenshot({ path: '/tmp/infinity-zoom-light.png' })
  await dialog.locator('h1').click()
  assert.equal(await dialog.locator('.wordlist').count(), 0, 'outside click dismisses navigation')
  await page.keyboard.press('Escape')
  await chooseTheme(page, 'Dark mode')
  await page.screenshot({ path: '/tmp/infinity-regular-dark.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/infinity-regular-mobile.png' })
  const controls = await page.locator('.canvas-controls').boundingBox()
  assert.ok(controls.x >= 0 && controls.x + controls.width <= 390 && controls.y >= 0 && controls.y + controls.height <= 844)
  await card.evaluate(el => el.focus()); await page.keyboard.press('r')
  await trigger.click()
  const panel = await dialog.locator('.wordlist').boundingBox()
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390, 'navigation fits a phone viewport')
  await page.screenshot({ path: '/tmp/infinity-zoom-mobile.png' })
  assert.deepEqual(errors, [])
})


test('add cards from canvas actions, blank-space menu and selected words, then edit and restore', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('infinity-explainer-canvas')) return
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({
      format: 'infinity-explainer-rf', viewport: { x: 0, y: 0, zoom: 1 }, edges: [],
      nodes: [{ id: 'root', type: 'explainer', position: { x: 80, y: 120 }, width: 360, height: 240,
        data: { text: 'Select **duplicate** here. Another **duplicate** there.', terms: [], userTerms: [], status: 'idle', errorMessage: '', w: 360, h: 240 } }],
    }))
  })
  await page.goto(base)
  const root = page.locator('[data-node-id="root"]')
  await root.waitFor()
  await page.waitForTimeout(600)
  // Menus dismiss with Escape and outside clicks, and create at the clicked location.
  await page.mouse.click(900, 700, { button: 'right' })
  const menu = page.getByRole('menu', { name: 'Canvas actions' })
  await menu.waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await menu.count(), 0)
  await page.mouse.click(900, 700, { button: 'right' })
  await page.mouse.click(700, 700)
  assert.equal(await menu.count(), 0)
  await page.mouse.click(900, 700, { button: 'right' })
  await menu.getByRole('menuitem', { name: '＋ Add card', exact: true }).click()
  let blank = page.locator('.explainer-card').filter({ has: page.getByRole('button', { name: 'Tap to edit', exact: true }) })
  await blank.waitFor()
  await page.waitForTimeout(600)
  const box = await blank.boundingBox()
  assert.ok(Math.abs(box.x - 900) < 2 && Math.abs(box.y - 700) < 2)
  const hintCenter = await blank.getByRole('button', { name: 'Tap to edit', exact: true }).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el)
    const rect = range.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })
  assert.ok(Math.abs(hintCenter.x - (box.x + box.width / 2)) < 2 && Math.abs(hintCenter.y - (box.y + box.height / 2)) < 2, 'hint centers in both axes')
  assert.equal(await page.locator('.hybrid-editor').count(), 0, 'creation shows the card before editing')
  await blank.getByRole('button', { name: 'Tap to edit', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Card Markdown editor' })
  await editor.pressSequentially('My **note**')
  await editor.press('Control+Enter')
  await eventually(async () => await page.locator('.hybrid-editor').count() === 0)
  assert.equal(await page.getByText('note', { exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Add card', exact: true }).click()
  await eventually(async () => await page.locator('.explainer-card').count() === 3)
  blank = page.locator('.explainer-card').filter({ has: page.getByRole('button', { name: 'Tap to edit', exact: true }) })
  await blank.getByRole('button', { name: 'Tap to edit', exact: true }).click()
  await editor.pressSequentially('Discard this')
  await editor.press('Escape')
  await blank.getByRole('button', { name: 'Tap to edit', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await page.waitForTimeout(300)
  await root.locator('.markdown-content strong').nth(1).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await page.getByRole('toolbar', { name: 'Selected text actions' }).getByRole('button', { name: '＋ Add card', exact: true }).click()
  await eventually(async () => await page.locator('.explainer-card').count() === 4)
  const mark = page.locator('.selection-mark').first()
  // Reset view to expose the source word and its connection after centering the new card.
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await mark.waitFor()
  const targetId = await mark.getAttribute('data-selection-target')
  await page.locator(`[data-node-id="${targetId}"]`).getByRole('button', { name: 'Tap to edit', exact: true }).waitFor()
  await page.waitForTimeout(600)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('infinity-explainer-canvas')))
  assert.equal(saved.edges.length, 1)
  assert.equal(saved.edges[0].source, 'root')
  assert.equal(saved.edges[0].data.selection.start, 31, 'connect the selected second occurrence')
  assert.equal(saved.nodes.find(node => node.id === targetId).data.parentId, 'root')
  assert.ok(saved.nodes.filter(node => node.data.text === '').length === 2, 'placeholder is not stored as content')
  await page.reload()
  await eventually(async () => await page.locator('.explainer-card').count() === 4)
  assert.equal(await page.getByRole('button', { name: 'Tap to edit', exact: true }).count(), 2)
  await page.locator('.selection-mark').first().waitFor()
  assert.deepEqual(errors, [])
})


test('delete cards clears connections and parent metadata, protects editors and preserves an empty canvas', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('infinity-explainer-canvas')) return
    const make = (id, parentId, x) => ({ id, type: 'explainer', position: { x, y: 120 }, width: 360, height: 240,
      data: { parentId, text: '【' + id + '】\n\nBody', terms: [], userTerms: [], status: 'idle', errorMessage: '', w: 360, h: 240 } })
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [make('root', null, 80), make('child', 'root', 520), make('leaf', 'child', 960)],
      edges: [{ id: 'root-child', source: 'root', target: 'child', sourceHandle: 's', targetHandle: 't', type: 'animatedEdge' },
        { id: 'child-leaf', source: 'child', target: 'leaf', sourceHandle: 's', targetHandle: 't', type: 'animatedEdge' }],
      viewport: { x: 0, y: 0, zoom: 1 } }))
  })
  await page.goto(base)
  const child = page.locator('[data-node-id="child"]')
  await child.waitFor()
  await page.waitForTimeout(600)
  await child.click({ position: { x: 12, y: 12 } })
  await child.getByRole('button', { name: 'Edit card', exact: true }).click()
  const editor = child.getByRole('textbox', { name: 'Card Markdown editor' })
  await editor.press('Control+End'); await editor.press('Backspace'); await editor.press('Delete')
  assert.equal(await child.count(), 1, 'text deletion must not delete the card')
  await editor.press('Escape')
  await child.press('Delete')
  await eventually(async () => await child.count() === 0)
  assert.equal(await page.locator('.canvas__edge').count(), 0, 'both incoming and outgoing edges are removed')
  await page.waitForTimeout(600)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('infinity-explainer-canvas')))
  assert.equal(saved.nodes.find(node => node.id === 'leaf').data.parentId, null)
  assert.equal(saved.edges.length, 0)
  await page.reload()
  await eventually(async () => await page.locator('.explainer-card').count() === 2)
  for (const id of ['root', 'leaf']) {
    const card = page.locator(`[data-node-id="${id}"]`)
    await card.click({ position: { x: 12, y: 12 } }); await card.press('Backspace')
    await eventually(async () => await card.count() === 0)
  }
  await page.waitForTimeout(600)
  await page.reload()
  await page.getByRole('button', { name: 'Add card', exact: true }).waitFor()
  assert.equal(await page.locator('.explainer-card').count(), 0, 'deleted last card stays deleted on reload')
  await page.getByRole('button', { name: 'Add card', exact: true }).click()
  await page.getByRole('button', { name: 'Tap to edit', exact: true }).waitFor()
  assert.deepEqual(errors, [])
})

test('D3 preserves drag and resize coordinates at every zoom, pointer focal zoom and native text selection', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  // Keep the coordinate fixture clear of the fixed touch toolbar.
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, reducedMotion: 'reduce', hasTouch: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('infinity-explainer-canvas')) return
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [{ id: 'card', type: 'explainer', position: { x: 0, y: 0 }, width: 240, height: 180,
        data: { text: '【Coordinate test】\n\nSelect these words without moving the card.\n\n' + 'Scrollable paragraph.\n\n'.repeat(20),
          terms: [], userTerms: [], status: 'idle', errorMessage: '', w: 240, h: 180 } }],
      edges: [], viewport: { x: 600, y: 410, zoom: 1 } }))
  })
  await page.goto(base)
  const card = page.locator('[data-node-id="card"]')
  await card.waitFor()
  const camera = () => page.locator('.canvas__viewport').evaluate(el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
    return { x: m.e, y: m.f, zoom: m.a }
  })
  const setZoom = async percent => {
    await page.locator('.zoom-percentage').dblclick()
    const input = page.getByRole('textbox', { name: 'Zoom percentage' })
    await input.fill(String(percent)); await input.press('Enter')
    await eventually(async () => Math.abs((await camera()).zoom - percent / 100) < .001)
  }
  const dragBy = async (x, y, dx, dy) => {
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up()
    // D3 removes its drag-click suppression on the next browser task.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
  }
  for (const percent of [25, 100, 400]) {
    await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
    await setZoom(percent)
    const zoom = percent / 100
    const before = await card.boundingBox(), viewport = await camera()
    const title = await card.locator('.card-title').boundingBox()
    await dragBy(title.x + title.width / 2, title.y + title.height / 2, 24, 16)
    const after = await card.boundingBox()
    assert.ok(Math.abs(after.x - before.x - 24) < 1, `drag x at ${percent}%`)
    assert.ok(Math.abs(after.y - before.y - 16) < 1, `drag y at ${percent}%`)
    assert.deepEqual(await camera(), viewport, 'dragging a card never pans the camera')
    await card.click({ position: { x: 2 * zoom, y: 2 * zoom } })
    const handle = card.locator('.canvas__resize-control.handle.bottom.right')
    const box = await handle.boundingBox()
    await dragBy(box.x + box.width / 2, box.y + box.height / 2, 12 * zoom, 8 * zoom)
    const resized = await card.boundingBox()
    assert.ok(Math.abs(resized.width - after.width - 12 * zoom) < 1, `resize width at ${percent}%`)
    assert.ok(Math.abs(resized.height - after.height - 8 * zoom) < 1, `resize height at ${percent}%`)
    assert.ok(Math.abs(resized.x - after.x) < 1 && Math.abs(resized.y - after.y) < 1, 'opposite corner stays anchored')
  }
  await setZoom(100)
  const beforeWheel = await camera(), focal = { x: 1200, y: 220 }
  const world = { x: (focal.x - beforeWheel.x) / beforeWheel.zoom, y: (focal.y - beforeWheel.y) / beforeWheel.zoom }
  await page.mouse.move(focal.x, focal.y); await page.mouse.wheel(0, -160)
  await eventually(async () => (await camera()).zoom > beforeWheel.zoom)
  const afterWheel = await camera()
  assert.ok(Math.abs(world.x * afterWheel.zoom + afterWheel.x - focal.x) < 1, 'wheel zoom preserves focal x')
  assert.ok(Math.abs(world.y * afterWheel.zoom + afterWheel.y - focal.y) < 1, 'wheel zoom preserves focal y')
  await setZoom(100)
  // A wheel gesture ends after its inactivity timer; finish it before starting
  // a different input modality, rather than overlapping wheel and touch.
  await eventually(async () => await page.locator('.canvas').getAttribute('data-moving') === 'false')
  const cdp = await page.context().newCDPSession(page)
  const beforePinch = await camera()
  const touch = async (type, points) => {
    await cdp.send('Input.dispatchTouchEvent', { type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 1, radiusY: 1 })) })
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  await touch('touchStart', [[1000, 160], [1200, 160]])
  await touch('touchMove', [[950, 160], [1250, 160]])
  await touch('touchEnd', [])
  await eventually(async () => (await camera()).zoom > beforePinch.zoom * 1.4)
  const pinched = await camera()
  assert.ok(Math.abs((1100 - beforePinch.x) / beforePinch.zoom * pinched.zoom + pinched.x - 1100) < 1, 'pinch preserves its center')
  await setZoom(100)
  const touchTitle = await card.locator('.card-title').boundingBox(), beforeTouch = await card.boundingBox()
  const tx = touchTitle.x + 20, ty = touchTitle.y + 10
  await touch('touchStart', [[tx, ty]])
  await touch('touchMove', [[tx + 30, ty + 20]])
  await touch('touchEnd', [])
  const afterTouch = await card.boundingBox()
  assert.ok(Math.abs(afterTouch.x - beforeTouch.x - 30) < 1 && Math.abs(afterTouch.y - beforeTouch.y - 20) < 1, 'single-finger card drag')
  // D3 suppresses emulated mouse events briefly after a touch gesture.
  await page.waitForTimeout(550)
  const paragraph = card.locator('.markdown-content p').first()
  const textBox = await paragraph.boundingBox(), beforeSelection = await card.boundingBox(), beforeScroll = await camera()
  await dragBy(textBox.x + 3, textBox.y + 7, 100, 0)
  assert.ok((await page.evaluate(() => getSelection().toString())).length > 0, 'native mouse selection still works')
  assert.deepEqual(await card.boundingBox(), beforeSelection, 'selecting text does not move the card')
  await page.mouse.move(textBox.x + 30, textBox.y + 10); await page.mouse.wheel(0, 80)
  await eventually(async () => await card.locator('.card-content').evaluate(el => el.scrollTop > 0))
  assert.deepEqual(await camera(), beforeScroll, 'scrollable card content does not zoom the canvas')
  await page.waitForTimeout(600)
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('infinity-explainer-canvas')))
  await page.reload(); await card.waitFor()
  await eventually(async () => Math.abs((await card.boundingBox()).width - persisted.nodes[0].width * persisted.viewport.zoom) < 1)
  const restored = await camera()
  assert.ok(Math.abs(restored.x - persisted.viewport.x) < .001 && Math.abs(restored.y - persisted.viewport.y) < .001 && restored.zoom === persisted.viewport.zoom, 'restored transform matches persisted viewport to subpixel precision')
  assert.equal(await page.getByText('React Flow', { exact: true }).count(), 0)
  assert.deepEqual(errors, [])
})

test('D3 preserves multi-selection, group drag, box selection, resize limits and keyboard movement', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
    nodes: ['a', 'b'].map((id, i) => ({ id, type: 'explainer', position: { x: 150 + i * 450, y: 180 }, width: 240, height: 180,
      data: { text: `【${id}】\n\nBody`, terms: [], userTerms: [], status: 'idle', errorMessage: '', w: 240, h: 180 } })),
    edges: [], viewport: { x: 0, y: 0, zoom: 1 } })))
  await page.goto(base)
  const a = page.locator('[data-node-id="a"]'), b = page.locator('[data-node-id="b"]')
  await a.waitFor()
  const dragBy = async (x, y, dx, dy) => {
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up()
    // D3 removes its drag-click suppression on the next browser task.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
  }
  await a.click({ position: { x: 12, y: 12 } })
  await page.keyboard.down('Shift'); await b.click({ position: { x: 12, y: 12 } }); await page.keyboard.up('Shift')
  assert.equal(await page.locator('.canvas__node.selected').count(), 2)
  const first = await a.boundingBox(), second = await b.boundingBox(), title = await a.locator('.card-title').boundingBox()
  await dragBy(title.x + 20, title.y + 10, 40, 30)
  assert.equal((await a.boundingBox()).x - first.x, 40)
  assert.equal((await b.boundingBox()).x - second.x, 40)
  await page.mouse.click(1100, 750)
  assert.equal(await page.locator('.canvas__node.selected').count(), 0)
  await page.keyboard.down('Shift'); await dragBy(100, 100, 950, 450); await page.keyboard.up('Shift')
  assert.equal(await page.locator('.canvas__node.selected').count(), 2, 'shift rectangle selects both full cards')
  await a.click({ position: { x: 12, y: 12 } })
  assert.equal(await page.locator('.canvas__node.selected').count(), 1)
  const before = await a.boundingBox(), handle = await a.locator('.canvas__resize-control.handle.top.left').boundingBox()
  await dragBy(handle.x + handle.width / 2, handle.y + handle.height / 2, 150, 150)
  const resized = await a.boundingBox()
  assert.equal(resized.width, 200); assert.equal(resized.height, 100)
  assert.equal(resized.x + resized.width, before.x + before.width, 'left resize anchors the right edge')
  assert.equal(resized.y + resized.height, before.y + before.height, 'top resize anchors the bottom edge')
  await a.focus(); await a.press('ArrowRight'); await a.press('Shift+ArrowDown')
  const moved = await a.boundingBox()
  assert.equal(moved.x - resized.x, 1); assert.equal(moved.y - resized.y, 4)
  const otherBeforePan = await b.boundingBox(), titleBeforePan = await a.locator('.card-title').boundingBox()
  await page.keyboard.down('Space')
  await dragBy(titleBeforePan.x + 20, titleBeforePan.y + 10, 50, 30)
  await page.keyboard.up('Space')
  const panned = await a.boundingBox(), otherPanned = await b.boundingBox()
  assert.equal(panned.x - moved.x, 50); assert.equal(otherPanned.x - otherBeforePan.x, 50, 'space-drag pans the whole canvas from a card')
  await dragBy(1100, 850, -1000, 0)
  assert.ok((await b.boundingBox()).x + (await b.boundingBox()).width < 0, 'card starts outside the visible canvas')
  await page.locator('.canvas__node[data-id="b"]').focus()
  const focused = await b.boundingBox()
  assert.ok(Math.abs(focused.x + focused.width / 2 - 720) < 1 && Math.abs(focused.y + focused.height / 2 - 500) < 1, 'keyboard focus brings an offscreen card into view')
  assert.equal(focused.width, second.width, 'focus navigation preserves zoom')
  assert.deepEqual(errors, [])
})

test('settings persist custom appearance and local LLM configuration; controls collapse and lock connections in zoom mode', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (localStorage.getItem('infinity-explainer-canvas')) return
    const make = (id, parentId, x) => ({ id, type: 'explainer', position: { x, y: 120 }, width: 360, height: 240,
      data: { text: `【${id}】\n\nConnected cards`, parentId, terms: [], userTerms: [], status: 'idle', w: 360, h: 240 } })
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [make('Root', null, 30), make('Child', 'Root', 450)],
      edges: [{ id: 'edge', source: 'Root', target: 'Child', type: 'animatedEdge' }], viewport: { x: 0, y: 0, zoom: 1 } }))
  })
  await page.goto(base)
  await page.locator('.explainer-card').first().waitFor()
  await page.getByLabel('Canvas menu', { exact: true }).click()
  await page.getByRole('button', { name: /^設定/ }).click()
  const settings = page.getByRole('dialog', { name: '設定', exact: true })
  await settings.getByRole('button', { name: 'Light mode', exact: true }).click()
  const defaults = await settings.locator('input[type=color]').evaluateAll(inputs => inputs.map(input => input.value))
  assert.equal(await settings.getByRole('button', { name: 'Light mode', exact: true }).locator('svg').count(), 1)
  assert.equal(await settings.getByRole('button', { name: 'Dark mode', exact: true }).locator('svg').count(), 1)
  const canvasHex = settings.getByRole('textbox', { name: '畫布背景顏色 HEX', exact: true })
  await canvasHex.fill('#abc')
  await canvasHex.press('Enter')
  assert.equal(await canvasHex.inputValue(), '#aabbcc')
  assert.equal(await settings.getByLabel('畫布背景顏色', { exact: true }).inputValue(), '#aabbcc')
  await canvasHex.fill('invalid')
  await canvasHex.press('Enter')
  assert.equal(await canvasHex.getAttribute('aria-invalid'), 'true')
  assert.equal(await settings.getByLabel('畫布背景顏色', { exact: true }).inputValue(), '#aabbcc')
  await canvasHex.press('Escape')
  assert.equal(await canvasHex.inputValue(), '#aabbcc')
  for (const [name, value] of [['畫布背景顏色', '#112233'], ['Card 背景顏色', '#334455'], ['文字顏色', '#ddeeff']]) {
    await settings.getByRole('textbox', { name: `${name} HEX`, exact: true }).fill(value)
    assert.equal(await settings.getByLabel(name, { exact: true }).inputValue(), value)
    await settings.getByLabel(name, { exact: true }).fill('#445566')
    assert.equal(await settings.getByRole('textbox', { name: `${name} HEX`, exact: true }).inputValue(), '#445566')
    await settings.getByLabel(name, { exact: true }).fill(value)
  }
  const providerSelect = settings.getByLabel('服務 Provider')
  assert.equal(await providerSelect.locator('option').count(), 14)
  await providerSelect.selectOption('anthropic')
  assert.equal(await settings.getByLabel('Endpoint', { exact: true }).getAttribute('placeholder'), 'https://api.anthropic.com/v1')
  await settings.getByLabel('API Key', { exact: true }).fill('test-provider-key')
  await settings.getByLabel('Endpoint', { exact: true }).fill('https://proxy.example/v1')
  await settings.getByLabel('Model', { exact: true }).fill('custom-model')
  await providerSelect.selectOption('google')
  for (const field of ['Endpoint', 'Model', 'API Key']) {
    assert.equal(await settings.getByLabel(field, { exact: true }).inputValue(), '', 'switching provider clears provider-specific values')
  }
  await providerSelect.selectOption('openai')
  await settings.getByLabel('Endpoint', { exact: true }).fill('https://example.com/v1')
  await settings.getByLabel('Model', { exact: true }).fill('test-model')
  await settings.getByRole('button', { name: '儲存', exact: true }).click()
  assert.equal(await settings.getByRole('status').innerText(), 'LLM 設定已儲存')
  await settings.getByRole('button', { name: '返回畫布', exact: true }).click()
  await page.reload()
  await page.locator('.explainer-card').first().waitFor()
  const colors = await page.evaluate(() => ({
    canvas: getComputedStyle(document.querySelector('.canvas')).backgroundColor,
    card: getComputedStyle(document.querySelector('.card-surface path')).fill,
    text: getComputedStyle(document.querySelector('.markdown-content')).color,
  }))
  assert.deepEqual(colors, { canvas: 'rgb(17, 34, 51)', card: 'rgb(51, 68, 85)', text: 'rgb(221, 238, 255)' })
  assert.equal(await page.locator('.app').evaluate(el => getComputedStyle(el, '::before').backgroundColor), colors.canvas,
    'the area behind host chrome follows the custom canvas color')
  assert.ok(await page.locator('.card-surface path').first().evaluate(el => {
    const changed = []
    const strip = rules => { for (const rule of rules) {
      if (rule.style?.getPropertyValue('d')) {
        changed.push([rule.style, rule.style.getPropertyValue('d')])
        rule.style.removeProperty('d')
      }
      if (rule.cssRules) strip(rule.cssRules)
    } }
    for (const sheet of document.styleSheets) strip(sheet.cssRules)
    try { return el.hasAttribute('d') && el.getBBox().width > 0 }
    finally { for (const [style, value] of changed) style.setProperty('d', value) }
  }),
    'native SVG geometry paints the card when CSS d is unavailable')
  await page.getByLabel('Canvas menu', { exact: true }).click()
  await page.getByRole('button', { name: /^設定/ }).click()
  assert.equal(await settings.getByLabel('Model', { exact: true }).inputValue(), 'test-model')
  const modalBounds = await settings.boundingBox()
  assert.ok(modalBounds.x > 0 && modalBounds.width < 390 && modalBounds.height < 844, 'settings appear in a modal with backdrop space')
  await settings.getByRole('button', { name: '重設畫布背景顏色', exact: true }).click()
  assert.equal(await settings.getByRole('textbox', { name: '畫布背景顏色 HEX', exact: true }).inputValue(), defaults[0])
  assert.equal(await settings.getByRole('textbox', { name: 'Card 背景顏色 HEX', exact: true }).inputValue(), '#334455', 'individual reset preserves the other colors')
  await settings.getByRole('button', { name: '重設外觀', exact: true }).click()
  await eventually(async () => JSON.stringify(await settings.locator('input[type=color]').evaluateAll(inputs => inputs.map(input => input.value))) === JSON.stringify(defaults))
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'reset keeps the chosen base theme')
  await settings.locator('h1').click()
  assert.equal(await settings.count(), 1, 'clicking modal content keeps settings open')
  await page.mouse.click(2, 2)
  assert.equal(await settings.count(), 0, 'clicking the backdrop closes settings')
  await page.getByLabel('Canvas menu', { exact: true }).click()
  await page.getByRole('button', { name: /^設定/ }).click()
  await settings.getByRole('button', { name: 'Light mode', exact: true }).click()
  await eventually(async () => JSON.stringify(await settings.locator('input[type=color]').evaluateAll(inputs => inputs.map(input => input.value))) === JSON.stringify(defaults))
  await page.keyboard.press('Escape')
  assert.equal(await settings.count(), 0)
  const toggle = page.getByRole('button', { name: 'Show connections', exact: true })
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await page.locator('.selection-connection').waitFor({ state: 'attached' })
  await toggle.click()
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.canvas__edges').evaluate(el => getComputedStyle(el).display), 'none')
  assert.equal(await page.locator('.selection-connection').count(), 1, 'visibility keeps the connection data intact')
  await page.getByRole('button', { name: 'Collapse canvas controls' }).click()
  await page.waitForTimeout(300)
  assert.equal(await page.getByRole('button', { name: 'Show connections', exact: true }).count(), 0, 'collapsed controls leave the accessibility tree')
  const bounds = await page.locator('.canvas-controls').boundingBox()
  assert.ok(bounds.height < 70 && bounds.x >= 0 && bounds.y >= 0)
  await page.getByRole('button', { name: 'Expand canvas controls' }).click()
  await toggle.click()
  await page.getByRole('button', { name: '縮放模式', exact: true }).click()
  assert.equal(await toggle.isDisabled(), true)
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.canvas__edges').evaluate(el => getComputedStyle(el).display), 'none')
  const readingZoom = page.getByRole('slider', { name: 'Canvas zoom', exact: true })
  assert.equal(await readingZoom.isEnabled(), true)
  await page.waitForTimeout(300) // Let the reading entrance reach its fitted zoom.
  const beforeZoom = Number(await readingZoom.inputValue())
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await eventually(async () => Number(await readingZoom.inputValue()) > beforeZoom)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await page.locator('.zoom-percentage').dblclick()
  const zoomInput = page.getByRole('textbox', { name: 'Zoom percentage', exact: true })
  await zoomInput.fill('90')
  await zoomInput.press('Enter')
  await eventually(async () => await readingZoom.inputValue() === '90')
  await readingZoom.focus()
  await readingZoom.press('ArrowUp')
  await eventually(async () => await readingZoom.inputValue() === '91')
  await page.mouse.move(195, 400)
  await page.mouse.wheel(0, 120)
  await page.waitForTimeout(300)
  assert.equal(await readingZoom.inputValue(), '91', 'reading scroll preserves manual zoom')
  await page.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await eventually(async () => Number(await readingZoom.inputValue()) === beforeZoom)
  assert.equal(await page.getByRole('button', { name: '退出縮放模式', exact: true }).getAttribute('aria-pressed'), 'true', 'reset zoom keeps reading mode active')
  const controlsBox = await page.locator('.canvas-controls').boundingBox()
  const minimapBox = await page.locator('.reading-minimap').boundingBox()
  assert.ok(minimapBox.y + minimapBox.height < controlsBox.y, 'reading navigation stays above zoom controls')
  await page.getByRole('button', { name: '退出縮放模式', exact: true }).click()
  assert.equal(await toggle.isDisabled(), false)
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  assert.notEqual(await page.locator('.canvas__edges').evaluate(el => getComputedStyle(el).display), 'none')
  assert.deepEqual(errors, [])
})

test('browser model generation streams through AI SDK into a connected explanation card', async t => {
  const base = await startVite(t)
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('infinity-explainer-llm-config', JSON.stringify({
      provider: 'openai-compatible', endpoint: 'https://models.example/v1', model: 'test-model', apiKey: '', maxTokens: 8192,
    }))
    localStorage.setItem('infinity-explainer-canvas', JSON.stringify({ format: 'infinity-explainer-rf',
      nodes: [{ id: 'source', type: 'explainer', position: { x: 80, y: 100 }, width: 360, height: 240,
        data: { text: '【來源】\n\n**測試原文**', terms: [], userTerms: [], status: 'idle', w: 360, h: 240 } }],
      edges: [], viewport: { x: 0, y: 0, zoom: 1 },
    }))
  })
  let requestBody
  await page.route('https://models.example/v1/chat/completions', async route => {
    requestBody = route.request().postDataJSON()
    const events = [
      { delta: { reasoning_content: '隱藏思考' }, finish_reason: null },
      { delta: { content: '瀏覽器生成成功\n---TERMS---\n["術語"]' }, finish_reason: null },
      { delta: {}, finish_reason: 'stop' },
    ]
    await route.fulfill({ contentType: 'text/event-stream', body: events.map(choice => 'data: ' + JSON.stringify({ choices: [choice] }) + '\n\n').join('') })
  })
  await page.goto(base)
  const source = page.locator('[data-node-id="source"] .markdown-content strong')
  await source.waitFor()
  await source.evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el)
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  await page.getByRole('button', { name: '↗ Explain', exact: true }).click()
  await eventually(async () => (await page.locator('.explainer-card .markdown-content').allTextContents()).some(text => text.includes('瀏覽器生成成功')))
  assert.equal(requestBody.model, 'test-model')
  assert.equal(requestBody.stream, true)
  assert.equal(requestBody.max_tokens, 8192)
  assert.doesNotMatch(await page.locator('.canvas').innerText(), /隱藏思考|---TERMS---/)
  assert.deepEqual(errors, [])
})
