import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readingProgress } from '../src/reading/progress.ts'

test('long card with overflow has continuous forward and reverse reading coordinates', () => {
  for (let r = 0; r <= 1600; r++) {
    const p = readingProgress(r, 1400, 800, 1000)
    assert.equal(p.camera + p.scroll, r)
    assert.ok(p.camera <= 600 && p.scroll <= 1000)
    assert.equal(p.total, 1600)
  }
  assert.equal(readingProgress(600, 1400, 800, 1000).scroll, 0)
  assert.equal(readingProgress(601, 1400, 800, 1000).scroll, 1)
  assert.equal(readingProgress(-100, 1400, 800, 1000).current, 0)
  assert.equal(readingProgress(9999, 1400, 800, 1000).current, 1600)
})

test('short overflowing cards scroll internally and long non-overflowing cards only move the camera', () => {
  const short = readingProgress(200, 320, 800, 500)
  assert.equal(short.camera, 0)
  assert.equal(short.scroll, 200)
  assert.equal(short.visible, 320)
  assert.equal(short.total, 500)
  const long = readingProgress(200, 1400, 800, 0)
  assert.equal(long.camera, 200)
  assert.equal(long.scroll, 0)
  assert.equal(long.total, 600)
  const fits = readingProgress(200, 320, 800, 0)
  assert.equal(fits.total, 0)
  assert.equal(fits.current, 0)
})
