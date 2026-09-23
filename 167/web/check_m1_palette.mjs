// One-off browser check: upload a real photo, open the palette, confirm M1's
// questions are offered, pick one, confirm M1 answers. Run against a live
// server started with --adapters models/adapters:
//
//   node check_m1_palette.mjs http://127.0.0.1:8000 ../demo/real_vrsbench/08281_0000.png
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8000'
const PHOTO = process.argv[3] ?? '../demo/real_vrsbench/08281_0000.png'
const tid = (id) => `[data-testid="${id}"]`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
try {
  await page.goto(`${BASE}/workstation`)
  await page.locator(tid('file-optical')).setInputFiles(PHOTO)
  await page.locator(tid('slot-optical')).getByText('uploaded').waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)

  await page.keyboard.press('Control+k')
  const heading = page.getByText('M1 has answers for this image')
  await heading.waitFor({ timeout: 5000 })
  const items = await page.getByText('answered by M1 · pre-computed').count()
  console.log(`✓ palette group shown · ${items} question(s) marked answered by M1`)

  const q = 'How many bridges are visible in the image?'
  await page.getByText(q, { exact: true }).click()
  await page.locator(tid('answer')).waitFor({ timeout: 20000 })
  await page.waitForFunction(() => !document.querySelector('[data-testid="query-submit"]')?.hasAttribute('disabled'), null, { timeout: 20000 })
  await page.waitForTimeout(2500)
  const answer = (await page.locator(tid('answer-text')).innerText()).trim()
  const body = await page.locator('body').innerText()
  console.log(`✓ picked "${q}" -> ${answer}`)
  console.log(body.includes('M1 precomputed') ? '✓ trace names M1 precomputed' : '✗ trace does not mention M1')
  await page.screenshot({ path: 'shots/m1-palette.png' })
} catch (e) {
  console.log('✗', e.message.split('\n')[0])
  await page.screenshot({ path: 'shots/m1-palette-fail.png' })
} finally {
  console.log(errors.length ? `✗ page errors: ${errors.join(' | ')}` : '✓ no page errors')
  await browser.close()
}
