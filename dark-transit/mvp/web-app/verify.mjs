/**
 * Headless checks for the workstation.
 *
 *   node verify.mjs [base-url]        default http://127.0.0.1:8000
 *
 * The front end is the one part of the system a Python self-test cannot reach,
 * and it is also where PRD UI-5 makes its strongest claim: the view holds no
 * incident knowledge of its own. That claim is checked here by reading the run
 * from the API and asserting the rendered page agrees with it — a hardcoded
 * number would survive any amount of manual clicking, and would fail this.
 *
 * Screenshots land in `shots/`, so a failure is inspectable rather than a
 * boolean.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8000'
const SHOTS = 'shots'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail })
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  ${mark}  ${name}${detail ? `  -- ${detail}` : ''}`)
  return ok
}

const num = (s) => Number(String(s).replace(/[^0-9.-]/g, ''))

async function main() {
  mkdirSync(SHOTS, { recursive: true })

  // The workstation opens on the most recent run, and that one may legitimately
  // have halted at a gate with no shortlist to render. These checks are about a
  // complete run, so find one rather than fail on a correct refusal.
  let run
  try {
    run = await (await fetch(`${BASE}/run.json`)).json()
    if (!run.attribution) {
      const ids = await (await fetch(`${BASE}/runs`)).json()
      for (const id of [...ids].reverse()) {
        const doc = await (await fetch(`${BASE}/runs/${id}/run.json`)).json()
        if (doc.attribution && !doc.halted) {
          run = doc
          break
        }
      }
    }
  } catch {
    console.error(
      `\n  Cannot reach ${BASE}. Start it with:\n` +
        `    python -m darktransit.cli run && python -m darktransit.cli serve\n`,
    )
    process.exit(2)
  }

  if (!run.attribution) {
    console.error(
      '\n  No completed run to check. Every run on disk halted at a gate.\n' +
        '  Make one with: python -m darktransit.cli run\n',
    )
    process.exit(2)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })

  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))

  // Open the run being checked by name, so a run finishing in the background
  // between the fetch above and the page load cannot swap it underneath us.
  await page.goto(`${BASE}/?run=${encodeURIComponent(run.run_id)}`, {
    waitUntil: 'networkidle',
  })
  await page.selectOption('select', run.run_id).catch(() => {})
  await page.waitForSelector('.suspect', { timeout: 20_000 })
  await page.waitForTimeout(600)

  // ---- UI-5: nothing about this incident is baked into the bundle -------- //
  const bundleSrc = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')),
  )
  const bundle = await (await fetch(new URL(bundleSrc[0], BASE))).text()
  const leader = run.attribution?.ranked?.[0]
  check(
    'UI-5  the bundle carries no vessel name from this incident',
    leader ? !bundle.includes(leader.name) : true,
    leader?.name,
  )
  check(
    'UI-5  the bundle carries no MMSI from this incident',
    leader?.mmsi ? !bundle.includes(leader.mmsi) : true,
    leader?.mmsi ?? 'none',
  )
  check(
    'UI-5  the bundle carries no scenario detection time',
    !bundle.includes(run.detection_utc),
    run.detection_utc,
  )

  // ---- the rendered ranking is the API's ranking -------------------------- //
  const rows = await page.$$eval('.suspect', (els) =>
    els.map((e) => ({
      name: e.querySelector('.vessel-name')?.textContent?.trim(),
      score: e.querySelector('.score')?.textContent?.trim(),
    })),
  )
  check(
    'UI-1  every ranked vessel from the run is rendered',
    rows.length === (run.attribution?.ranked?.length ?? 0),
    `${rows.length} rows vs ${run.attribution?.ranked?.length ?? 0} ranked`,
  )
  check(
    'UI-1  rank 1 in the view is rank 1 in the run',
    rows[0]?.name === leader?.name && Math.abs(num(rows[0]?.score) - leader.score) < 5e-4,
    `${rows[0]?.name} ${rows[0]?.score}`,
  )

  // ---- gates -------------------------------------------------------------- //
  const lamps = await page.$$eval('.lamp', (els) =>
    els.map((e) => ({ cls: e.className, title: e.getAttribute('title') })),
  )
  check('UI-4  every gate decision is shown', lamps.length === run.gates.length,
    `${lamps.length} lamps vs ${run.gates.length} gates`)
  check(
    'UI-4  a gate that halts is shown differently from one that passes',
    run.gates.every((g, i) => lamps[i].cls.includes(g.halts ? 'halt' : 'ok')),
  )
  check(
    'UI-4  each gate carries its own reason, not a generic label',
    run.gates.every((g, i) => lamps[i].title?.includes(g.name)),
  )

  // ---- the run log --------------------------------------------------------- //
  const logLines = await page.$$eval('.log > div', (els) => els.length)
  check('UI-4  the run log is rendered', logLines > 3, `${logLines} lines`)

  // ---- detection, including whether the U-Net ran -------------------------- //
  const overlay = await page.textContent('.chart-overlay')
  const seg = run.detection?.segmentation
  if (seg?.detector?.source === 'unet') {
    check(
      'DT-3  the view reports the learned segmentation that actually ran',
      overlay.includes(seg.detector.architecture) &&
        overlay.includes(String(seg.candidates_refined)),
      `${seg.candidates_refined} of ${seg.candidates_seen} refined`,
    )
  } else {
    check(
      'DT-3  the view says so when the learned path did not run',
      /not running|degraded/i.test(overlay),
    )
  }
  check(
    'DT-5  detection confidence is shown with the run, not implied',
    run.detection?.confidence == null ||
      overlay.includes(run.detection.confidence.toFixed(2)),
  )

  // ---- limitations are present and not buried ----------------------------- //
  const railText = await page.textContent('.rail')
  check(
    'RP-3  every limitation the run declares is on screen',
    run.limitations.every((l) => railText.includes(l.title)),
    `${run.limitations.length} limitations`,
  )
  check(
    'NFR-2  the view asserts a ranking, never responsibility',
    !/\b(guilty|culprit|responsible for|proves)\b/i.test(railText),
  )

  // ---- the map ------------------------------------------------------------ //
  const canvas = await page.$('.map canvas')
  check('UI-1  the chart renders a WebGL canvas', Boolean(canvas))
  const painted = await page.evaluate(() => {
    const c = document.querySelector('.map canvas')
    return c ? c.width > 100 && c.height > 100 : false
  })
  check('UI-1  the chart canvas has real dimensions', painted)

  await page.screenshot({ path: `${SHOTS}/01-overview.png` })

  // ---- the transport scrubs, and reports growing uncertainty -------------- //
  const r95At = async () =>
    num(await page.textContent('.transport-keys .num'))
  const r95Detection = await r95At()
  const scale = await page.$('.transport-scale')
  const box = await scale.boundingBox()
  await page.mouse.click(box.x + box.width * 0.08, box.y + box.height / 2)
  await page.waitForTimeout(400)
  const r95Back = await r95At()
  check(
    'UI-2  scrubbing back widens the 95 % containment radius',
    r95Back > r95Detection,
    `${r95Detection} km at detection -> ${r95Back} km rewound`,
  )
  await page.screenshot({ path: `${SHOTS}/02-rewound.png` })

  // ---- selecting a vessel opens its factor breakdown ----------------------- //
  await page.click('.suspect')
  await page.waitForTimeout(250)
  const breakdown = await page.textContent('.rail')
  check(
    'UI-3  selecting a vessel shows the factors behind its score',
    breakdown.includes('Score breakdown') &&
      Object.keys(leader.factors).every((f) =>
        breakdown.toLowerCase().includes(f.replace('_', ' ').split(' ')[0]),
      ),
  )
  await page.screenshot({ path: `${SHOTS}/03-breakdown.png` })

  // ---- weights re-rank through the API, not in the browser ----------------- //
  const before = await page.$$eval('.suspect .score', (e) => e.map((x) => x.textContent))
  const posted = []
  page.on('request', (r) => r.method() === 'POST' && posted.push(r.url()))
  // React tracks the DOM value on the node, so assigning `.value` directly is
  // swallowed. Going through the prototype setter is what a real drag does.
  await page.$eval('#w-heading', (el) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set
    setter.call(el, '0')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(900)
  const after = await page.$$eval('.suspect .score', (e) => e.map((x) => x.textContent))
  check('UI-3  a weight change posts to /rescore', posted.some((u) => u.includes('/rescore')))
  check(
    'SC-5  dropping the heading weight changes the scores',
    JSON.stringify(before) !== JSON.stringify(after),
    `${before[0]} -> ${after[0]}`,
  )
  await page.screenshot({ path: `${SHOTS}/04-heading-zeroed.png` })

  // ---- the dossier is reachable, in both forms ---------------------------- //
  const links = await page.$$eval('.link', (els) =>
    els.map((e) => ({ text: e.textContent.trim(), href: e.getAttribute('href') })),
  )
  check('RP-1  the HTML dossier is linked', links.some((l) => l.href?.endsWith('dossier.html')))
  if (run.dossier_pdf) {
    const pdfLink = links.find((l) => l.href?.endsWith('.pdf'))
    check('RP-1  the PDF dossier is linked', Boolean(pdfLink), pdfLink?.text)
    const head = await fetch(new URL(pdfLink.href, BASE))
    check(
      'RP-1  the linked PDF is served as a PDF',
      head.headers.get('content-type')?.includes('pdf'),
      head.headers.get('content-type'),
    )
  }

  // ---- responsive and reduced motion --------------------------------------- //
  await page.setViewportSize({ width: 420, height: 900 })
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  check('the layout does not scroll sideways on a phone', overflow <= 1, `${overflow}px`)
  await page.screenshot({ path: `${SHOTS}/05-narrow.png`, fullPage: false })

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  await browser.close()

  const passed = results.filter((r) => r.ok).length
  console.log(`\n  ${passed}/${results.length} checks passed`)
  writeFileSync(`${SHOTS}/verify.json`, JSON.stringify({ base: BASE, results }, null, 2))
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
