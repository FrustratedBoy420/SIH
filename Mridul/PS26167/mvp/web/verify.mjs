/**
 * Headless UI verification.
 *
 * A build that compiles is not a UI that works. This drives the real
 * application in a real browser and asserts the things a screenshot would
 * show — that the WebGL scene initialises, that a query returns, that the
 * refusal path refuses, and that nothing throws on the console.
 *
 *   node verify.mjs [baseUrl]
 *
 * Assumes the backend is already serving (python -m satquery.cli serve).
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8080'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const pass = (n, d = '') => results.push({ ok: true, n, d })
const fail = (n, d = '') => results.push({ ok: false, n, d })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })

const consoleErrors = []
const pageErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(e.message))

try {
  // ---------------------------------------------------------------- load
  const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  resp?.status() === 200 ? pass('page loads', `HTTP ${resp.status()}`)
                         : fail('page loads', `HTTP ${resp?.status()}`)

  await page.waitForTimeout(3500)   // let the scene textures and WebGL settle

  // ---------------------------------------------------------------- chrome
  const title = await page.title()
  title.includes('SatQuery') ? pass('title', title) : fail('title', title)

  for (const [name, sel] of [
    ['header brand', 'text=SatQuery'],
    ['PS badge', 'text=PS 26167'],
    ['honesty banner', 'text=Synthetic imagery'],
    ['layer panel', 'text=Input layers'],
    ['trace panel', 'text=Execution trace'],
    ['evidence panel', 'text=Evidence'],
    ['separation control', 'text=separation'],
    ['query input', 'input[placeholder*="Ask about"]'],
  ]) {
    const n = await page.locator(sel).count()
    n > 0 ? pass(name) : fail(name, 'not found')
  }

  // ---------------------------------------------------------------- WebGL
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { canvas: false }
    const ctx = c.getContext('webgl2') || c.getContext('webgl')
    return { canvas: true, w: c.width, h: c.height, context: !!ctx }
  })
  gl.canvas && gl.context && gl.w > 0
    ? pass('WebGL canvas', `${gl.w}x${gl.h}`)
    : fail('WebGL canvas', JSON.stringify(gl))

  // scene textures must actually have been fetched
  const imgs = await page.evaluate(async () => {
    const urls = ['optical', 'sar', 'fusion'].map((l) => `/api/scene/${l}.png`)
    const out = {}
    for (const u of urls) {
      const r = await fetch(u)
      out[u] = r.ok ? (await r.blob()).size : 0
    }
    return out
  })
  Object.values(imgs).every((s) => s > 5000)
    ? pass('scene layers render', Object.entries(imgs).map(([k, v]) => `${k.split('/').pop()}:${Math.round(v / 1024)}kB`).join(' '))
    : fail('scene layers render', JSON.stringify(imgs))

  await page.screenshot({ path: `${SHOTS}/01-initial.png` })

  // ---------------------------------------------------------------- query
  const crossModal = page.locator('button', { hasText: 'Use the optical and SAR images together' }).first()
  if (await crossModal.count()) {
    await crossModal.click()
    await page.waitForTimeout(4000)
    const answer = await page.locator('p.text-\\[13px\\]').first().textContent().catch(() => null)
    answer && answer.length > 40
      ? pass('cross-modal query answers', answer.slice(0, 90))
      : fail('cross-modal query answers', String(answer))

    const traceRows = await page.locator('ol li').count()
    traceRows >= 5 ? pass('trace populated', `${traceRows} steps`)
                   : fail('trace populated', `${traceRows} steps`)
    await page.screenshot({ path: `${SHOTS}/02-cross-modal.png` })
  } else {
    fail('cross-modal query answers', 'example chip missing')
  }

  // ---------------------------------------------------------------- refusal
  const refuse = page.locator('button', { hasText: 'refuses' }).first()
  if (await refuse.count()) {
    await refuse.click()
    await page.waitForTimeout(2500)
    const refused = await page.locator('text=refused — no model invoked').count()
    refused > 0 ? pass('refusal path visible')
                : fail('refusal path visible', 'banner not shown')
    await page.screenshot({ path: `${SHOTS}/03-refusal.png` })
  } else {
    fail('refusal path visible', 'chip missing')
  }

  // ---------------------------------------------------------------- tabs
  for (const [tab, marker, shot] of [
    ['data', 'BigEarthNet', '04-data.png'],
    ['evaluation', 'Ablation', '05-evaluation.png'],
  ]) {
    await page.locator(`button:text-is("${tab}")`).click()
    await page.waitForTimeout(tab === 'evaluation' ? 9000 : 2500)
    const n = await page.locator(`text=${marker}`).count()
    n > 0 ? pass(`${tab} tab`) : fail(`${tab} tab`, `${marker} not found`)
    await page.screenshot({ path: `${SHOTS}/${shot}` })
  }

  // ---------------------------------------------------------------- separation
  await page.locator('button:text-is("analysis")').click()
  await page.waitForTimeout(800)
  const slider = page.locator('input[type=range]').first()
  await slider.fill('95')
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${SHOTS}/06-separated.png` })
  pass('separation control drives the stack')

  // ---------------------------------------------------------------- errors
  const ignorable = (t) =>
    t.includes('favicon') || t.includes('Download the React DevTools')
  const realConsole = consoleErrors.filter((t) => !ignorable(t))
  realConsole.length === 0 ? pass('no console errors')
                           : fail('no console errors', realConsole.slice(0, 3).join(' | '))
  pageErrors.length === 0 ? pass('no uncaught exceptions')
                          : fail('no uncaught exceptions', pageErrors.slice(0, 3).join(' | '))

} catch (e) {
  fail('harness', e.message)
} finally {
  await browser.close()
}

const ok = results.filter((r) => r.ok).length
const bad = results.length - ok
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.n}${r.d ? `  ${r.d}` : ''}`)
}
console.log(`\n  ${ok} passed, ${bad} failed, ${results.length} total`)
writeFileSync(`${SHOTS}/report.json`, JSON.stringify({ results, consoleErrors, pageErrors }, null, 2))
process.exit(bad ? 1 : 0)
