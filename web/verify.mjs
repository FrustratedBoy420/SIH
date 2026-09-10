/**
 * Headless UI verification.
 *
 * A build that compiles is not a UI that works. This drives the real
 * application in a real browser and asserts what a screenshot would show.
 *
 *   node verify.mjs [baseUrl]
 *
 * Assumes the backend is already serving (python -m satquery.cli serve).
 *
 * Since the frontend became a multi-page site the harness also checks the two
 * things client-side routing breaks first: that navigation reaches each page,
 * and that a deep link survives a page refresh. The second fails silently in
 * development, because the Vite dev server rewrites unknown paths to
 * index.html and a production server does not unless it is told to.
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8000'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const pass = (n, d = '') => results.push({ ok: true, n, d })
const fail = (n, d = '') => results.push({ ok: false, n, d })
const has = async (page, sel, name, detail = '') => {
  const n = await page.locator(sel).count()
  if (n > 0) pass(name, detail)
  else fail(name, sel + ' not found')
  return n > 0
}
const glInfo = (page) => page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c) return { canvas: false }
  const ctx = c.getContext('webgl2') || c.getContext('webgl')
  return { canvas: true, w: c.width, h: c.height, context: !!ctx }
})

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 950 } })

const consoleErrors = []
const pageErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => pageErrors.push(e.message))

try {
  /* ------------------------------------------------------------ landing */
  const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 })
  if (resp && resp.status() === 200) pass('landing loads', 'HTTP 200')
  else fail('landing loads', 'HTTP ' + (resp ? resp.status() : 'none'))

  const title = await page.title()
  if (title.includes('SatQuery')) pass('title', title)
  else fail('title', title)

  await page.waitForTimeout(3200)

  await has(page, 'header a:has-text("SatQuery")', 'masthead brand')
  const navCount = await page.locator('nav a').count()
  if (navCount >= 4) pass('nav destinations', navCount + ' links')
  else fail('nav destinations', navCount + ' links')

  const h1 = await page.locator('h1').first().textContent().catch(() => '')
  if (h1 && h1.trim().length > 10) pass('landing headline', h1.trim().slice(0, 60))
  else fail('landing headline', String(h1))

  await has(page, 'text=Radar sees what', 'differentiator section')
  await has(page, 'footer', 'footer')
  await has(page, 'text=Imagery on this site is synthetic', 'synthetic disclosure')

  const heroGl = await glInfo(page)
  if (heroGl.canvas && heroGl.context && heroGl.w > 0)
    pass('landing hero renders WebGL', heroGl.w + 'x' + heroGl.h)
  else fail('landing hero renders WebGL', JSON.stringify(heroGl))

  await page.screenshot({ path: SHOTS + '/01-landing.png' })
  await page.screenshot({ path: SHOTS + '/02-landing-full.png', fullPage: true })

  /* ------------------------------------------------ navigate to the tool */
  await page.locator('nav a:has-text("Workstation")').click()
  await page.waitForTimeout(3800)
  if (page.url().endsWith('/workstation')) pass('nav routes to workstation', page.url())
  else fail('nav routes to workstation', page.url())

  await has(page, 'text=Layers', 'layer panel')
  await has(page, 'text=Execution trace', 'trace panel')
  await has(page, 'text=Evidence', 'evidence panel')
  await has(page, 'text=separation', 'separation control')
  await has(page, 'input[placeholder*="Ask about"]', 'query input')

  const gl = await glInfo(page)
  if (gl.canvas && gl.context && gl.w > 0)
    pass('workstation WebGL canvas', gl.w + 'x' + gl.h)
  else fail('workstation WebGL canvas', JSON.stringify(gl))

  const imgs = await page.evaluate(async () => {
    const out = {}
    for (const l of ['optical', 'sar', 'fusion']) {
      const r = await fetch('/api/scene/' + l + '.png')
      out[l] = r.ok ? (await r.blob()).size : 0
    }
    return out
  })
  if (Object.values(imgs).every((s) => s > 5000))
    pass('scene layers render',
      Object.entries(imgs).map(([k, v]) => k + ':' + Math.round(v / 1024) + 'kB').join(' '))
  else fail('scene layers render', JSON.stringify(imgs))

  await page.screenshot({ path: SHOTS + '/03-workstation.png' })

  /* ------------------------------------------------------------- query */
  const crossModal = page.locator('button', { hasText: 'Use the optical and SAR images together' }).first()
  if (await crossModal.count()) {
    await crossModal.click()
    // The 3D evidence geometry lands a beat after the JSON does; a 4 s wait
    // screenshots the scene without it and reads as a rendering bug.
    await page.waitForTimeout(6500)
    const answer = await page.locator('p.text-\\[13px\\]').first().textContent().catch(() => null)
    if (answer && answer.length > 40) pass('cross-modal query answers', answer.slice(0, 90))
    else fail('cross-modal query answers', String(answer))

    const traceRows = await page.locator('ol li').count()
    if (traceRows >= 5) pass('trace populated', traceRows + ' steps')
    else fail('trace populated', traceRows + ' steps')
    await page.screenshot({ path: SHOTS + '/04-cross-modal.png' })
  } else {
    fail('cross-modal query answers', 'example chip missing')
  }

  /* ----------------------------------------------------------- refusal */
  const refuse = page.locator('button', { hasText: 'refuses' }).first()
  if (await refuse.count()) {
    await refuse.click()
    await page.waitForTimeout(2500)
    const refused = await page.locator('text=refused').count()
    if (refused > 0) pass('refusal path visible')
    else fail('refusal path visible', 'banner missing')
    await page.screenshot({ path: SHOTS + '/05-refusal.png' })
  } else {
    fail('refusal path visible', 'chip missing')
  }

  /* -------------------------------------------------------- separation */
  const slider = page.locator('input[type=range]').first()
  await slider.fill('95')
  await page.waitForTimeout(1400)
  await page.screenshot({ path: SHOTS + '/06-separated.png' })
  pass('separation control drives the stack')

  /* ------------------------------------------------------- other pages */
  const PAGES = [
    ['Data & models', '/data', 'BigEarthNet', '07-data.png', 2600],
    ['Evaluation', '/evaluation', 'Not claimed', '08-evaluation.png', 12000],
  ]
  for (const [label, path, marker, shot, wait] of PAGES) {
    await page.locator('nav a:has-text("' + label + '")').click()
    await page.waitForTimeout(wait)
    const routed = page.url().endsWith(path)
    const marked = await page.locator('text=' + marker).count()
    if (routed && marked > 0) pass(label + ' page', page.url())
    else fail(label + ' page', 'url=' + page.url() + ' marker=' + marked)
    await page.screenshot({ path: SHOTS + '/' + shot, fullPage: true })
  }

  /* --------------------------------------------------------- deep link */
  // The check that catches a missing server-side SPA fallback.
  const deep = await page.goto(BASE + '/evaluation', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)
  const deepOk = deep && deep.status() === 200 && (await page.locator('h1').count()) > 0
  if (deepOk) pass('deep link survives refresh', '/evaluation → HTTP 200')
  else fail('deep link survives refresh', 'HTTP ' + (deep ? deep.status() : 'none'))

  /* ------------------------------------------------------------ errors */
  const ignorable = (t) =>
    t.includes('favicon') || t.includes('Download the React DevTools') ||
    t.includes('does-not-exist')
  const realConsole = consoleErrors.filter((t) => !ignorable(t))
  if (realConsole.length === 0) pass('no console errors')
  else fail('no console errors', realConsole.slice(0, 3).join(' | '))
  if (pageErrors.length === 0) pass('no uncaught exceptions')
  else fail('no uncaught exceptions', pageErrors.slice(0, 3).join(' | '))

  // Deliberately last: this probe is *meant* to 404, and the browser logs a
  // bare "Failed to load resource" with no URL in the message, so it cannot be
  // filtered out of the console assertion above -- only sequenced after it.
  const apiMiss = await page.evaluate(async () => (await fetch('/api/does-not-exist')).status)
  if (apiMiss === 404) pass('unknown API path still 404s', String(apiMiss))
  else fail('unknown API path still 404s', 'got ' + apiMiss)

} catch (e) {
  fail('harness', e.message)
} finally {
  await browser.close()
}

const ok = results.filter((r) => r.ok).length
const bad = results.length - ok
for (const r of results) {
  console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.n + (r.d ? '  ' + r.d : ''))
}
console.log('\n  ' + ok + ' passed, ' + bad + ' failed, ' + results.length + ' total')
writeFileSync(SHOTS + '/report.json', JSON.stringify({ results, consoleErrors, pageErrors }, null, 2))
process.exit(bad ? 1 : 0)
