import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

// One bounded process owns both its static preview and browser; no persistent server.
const dist = resolve('dist')
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (!pathname.startsWith('/preview/')) { res.writeHead(404).end(); return }
    const file = resolve(dist, pathname.slice('/preview/'.length) || 'index.html')
    if (!file.startsWith(`${dist}/`)) { res.writeHead(403).end(); return }
    const body = await readFile(file)
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const url = `${origin}/preview/`
let browser
const report = { checks: [], widths: [], axe: {}, browserErrors: [], contrast: [] }
const checked = name => { report.checks.push(name); console.log(`PASS ${name}`) }
const addr = `0x${'1'.repeat(40)}`
const time = Date.UTC(2026, 8, 30, 12)
const event = (i, ago) => ({ transaction_hash: `0x${i.toString(16).padStart(64,'0')}`, log_index: i, from:{hash:`0x${'2'.repeat(40)}`}, to:{hash:`0x${'3'.repeat(40)}`}, total:{value:String(i * 1000000)}, timestamp:new Date(time - ago).toISOString() })
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  let expectedNetworkErrors = false
  page.on('pageerror', error => report.browserErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && !expectedNetworkErrors) report.browserErrors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400 && !expectedNetworkErrors) report.browserErrors.push(`${response.status()} ${response.url()}`) })
  await page.goto(url)
  await page.getByRole('heading', { level: 1 }).waitFor()
  checked('Production export loads with relative assets at /preview/')
  await page.keyboard.press('Tab')
  assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab')
  assert.equal(await page.locator('#token-address').evaluate(el => el === document.activeElement), true)
  await page.locator('#token-address').fill('bad address')
  await page.keyboard.press('Enter')
  assert.equal(await page.locator('#token-address').getAttribute('aria-invalid'), 'true')
  assert.equal(await page.locator('#token-address').evaluate(el => el === document.activeElement), true)
  checked('Keyboard skip, Enter submission, invalid-input focus and associated alert')
  await page.locator('.sample-button').click()
  await page.getByRole('button', { name: 'Copy address', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  checked('Copy writes the complete address to the actual browser clipboard')
  await page.locator('.method-details > summary').focus(); await page.keyboard.press('Enter')
  assert.equal(await page.locator('.method-details').getAttribute('open'), '')
  assert.match(await page.locator('.method-copy').innerText(), /28,400,000 USDC/)
  await page.keyboard.press('Enter')
  await page.locator('.amount-detail > summary').first().click()
  assert.match(await page.locator('.amount-detail[open]').innerText(), /28,400,000 USDC/)
  await page.locator('.amount-detail > summary').first().click()
  checked('Method and exact token amounts expand with native details controls')
  // Reload removes transient notices for screenshots.
  await page.reload()
  await page.mouse.click(500, 500)
  await mkdir('artifacts/screenshots', { recursive: true })
  for (const width of [1440, 900, 680, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    assert.equal(metrics.scrollWidth, metrics.clientWidth)
    report.widths.push(metrics)
    if ([1440, 900, 320].includes(width)) await page.screenshot({path:`artifacts/screenshots/${width}.png`,fullPage:true})
    if ([1440, 320].includes(width)) {
      const axe = await new AxeBuilder({page}).analyze()
      report.axe[width] = { violations: axe.violations.map(v => ({id:v.id,nodes:v.nodes.map(n=>n.target)})), incomplete: axe.incomplete.map(v=>v.id) }
      assert.deepEqual(axe.violations, [])
    }
  }
  checked('Five viewport widths, no document overflow; axe desktop and mobile')
  await page.locator('.transfer-table').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  assert.ok(await page.locator('.transfer-table').evaluate(el => el.scrollLeft) > 0)
  checked('Narrow table can be scrolled using the keyboard')
  await page.setViewportSize({width:1440,height:1000})
  await page.locator('#token-address').focus()
  await page.keyboard.press('Tab')
  await page.screenshot({path:'artifacts/screenshots/keyboard-focus.png',fullPage:true})
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
  // Fixed time and routed explorer responses make error and weather assertions reproducible.
  await page.clock.install({time})
  let mode = 'success'; let pages = 0
  await page.route('https://eth.blockscout.com/api/v2/tokens/**', async route => {
    const requestUrl = new URL(route.request().url())
    const transfer = requestUrl.pathname.endsWith('/transfers')
    if (mode === 'missing') return route.fulfill({status:404,json:{message:'Not found'}})
    if (mode === 'rate') return route.fulfill({status:429,json:{message:'Rate limited'}})
    if (!transfer) {
      if(mode === 'loading') await new Promise(resolve=>setTimeout(resolve,500))
      return route.fulfill({json:{name:'Weather Test Token',symbol:'WTT',decimals:'6',type:mode==='nft'?'ERC-721':'ERC-20'}})
    }
    if (mode === 'empty') return route.fulfill({json:{items:[],next_page_params:null}})
    pages++
    const first = !requestUrl.searchParams.has('block_number')
    const items = first ? Array.from({length:25},(_,i)=>event(i+1,10000+i*500)) : [event(30,66000),event(31,70000),event(32,130000)]
    return route.fulfill({json:{items,next_page_params:first?{block_number:1,index:1}:null}})
  })
  mode='loading'
  await page.locator('#token-address').fill(`  ${addr}  `)
  await page.locator('button[type="submit"]').click()
  assert.equal(await page.locator('button[type="submit"]').isDisabled(),true)
  assert.equal(await page.locator('.refresh-button').isDisabled(),true)
  await page.locator('.button-spinner').waitFor()
  assert.equal(await page.locator('.button-spinner').evaluate(el=>getComputedStyle(el).animationName),'none')
  await page.locator('.demo-badge').waitFor({state:'detached'})
  assert.equal(await page.locator('.weather-reading strong').innerText(),'Lightning')
  assert.equal(await page.locator('.stat-card strong').first().innerText(),'25')
  assert.match(await page.locator('.change-pill').innerText(),/\+1150%/)
  assert.equal(pages,2)
  assert.equal(await page.locator('tbody tr').count(),5)
  assert.match(await page.locator('tbody a').first().getAttribute('href'),/^https:\/\/etherscan.io\/tx\/0x/)
  checked('Loading, disabled duplicate reads, reduced motion, pagination, live data metrics and explorer links (fixture)')
  await page.locator('#token-address').fill('invalid draft')
  await page.locator('.refresh-button').click()
  await page.locator('button[type="submit"]:not(:disabled)').waitFor()
  assert.equal(await page.locator('#token-address').inputValue(),addr)
  checked('Refresh reads the displayed token even when the draft input is invalid')
  for (const scenario of ['empty','nft','missing','rate']) {
    mode=scenario; expectedNetworkErrors = ['missing','rate'].includes(mode)
    await page.locator('button[type="submit"]').click()
    if (mode==='empty') { await page.locator('.empty-row').waitFor(); assert.equal(await page.locator('.stat-card strong').first().innerText(),'0'); assert.equal(await page.locator('.weather-reading strong').innerText(),'Calm') }
    else { await page.locator('#address-error').waitFor(); assert.match(await page.locator('#address-error').innerText(), mode==='nft'?/not an indexed ERC-20/:mode==='missing'?/No indexed token/:/explorer is busy/) }
    await page.locator('button[type="submit"]:not(:disabled)').waitFor()
  }
  checked('Empty token window, non-ERC-20, missing contract and rate-limit recovery (fixtures)')
  expectedNetworkErrors=false
  await page.reload()
  await page.addInitScript(() => Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied')}}}))
  await page.reload()
  await page.locator('.copy-button').click()
  assert.match(await page.locator('.field-error').innerText(),/Select and copy/)
  checked('Denied clipboard access exposes a persistent manual-copy recovery')
  assert.deepEqual(report.browserErrors,[])
  await context.close()
  if (process.env.LIVE_CHECK === '1') {
    const liveContext=await browser.newContext();const live=await liveContext.newPage()
    await live.goto(url);await live.locator('button[type="submit"]').click()
    await live.locator('button[type="submit"]:not(:disabled)').waitFor({timeout:50000})
    report.live={error:await live.locator('#address-error').allTextContents(),sample:await live.locator('.demo-badge').count(),stats:await live.locator('.stat-card strong').allTextContents(),change:await live.locator('.change-pill').innerText(),asOf:await live.locator('.updated').innerText()}
    console.log('LIVE',JSON.stringify(report.live))
    await liveContext.close()
  }
  await writeFile('artifacts/check-results.json',JSON.stringify(report,null,2)+'\n')
} finally {
  await browser?.close()
  server.closeAllConnections()
  await new Promise(resolve=>server.close(resolve))
}
