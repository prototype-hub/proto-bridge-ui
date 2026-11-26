import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { chromium } from '@playwright/test'

const inspectorPath = process.env.PROTOTYPE_HUB_TEST_INSPECTOR_PATH
if (!inspectorPath)
  throw new Error('Set PROTOTYPE_HUB_TEST_INSPECTOR_PATH to the backend inspector.js resource')
const inspector = await readFile(inspectorPath)
const style =
  '<style>body{margin:0;padding:160px 24px 24px;font:16px system-ui;min-height:1100px}button{font:inherit;padding:12px}iframe{display:block;width:440px;height:360px;margin-top:40px;border:4px solid #aaa}</style>'
const pageHtml = (body, injected = true) =>
  `<!doctype html><meta charset="utf-8">${style}${body}${injected ? '<script src="/inspector.js"></script>' : ''}`
const documents = {
  '/runtime/test/root.html': pageHtml(
    '<button id="rootButton" data-label="Root choice">Root button</button><iframe id="childFrame" src="child.html"></iframe><iframe id="unsupportedFrame" src="no-script.html"></iframe><button id="duplicate">One</button><button id="duplicate">Two</button><iframe id="depthFrame" src="depth1.html"></iframe><iframe id="externalFrame" src="/outside.html"></iframe>',
  ),
  '/runtime/test/child.html': pageHtml(
    '<button id="childButton">Child button</button><iframe id="grandFrame" src="leaf.html"></iframe>',
  ),
  '/runtime/test/leaf.html': pageHtml('<button id="leafButton">Leaf button</button>'),
  '/runtime/test/no-script.html': pageHtml(
    '<button id="unavailableButton">No injected runtime</button>',
    false,
  ),
  '/outside.html': pageHtml('<button id="outsideButton">Outside runtime base</button>', false),
}
for (let depth = 1; depth <= 5; depth++)
  documents[`/runtime/test/depth${depth}.html`] = pageHtml(
    `<button id="depthButton${depth}">Depth ${depth}</button>${depth < 5 ? `<iframe id="depthFrame${depth}" src="depth${depth + 1}.html"></iframe>` : ''}`,
  )
let server, browser, page, origin
before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/inspector.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' })
      res.end(inspector)
      return
    }
    const html =
      req.url === '/'
        ? '<!doctype html><iframe id="root" sandbox="allow-scripts allow-forms" style="width:920px;height:740px" src="/runtime/test/root.html"></iframe><script>window.events=[];window.generation=0;window.addEventListener("message",e=>{if(e.source===window.document.querySelector("iframe").contentWindow&&e.origin==="null")events.push(e.data)})</script>'
        : documents[req.url]
    res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html || 'Missing')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
  })
})
after(async () => {
  await page?.close()
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
})
beforeEach(async () => {
  await page?.close()
  page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  await page.goto(origin)
  await root().locator('[data-review-element-surface]').waitFor({ state: 'attached' })
})
const root = () => page.frameLocator('#root')
const child = () => root().frameLocator('#childFrame')
const leaf = () => child().frameLocator('#grandFrame')
async function command(action, elementTarget) {
  await page.evaluate(
    ({ action, elementTarget }) => {
      const value = {
        type: 'PROTOTYPE_REVIEW_ELEMENT_COMMAND',
        channel: 'test_channel_0123456789',
        generation: ++window.generation,
        action,
        resourcePath: 'root.html',
        prefixLength: '/runtime/test/'.length,
        ...(elementTarget ? { elementTarget } : {}),
      }
      window.document.querySelector('#root').contentWindow.postMessage(value, '*')
    },
    { action, elementTarget },
  )
}
async function status(expected) {
  await page.waitForFunction(
    (value) =>
      window.events.at(-1)?.type === 'PROTOTYPE_REVIEW_ELEMENT_EVENT' &&
      window.events.at(-1)?.status === value,
    expected,
    { timeout: 5000 },
  )
  return page.evaluate(() => window.events.at(-1))
}
async function point(frame, id) {
  await frame.locator(`#${id}`).scrollIntoViewIfNeeded()
  const box = await frame.locator(`#${id}`).boundingBox()
  assert(box)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  return box
}
async function select(frame, id) {
  const box = await point(frame, id)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}
async function enter(frame, id) {
  await point(frame, id)
  await frame.locator('[data-review-element-controls] button').first().click()
}

test('root pointer selection, exact text identity, viewport and duplicate-ID invalidation', async () => {
  await command('capture')
  await status('capturing')
  await select(root(), 'rootButton')
  const target = (await status('captured')).elementTarget
  assert.deepEqual(target, {
    space: 'frame-element-v1',
    frames: [],
    elementId: 'rootButton',
    tagName: 'button',
    textHint: 'Root choice',
    viewportWidth: 920,
    viewportHeight: 740,
  })
  await command('locate', { ...target, frames: [] })
  await status('located')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.style.opacity = '0'))
  await status('unavailable')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.style.opacity = '1'))
  await command('locate', target)
  await status('located')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.parentElement.style.opacity = '0'))
  await status('unavailable')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.parentElement.style.opacity = '1'))
  await command('locate', target)
  await status('located')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.dataset.label = 'Changed'))
  await status('unavailable')
  await command('locate', target)
  await status('unavailable')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.dataset.label = 'Root choice'))
  await command('locate', { ...target, viewportWidth: 919 })
  await status('unavailable')
  await command('locate', { ...target, elementId: 'duplicate', textHint: 'One' })
  await status('unavailable')
})

test('keyboard explicitly descends two frames and locates each local document', async () => {
  await command('capture')
  await status('capturing')
  const surface = root().locator('[data-review-element-surface]')
  await surface.press('ArrowRight')
  await surface.press('Tab')
  await page.keyboard.press('Enter')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  const childSurface = child().locator('[data-review-element-surface]')
  await childSurface.press('ArrowRight')
  await childSurface.press('Tab')
  await page.keyboard.press('Enter')
  await leaf().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await leaf().locator('[data-review-element-surface]').press('Enter')
  const target = (await status('captured')).elementTarget
  assert.deepEqual(target.frames, [
    { elementId: 'childFrame', resourcePath: 'child.html' },
    { elementId: 'grandFrame', resourcePath: 'leaf.html' },
  ])
  assert.equal(target.elementId, 'leafButton')
  await command('locate', target)
  await status('located')
  for (const frame of [root(), child(), leaf()])
    assert.equal(await frame.locator('[data-review-element-marker]').isVisible(), true)
  await leaf()
    .locator('#leafButton')
    .evaluate((el) => (el.style.display = 'none'))
  await status('unavailable')
  for (const frame of [root(), child(), leaf()])
    await frame.locator('[data-review-element-surface]').waitFor({ state: 'hidden' })
})

test('noninjected child times out to explicit outer-frame selection and cancellation retains no live descendant', async () => {
  await command('capture')
  await status('capturing')
  await enter(root(), 'unsupportedFrame')
  await root().getByText('Cannot enter this frame.', { exact: false }).waitFor()
  await root().locator('[data-review-element-surface]').press('Enter')
  const target = (await status('captured')).elementTarget
  assert.equal(target.elementId, 'unsupportedFrame')
  assert.deepEqual(target.frames, [])
  await command('capture')
  await status('capturing')
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await child().locator('[data-review-element-surface]').press('Escape')
  await status('cancelled')
  for (const frame of [root(), child()])
    await frame.locator('[data-review-element-surface]').waitFor({ state: 'hidden' })
})

test('only the current direct child and valid generation/payload may finish a capture', async () => {
  await command('capture')
  await status('capturing')
  await child()
    .locator('body')
    .evaluate(() => {
      window.commands = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'PROTOTYPE_REVIEW_ELEMENT_RELAY_COMMAND')
          window.commands.push(event.data)
      })
    })
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  const frame = page.frames().find((entry) => entry.url().endsWith('/child.html'))
  const relay = await frame.evaluate(() => window.commands.at(-1))
  const target = {
    space: 'frame-element-v1',
    frames: [],
    elementId: 'childButton',
    tagName: 'button',
    textHint: 'Child button',
    viewportWidth: 440,
    viewportHeight: 360,
  }
  const payload = {
    type: 'PROTOTYPE_REVIEW_ELEMENT_RELAY_EVENT',
    channel: relay.channel,
    generation: relay.generation,
    status: 'captured',
    elementTarget: target,
  }
  const sibling = page.frames().find((entry) => entry.url().endsWith('/no-script.html'))
  await sibling.evaluate((value) => window.parent.postMessage(value, '*'), payload)
  await frame.evaluate(
    (value) => window.parent.postMessage({ ...value, generation: value.generation - 1 }, '*'),
    payload,
  )
  await frame.evaluate(
    (value) =>
      window.parent.postMessage(
        { ...value, elementTarget: { ...value.elementTarget, html: '<script>unsafe</script>' } },
        '*',
      ),
    payload,
  )
  await page.waitForTimeout(200)
  assert.equal((await page.evaluate(() => window.events.at(-1))).status, 'capturing')
  await select(child(), 'childButton')
  await status('captured')
})

test('clear retires nested windows, rejects late responses, and internal query navigation invalidates locate', async () => {
  await command('capture')
  await status('capturing')
  await child()
    .locator('body')
    .evaluate(() => {
      window.commands = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'PROTOTYPE_REVIEW_ELEMENT_RELAY_COMMAND')
          window.commands.push(event.data)
      })
    })
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await enter(child(), 'grandFrame')
  await leaf().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  const childWindow = page.frames().find((entry) => entry.url().endsWith('/child.html')),
    previous = await childWindow.evaluate(() => window.commands.at(-1))
  await command('clear')
  await status('ready')
  for (const frame of [root(), child(), leaf()])
    await frame.locator('[data-review-element-surface]').waitFor({ state: 'hidden' })
  await childWindow.evaluate(
    (value) =>
      window.parent.postMessage(
        {
          type: 'PROTOTYPE_REVIEW_ELEMENT_RELAY_EVENT',
          channel: value.channel,
          generation: value.generation,
          status: 'cancelled',
        },
        '*',
      ),
    previous,
  )
  await page.waitForTimeout(200)
  assert.equal((await page.evaluate(() => window.events.at(-1))).status, 'ready')
  await command('capture')
  await status('capturing')
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await select(child(), 'childButton')
  const target = (await status('captured')).elementTarget
  await command('locate', target)
  await status('located')
  await child()
    .locator('body')
    .evaluate(() => window.history.pushState({}, '', '?changed'))
  await status('unavailable')
})

test('four descents are supported and a fifth or an external child remains an explicit outer-element choice', async () => {
  await command('capture')
  await status('capturing')
  await enter(root(), 'depthFrame')
  let frame = root().frameLocator('#depthFrame')
  for (let depth = 1; depth < 4; depth++) {
    await frame.locator('[data-review-element-surface]').waitFor({ state: 'visible' })
    await enter(frame, `depthFrame${depth}`)
    frame = frame.frameLocator(`#depthFrame${depth}`)
  }
  await frame.locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await point(frame, 'depthFrame4')
  assert.equal(
    await frame.locator('[data-review-element-controls] button').first().isDisabled(),
    true,
  )
  await select(frame, 'depthButton4')
  const target = (await status('captured')).elementTarget
  assert.equal(target.frames.length, 4)
  await command('locate', target)
  await status('located')
  await command('capture')
  await status('capturing')
  await point(root(), 'externalFrame')
  assert.equal(
    await root().locator('[data-review-element-controls] button').first().isDisabled(),
    true,
  )
  await root().locator('[data-review-element-surface]').press('Enter')
  const outer = (await status('captured')).elementTarget
  assert.equal(outer.elementId, 'externalFrame')
  assert.equal(outer.frames.length, 0)
})

test('a retired root channel cannot replace a newer capture even with a greater generation', async () => {
  await command('capture')
  await status('capturing')
  await page.evaluate(() =>
    window.document.querySelector('#root').contentWindow.postMessage(
      {
        type: 'PROTOTYPE_REVIEW_ELEMENT_COMMAND',
        channel: 'new_channel_0123456789',
        generation: 1,
        action: 'capture',
        resourcePath: 'root.html',
        prefixLength: '/runtime/test/'.length,
      },
      '*',
    ),
  )
  await page.waitForFunction(() => window.events.at(-1)?.channel === 'new_channel_0123456789')
  await command('capture')
  await page.waitForTimeout(200)
  await select(root(), 'rootButton')
  assert.equal((await status('captured')).channel, 'new_channel_0123456789')
})

test('a retired child channel cannot take over a newer explicit descent', async () => {
  await command('capture')
  await status('capturing')
  await child()
    .locator('body')
    .evaluate(() => {
      window.commands = []
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'PROTOTYPE_REVIEW_ELEMENT_RELAY_COMMAND')
          window.commands.push(event.data)
      })
    })
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  const childWindow = page.frames().find((entry) => entry.url().endsWith('/child.html')),
    old = await childWindow.evaluate(() => window.commands.at(-1))
  await child().locator('[data-review-element-surface]').press('Escape')
  await status('cancelled')
  await command('capture')
  await status('capturing')
  await enter(root(), 'childFrame')
  await child().locator('[data-review-element-surface]').waitFor({ state: 'visible' })
  await root()
    .locator('body')
    .evaluate(
      (value) =>
        window.document
          .querySelector('#childFrame')
          .contentWindow.postMessage({ ...value, generation: 999 }, '*'),
      old,
    )
  await page.waitForTimeout(200)
  await select(child(), 'childButton')
  assert.equal((await status('captured')).elementTarget.elementId, 'childButton')
})

test('hint capture preserves valid Unicode at the 160-unit boundary and accepts DEL consistently', async () => {
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.dataset.label = 'x'.repeat(159) + '😀'))
  await command('capture')
  await status('capturing')
  await select(root(), 'rootButton')
  const first = (await status('captured')).elementTarget
  assert.equal(first.textHint, 'x'.repeat(159))
  await command('locate', first)
  await status('located')
  await root()
    .locator('#rootButton')
    .evaluate((el) => (el.dataset.label = 'Emoji 😀\u007f'))
  await command('capture')
  await status('capturing')
  await select(root(), 'rootButton')
  const second = (await status('captured')).elementTarget
  assert.equal(second.textHint, 'Emoji 😀\u007f')
  await command('locate', second)
  await status('located')
})

test('idle element cleanup does not invalidate the independent existing F14 selection', async () => {
  await page.evaluate(() => {
    const frame = window.document.querySelector('#root').contentWindow
    frame.postMessage({ type: 'AXURE_INSPECT_MODE', enabled: true }, '*')
    frame.postMessage(
      {
        type: 'PROTOTYPE_INSPECT_TOOL_COMMAND',
        channel: 'test_tool_channel_0123456789',
        generation: 1,
        action: 'pick',
        slot: 'A',
        resourcePath: 'root.html',
        prefixLength: '/runtime/test/'.length,
      },
      '*',
    )
  })
  await root().locator('[data-inspect-tool-surface]').waitFor({ state: 'visible' })
  await select(root(), 'rootButton')
  await page.waitForFunction(() =>
    window.events.some(
      (event) => event.type === 'PROTOTYPE_INSPECT_TOOL_EVENT' && event.status === 'selected',
    ),
  )
  await command('clear')
  await page.waitForTimeout(250)
  assert.equal(
    await page.evaluate(
      () =>
        window.events.filter(
          (event) => event.type === 'PROTOTYPE_INSPECT_TOOL_EVENT' && event.status === 'stale',
        ).length,
    ),
    0,
  )
})
