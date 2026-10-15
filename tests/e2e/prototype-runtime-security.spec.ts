import { expect, test } from '@playwright/test'
import { login } from './system-helpers'

const payload = (id: string) => ({
  tagName: 'BUTTON',
  id,
  className: '',
  text: id,
  position: { x: 0, y: 0, pageX: 0, pageY: 0 },
  size: { width: 100, height: 40 },
  typography: {},
  appearance: {},
  spacing: {},
  html: '<button>Inspected</button>',
  assets: [],
})

// These scripts attempt real browser access; the test never captures the stored credential.
function runtimeHtml(nested: boolean) {
  return `<!doctype html><html><body><button id="inspect-target">Inspect ${nested ? 'nested' : 'main'}</button>
  ${nested ? '' : '<iframe title="Nested prototype" src="nested.html"></iframe>'}
  <script>
    try { localStorage.getItem('prototype-security-sentinel'); document.body.dataset.storageAccess = 'allowed'; }
    catch { document.body.dataset.storageAccess = 'blocked'; }
    try { top.document.body.dataset.prototypeAccess = 'allowed'; document.body.dataset.parentAccess = 'allowed'; }
    catch { document.body.dataset.parentAccess = 'blocked'; }
    let enabled = false;
    addEventListener('message', event => {
      if (event.source !== parent && event.source !== top) return;
      if (event.data?.type !== 'AXURE_INSPECT_MODE') return;
      enabled = event.data.enabled;
      for (const child of document.querySelectorAll('iframe')) child.contentWindow.postMessage(event.data, '*');
    });
    document.querySelector('button').addEventListener('click', () => {
      if (enabled) top.postMessage({type: 'AXURE_INSPECT_ELEMENT', payload: ${JSON.stringify(payload(nested ? 'nested-target' : 'main-target'))}}, '*');
    });
  </script></body></html>`
}

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
  await page.route('**/api/prototype-hub/**/runtime/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: runtimeHtml(route.request().url().endsWith('/nested.html')),
    }),
  )
})

test('prototype and nested pages execute scripts without access to platform storage or parent DOM', async ({
  page,
}) => {
  await login(page)
  await page.evaluate(() =>
    localStorage.setItem('prototype-security-sentinel', 'non-secret-test-value'),
  )
  await page.goto('share/open')
  const frame = page.frameLocator('.frame-stage > iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-storage-access', 'blocked')
  await expect(frame.locator('body')).toHaveAttribute('data-parent-access', 'blocked')
  const nested = frame.frameLocator('iframe')
  await expect(nested.locator('body')).toHaveAttribute('data-storage-access', 'blocked')
  await expect(nested.locator('body')).toHaveAttribute('data-parent-access', 'blocked')
  await expect(page.locator('body')).not.toHaveAttribute('data-prototype-access', 'allowed')
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-forms',
  )
  await expect(page.locator('.frame-stage > iframe')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  )
  await page.getByText('Inspect', { exact: true }).click()
  await frame.getByRole('button', { name: 'Inspect main', exact: true }).click()
  await expect(page.getByText('BUTTON#main-target', { exact: true })).toBeVisible()
  await nested.getByRole('button', { name: 'Inspect nested', exact: true }).click()
  await expect(page.getByText('BUTTON#nested-target', { exact: true })).toBeVisible()
})

test('an unrelated opaque iframe cannot forge inspector results or clear a selected element', async ({
  page,
}) => {
  await page.goto('share/open')
  await page.getByText('Inspect', { exact: true }).click()
  await page
    .frameLocator('.frame-stage > iframe')
    .getByRole('button', { name: 'Inspect main', exact: true })
    .click()
  await expect(page.getByText('BUTTON#main-target', { exact: true })).toBeVisible()
  await page.evaluate(
    (forged) =>
      new Promise<void>((resolve) => {
        const frame = document.createElement('iframe')
        frame.title = 'Unrelated untrusted frame'
        frame.sandbox.add('allow-scripts')
        let received = 0
        const observe = (event: MessageEvent) => {
          if (event.source !== frame.contentWindow) return
          received += 1
          if (received === 2) {
            window.removeEventListener('message', observe)
            resolve()
          }
        }
        window.addEventListener('message', observe)
        frame.srcdoc =
          `<script>parent.postMessage({ type: 'AXURE_INSPECT_ELEMENT', payload: ${JSON.stringify(forged)} }, '*'); parent.postMessage({type: 'AXURE_INSPECT_CLEAR'}, '*');<` +
          '/script>'
        document.body.append(frame)
      }),
    payload('forged-target'),
  )
  await expect(
    page.frameLocator('iframe[title="Unrelated untrusted frame"]').locator('body'),
  ).toBeAttached()
  await expect(page.getByText('BUTTON#main-target', { exact: true })).toBeVisible()
  await expect(page.getByText('BUTTON#forged-target', { exact: true })).toHaveCount(0)
})
