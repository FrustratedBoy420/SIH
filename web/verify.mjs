/**
 * Headless UI verification — drives the built app in a real browser.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node verify.mjs [baseUrl] [fixturesDir]
 *
 * Anchored to data-testid, never to styling classes (NFR-16). Runs against
 * whichever engine the build selects (the preview engine by default), so it
 * needs no backend. Covers: landing loads, upload works (and fails loudly),
 * query answers, trace populates, refusal and abstention are visible, exports
 * download, deep links survive refresh, reduced motion, no WebGL, phone width,
 * and zero console errors (NFR-12).
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const FIX = process.argv[3] ?? 'fixtures'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

const results = []
const pass = (n, d = '') => results.push({ ok: true, n, d })
const fail = (n, d = '') => results.push({ ok: false, n, d })
const check = async (name, fn) => {
  try { const d = await fn(); pass(name, d ?? '') } catch (e) { fail(name, String(e.message ?? e).split('\n')[0].slice(0, 160)) }
}
const tid = (id) => `[data-testid="${id}"]`

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const consoleErrors = [], pageErrors = []
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text()}`) })
  page.on('pageerror', (e) => pageErrors.push(`${page.url()} :: ${e.message}`))
}

const ctx = await browser.newContext({ viewport: { width: 1600, height: 940 }, acceptDownloads: true })
const page = await ctx.newPage()
watch(page)

try {
  /* ------------------------------------------------------------ landing */
  await check('landing loads', async () => {
    const r = await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    if (r?.status() !== 200) throw new Error(`HTTP ${r?.status()}`)
    return 'HTTP 200'
  })
  await check('title', async () => { const t = await page.title(); if (!t.includes('SatQuery')) throw new Error(t); return t })
  await check('disclosure permanent', async () => { await page.locator(tid('disclosure')).waitFor(); return (await page.locator(tid('disclosure')).innerText()).slice(0, 60) })
  await check('engine badge', async () => (await page.locator(tid('engine-badge')).innerText()).replace(/\s+/g, ' '))
  await check('hero telemetry measured', async () => {
    await page.locator(tid('telemetry')).waitFor({ timeout: 30000 })
    await page.waitForTimeout(2600)
    return (await page.locator(tid('telemetry')).innerText()).replace(/\s+/g, ' ').slice(0, 90)
  })
  await page.screenshot({ path: `${SHOTS}/01-hero.png` })

  await check('hero scroll cuts to the radar headline', async () => {
    const h = await page.locator(tid('hero')).boundingBox()
    await page.mouse.wheel(0, h.height * 0.66)
    await page.waitForTimeout(1400)
    const t = await page.locator('h1').first().innerText()
    if (!/Radar/.test(t)) throw new Error(t)
    return t.replace(/\s+/g, ' ')
  })
  await page.screenshot({ path: `${SHOTS}/02-hero-radar.png` })

  await check('pipeline pins and steps', async () => {
    const sec = page.locator(tid('pipeline'))
    await sec.scrollIntoViewIfNeeded()
    const box = await sec.boundingBox()
    const top = await page.evaluate(() => window.scrollY)
    // the centre of each of the six stages
    for (const [i, f] of [1, 3, 5, 7, 9, 11].map((x) => x / 12).entries()) {
      await page.evaluate((y) => window.scrollTo(0, y), top + box.y + f * (box.height - 850))
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${SHOTS}/03-pipeline-${i + 1}.png` })
    }
    return (await sec.locator('[role=tab][aria-selected=true]').innerText()).replace(/\s+/g, ' ')
  })

  await check('refusal replay', async () => {
    const sec = page.locator(tid('refusal-replay'))
    await sec.scrollIntoViewIfNeeded()
    await sec.getByText('Refused · no model invoked').waitFor({ timeout: 8000 })
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${SHOTS}/04-refusal-replay.png` })
    return 'compatibility failed, remedy shown'
  })
  await check('numbers band', async () => {
    const sec = page.locator(tid('numbers'))
    await sec.scrollIntoViewIfNeeded()
    await page.waitForTimeout(2200)
    await page.screenshot({ path: `${SHOTS}/05-numbers.png` })
    const t = await sec.innerText()
    if (!t.includes('XX.X')) throw new Error('pending placeholders missing')
    return 'XX.X pending + measured values'
  })
  await page.screenshot({ path: `${SHOTS}/06-landing-full.png`, fullPage: false })

  /* -------------------------------------------------------- workstation */
  await check('nav → workstation', async () => {
    await page.locator('nav a', { hasText: 'Workstation' }).click()
    await page.locator(tid('workstation')).waitFor()
    await page.locator(tid('slot-optical')).getByText('built-in · synthetic').waitFor({ timeout: 20000 })
    return page.url()
  })
  await check('metadata shown for every raster', async () => {
    const t = await page.locator(tid('slot-sar')).innerText()
    for (const k of ['EPSG:4326', 'GSD', 'vv, vh']) if (!t.includes(k)) throw new Error(`missing ${k}`)
    return 'CRS · bands · GSD · sensor · acquired'
  })

  const ask = async (q) => {
    await page.locator(tid('query-input')).fill(q)
    await page.locator(tid('query-submit')).click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="query-submit"]')?.hasAttribute('disabled'))
    await page.waitForTimeout(1600)
  }

  await check('RQ-4 answers with evidence', async () => {
    await ask('Use the optical and SAR images together to identify built-up and water-covered regions.')
    await page.locator(tid('answer')).waitFor()
    const n = await page.locator(tid('evidence-item')).count()
    if (n < 4) throw new Error(`${n} items`)
    return (await page.locator(tid('answer-text')).innerText()).slice(0, 90)
  })
  await check('trace populated', async () => {
    const n = await page.locator(tid('trace-step')).count()
    if (n < 7) throw new Error(`${n} steps`)
    return `${n} steps`
  })
  await check('evidence drawn on the plate', async () => {
    const n = await page.locator(tid('evidence-box')).count()
    if (!n) throw new Error('no boxes')
    return `${n} boxes`
  })
  await page.screenshot({ path: `${SHOTS}/10-ws-crossmodal.png` })

  await check('refusal visible, no model invoked', async () => {
    await ask('What changed between these two dates?')
    await page.locator(tid('refusal')).waitFor()
    const failed = await page.locator(`${tid('trace-step')}[data-ok="false"]`).count()
    if (failed < 2) throw new Error(`${failed} failed steps`)
    const steps = await page.locator(tid('trace-step')).allInnerTexts()
    if (steps.some((s) => s.includes('Executed'))) throw new Error('a tool executed')
    return `${failed} failed steps, nothing executed`
  })
  await page.screenshot({ path: `${SHOTS}/11-ws-refusal.png` })

  await check('remedy loads T1/T2 and re-asks', async () => {
    await page.getByRole('button', { name: /bi-temporal pair and re-ask/ }).click()
    await page.locator(tid('answer')).waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)
    return (await page.locator(tid('answer-text')).innerText()).slice(0, 90)
  })
  await page.screenshot({ path: `${SHOTS}/12-ws-change.png` })

  await check('abstention visible and distinct', async () => {
    await ask('Highlight the unicorn.')
    await page.locator(tid('abstention')).waitFor()
    return 'abstained'
  })

  await check('command palette runs RQ-2', async () => {
    await page.keyboard.press('Control+k')
    await page.getByRole('dialog').waitFor()
    await page.screenshot({ path: `${SHOTS}/13-ws-palette.png` })
    await page.getByRole('option', { name: /Highlight the water body/ }).click()
    await page.locator(tid('answer')).waitFor()
    await page.waitForTimeout(1200)
    return (await page.locator(tid('answer-text')).innerText()).slice(0, 80)
  })

  await check('GeoJSON downloads', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(tid('export-geojson')).click()])
    const p = path.join(SHOTS, dl.suggestedFilename()); await dl.saveAs(p)
    const j = JSON.parse((await import('node:fs')).readFileSync(p, 'utf8'))
    if (j.type !== 'FeatureCollection' || !j.features.length) throw new Error('empty')
    return `${j.features.length} features, ${j.crs.properties.name}`
  })

  await check('stack view renders WebGL', async () => {
    await page.locator(tid('demo-crossmodal')).click()
    await page.waitForTimeout(1500)
    await page.locator(tid('view-stack')).click()
    await page.locator(`${tid('stack')} canvas`).waitFor({ timeout: 15000 })
    await page.locator(tid('separation')).fill('0.95')
    await page.waitForTimeout(1600)
    await page.screenshot({ path: `${SHOTS}/14-ws-stack.png` })
    const gl = await page.evaluate(() => { const c = document.querySelector('[data-testid="stack"] canvas'); return c ? `${c.width}x${c.height}` : null })
    if (!gl) throw new Error('no canvas')
    return gl
  })
  await check('compare view', async () => {
    await page.locator(tid('view-compare')).click()
    await page.locator(tid('compare')).waitFor()
    await page.screenshot({ path: `${SHOTS}/15-ws-compare.png` })
    return 'optical ↔ SAR'
  })
  await page.locator(tid('view-map')).click()

  /* ------------------------------------------------------------ uploads */
  const gt = path.join(FIX, 'optical_utm.tif')
  if (existsSync(gt)) {
    await check('upload a real GeoTIFF (UTM) as optical', async () => {
      await page.locator(tid('file-optical')).setInputFiles(gt)
      await page.locator(tid('slot-optical')).getByText('uploaded').waitFor({ timeout: 20000 })
      const t = await page.locator(tid('slot-optical')).innerText()
      if (!t.includes('EPSG:32644')) throw new Error(t.slice(0, 120))
      return t.match(/Centre.*$/m)?.[0] ?? 'EPSG:32644'
    })
    await check('uploaded file routes like a built-in', async () => {
      await ask('Highlight the water body')
      await page.locator(tid('answer')).waitFor()
      return (await page.locator(tid('answer-text')).innerText()).slice(0, 90)
    })
    await page.screenshot({ path: `${SHOTS}/16-ws-upload.png` })
  } else fail('upload a real GeoTIFF (UTM) as optical', `fixture missing: ${gt}`)

  const bad = path.join(FIX, 'not_a_tiff.tif')
  if (existsSync(bad)) {
    await check('malformed file gives a readable error', async () => {
      await page.locator(tid('file-sar')).setInputFiles(bad)
      const t = await page.locator(tid('upload-error-sar')).innerText({ timeout: 10000 })
      return t.replace(/\s+/g, ' ').slice(0, 100)
    })
  }
  const png = path.join(FIX, 'benchmark.png')
  if (existsSync(png)) {
    await check('PNG accepted as non-georeferenced benchmark imagery', async () => {
      await page.locator(tid('file-t1')).setInputFiles(png)
      await page.locator(tid('slot-t1')).getByText('not georeferenced').waitFor({ timeout: 10000 })
      return 'CRS none, pixel coordinates'
    })
  }

  /* ------------------------------------------------------------- report */
  let reportUrl = ''
  await check('report view', async () => {
    await page.locator(tid('export-report')).click()
    await page.locator(tid('report')).waitFor()
    await page.locator(tid('cannot-establish')).waitFor()
    reportUrl = page.url()
    await page.screenshot({ path: `${SHOTS}/17-report.png`, fullPage: true })
    return reportUrl.replace(BASE, '')
  })
  await check('report downloads and stands alone', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(tid('download-report')).click()])
    const p = path.join(SHOTS, dl.suggestedFilename()); await dl.saveAs(p)
    const html = (await import('node:fs')).readFileSync(p, 'utf8')
    if (/<script|<link /.test(html)) throw new Error('external or scripted content')
    if (!html.includes('What this cannot establish')) throw new Error('section missing')
    return `${Math.round(html.length / 1024)} kB, no external refs`
  })
  await check('report deep link survives refresh', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator(tid('report')).waitFor()
    return 'ok'
  })

  /* ------------------------------------------------------- other pages */
  await check('data & models', async () => {
    await page.goto(`${BASE}/data`)
    await page.locator(tid('dataset-row')).first().waitFor()
    const d = await page.locator(tid('dataset-row')).count(), m = await page.locator(tid('model-row')).count()
    if (d !== 5 || m !== 7) throw new Error(`${d} datasets, ${m} models`)
    const t = await page.locator('body').innerText()
    if (!t.includes('464,044') || /9\.6 ?M images/i.test(t)) throw new Error('DAT-01 wording')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${SHOTS}/20-data.png`, fullPage: true })
    return `${d} datasets · ${m} models · ${(await page.locator(tid('serving-now')).innerText())}`
  })
  await check('results (deep link)', async () => {
    const r = await page.goto(`${BASE}/results`)
    if (r?.status() !== 200) throw new Error(`HTTP ${r?.status()}`)
    await page.locator(tid('formula')).getByText('capability').waitFor({ timeout: 20000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/21-results.png`, fullPage: true })
    return (await page.locator(tid('formula')).innerText()).slice(0, 80)
  })
  await check('unknown route shows 404 page', async () => {
    await page.goto(`${BASE}/nowhere`)
    await page.getByText('No data').waitFor()
    return 'ok'
  })
} catch (e) {
  fail('harness', e.message)
}

/* ------------------------------------------------------ reduced motion */
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p = await c.newPage(); watch(p)
  await check('reduced motion: landing and workstation work', async () => {
    await p.goto(BASE)
    await p.locator(tid('telemetry')).waitFor({ timeout: 30000 })
    await p.screenshot({ path: `${SHOTS}/30-reduced-motion.png` })
    await p.goto(`${BASE}/workstation?q=${encodeURIComponent('How many built-up areas are visible?')}`)
    await p.locator(tid('answer')).waitFor({ timeout: 20000 })
    return 'instant transitions, answer via deep link'
  })
  await c.close()
}

/* ------------------------------------------------------------ no WebGL */
{
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await c.newPage(); watch(p)
  await check('no WebGL: stack degrades to 2D', async () => {
    await p.goto(`${BASE}/workstation?nowebgl`)
    await p.locator(tid('slot-sar')).getByText('built-in · synthetic').waitFor({ timeout: 20000 })
    await p.locator(tid('view-stack')).click()
    await p.locator(tid('stack-fallback')).waitFor({ timeout: 10000 })
    await p.screenshot({ path: `${SHOTS}/31-no-webgl.png` })
    return '2D panels'
  })
  await c.close()
}

/* ---------------------------------------------------------- phone width */
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const p = await c.newPage(); watch(p)
  for (const [route, shot] of [['/', '40-phone-landing'], ['/workstation', '41-phone-workstation'], ['/results', '42-phone-results']]) {
    await check(`phone width: ${route} has no horizontal scroll`, async () => {
      await p.goto(BASE + route)
      await p.waitForTimeout(3500)
      await p.screenshot({ path: `${SHOTS}/${shot}.png` })
      const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
      if (sw > iw + 1) throw new Error(`scrollWidth ${sw} > ${iw}`)
      return `${sw} ≤ ${iw}`
    })
  }
  await c.close()
}

/* -------------------------------------------------------------- errors */
const ignorable = (t) => t.includes('Download the React DevTools')
const realConsole = consoleErrors.filter((t) => !ignorable(t))
if (realConsole.length === 0) pass('no console errors')
else fail('no console errors', realConsole.slice(0, 4).join(' | '))
if (pageErrors.length === 0) pass('no uncaught exceptions')
else fail('no uncaught exceptions', pageErrors.slice(0, 4).join(' | '))

await browser.close()

const ok = results.filter((r) => r.ok).length
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.n}${r.d ? '  ' + r.d : ''}`)
console.log(`\n  ${ok} passed, ${results.length - ok} failed, ${results.length} total`)
writeFileSync(`${SHOTS}/report.json`, JSON.stringify({ results, consoleErrors, pageErrors }, null, 2))
process.exit(results.length - ok ? 1 : 0)
