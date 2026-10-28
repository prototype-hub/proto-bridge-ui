import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type { PrototypePage, Share } from '../../src/modules/protohub-manager-ui/types'

const origin = 'http://127.0.0.1:5187'
const headers = { 'X-Access-Token': 'mock-admin' }

async function enable(page: Page, request: APIRequestContext, locale: 'zh' | 'en') {
  await login(page)
  const response = await request.get(`${origin}/api/prototype-hub/versions/v1/shares`, { headers })
  const share = (await response.json()).result.find((row: Share) => row.token === 'open') as Share
  const changed = await request.put(`${origin}/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: {
      enabled: true,
      allowUnverified: true,
      allowComment: true,
      expectedVersion: share.configVersion,
    },
  })
  expect(changed.ok()).toBe(true)
  await page.evaluate(
    (language) => localStorage.setItem('proto-bridge-ui:language', language),
    locale,
  )
  await page.setViewportSize({ width: 390, height: 844 })
}

test.beforeEach(async ({ request }) => {
  await request.post(`${origin}/__test/reset`)
})

for (const locale of ['zh', 'en'] as const) {
  test(`${locale} 390px long share context keeps every toolbar action visible and keyboard operable`, async ({
    page,
    request,
  }, testInfo) => {
    await enable(page, request, locale)
    const text = protoLocales[locale]
    const title = 'Long project / 多层级企业服务原型 — Customer experience and operations'
    const version = 'Release candidate / 评审版本 2026.10.28'
    await page.route('**/api/prototype-hub/public/shares/open', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.result.projectName = title
      body.result.versionName = version
      await route.fulfill({ response, json: body })
    })
    await page.route('**/api/prototype-hub/public/shares/open/**/pages', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      function rename(items: PrototypePage[]) {
        for (const item of items) {
          item.name = `Long page / 多层级页面 ${item.name}`
          if (item.children) rename(item.children)
        }
      }
      rename(body.result)
      await route.fulfill({ response, json: body })
    })
    await page.goto('share/open')
    const header = page.locator('.workspace-header')
    await expect(header.locator('strong')).toHaveText(title)
    await expect(header.locator('.workspace-name > .muted')).toHaveText(version)
    await expect(header.locator('.workspace-current')).toContainText('Long page / 多层级页面')
    for (const name of [
      text.feedback,
      text.feedbackOverview,
      text.reviewIdentity,
      text.copyPageLink,
    ])
      await expect(header.getByRole('button', { name, exact: true })).toBeVisible()
    const boxes = await header.locator('button, .ant-radio-button-wrapper').evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect()
        return { left: box.left, right: box.right, width: box.width }
      }),
    )
    expect(boxes.length).toBeGreaterThan(5)
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(390)
      expect(box.width).toBeGreaterThan(0)
    }
    expect(await header.evaluate((item) => item.scrollWidth)).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({
      path: testInfo.outputPath('long-context-mobile.png'),
      animations: 'disabled',
    })
    await header.getByRole('button', { name: text.showPages, exact: true }).focus()
    await page.keyboard.press('Enter')
    const directory = page.getByRole('dialog', { name: text.pages, exact: true })
    await expect(directory).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(directory).toBeHidden()
    const inspect = header.getByRole('radio', { name: text.inspect, exact: true })
    await inspect.focus()
    await page.keyboard.press('Space')
    await expect(inspect).toBeChecked()
    await header.getByRole('button', { name: text.details, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.ant-drawer-title').filter({ hasText: text.details })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.ant-drawer-title').filter({ hasText: text.details })).toBeHidden()
  })

  test(`${locale} staged email verification supports keyboard editing and returns the untouched feedback draft`, async ({
    page,
    request,
  }, testInfo) => {
    await enable(page, request, locale)
    const text = protoLocales[locale]
    const submitted: string[] = []
    page.on('request', (outgoing) => {
      if (outgoing.method() === 'POST' && /\/review\/threads$/.test(outgoing.url()))
        submitted.push(outgoing.postData() || '')
    })
    await page.goto('share/open')
    await page.getByRole('button', { name: text.feedback, exact: true }).click()
    const feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
    const draft = '保留草稿 / Keep this exact draft <b>as plain text</b>'
    await feedback.locator('textarea#review-feedback-text').fill(draft)
    await feedback.getByRole('button', { name: text.reviewIdentity, exact: true }).click()
    const identity = page.getByRole('dialog', { name: text.reviewIdentity, exact: true })
    const help = identity.locator('details')
    await help.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(help).toHaveAttribute('open', '')
    await page.keyboard.press('Space')
    await expect(help).not.toHaveAttribute('open', '')
    const email = identity.getByLabel(text.reviewEmail, { exact: true })
    await email.fill('visitor@example.invalid')
    await identity.getByLabel(text.reviewName, { exact: true }).fill('Visitor')
    await identity.getByLabel(text.reviewCompany, { exact: true }).fill('Example studio')
    const firstSending = page.waitForResponse((response) =>
      response.url().endsWith('/review/challenges'),
    )
    await identity.getByRole('button', { name: text.reviewSendCode, exact: true }).focus()
    await page.keyboard.press('Enter')
    const firstChallenge = (await (await firstSending).json()).result.challengeId
    const code = identity.getByLabel(text.reviewCode, { exact: true })
    await expect(code).toBeFocused()
    await expect(email).toHaveCount(0)
    await expect(
      identity.getByRole('button', { name: text.reviewSendCode, exact: true }),
    ).toBeDisabled()
    await code.fill('111111')
    await identity.getByRole('button', { name: text.reviewEditProfile, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(email).toBeFocused()
    await expect(email).toHaveValue('visitor@example.invalid')
    await expect(identity.getByLabel(text.reviewName, { exact: true })).toHaveValue('Visitor')
    await expect(identity.getByLabel(text.reviewCompany, { exact: true })).toHaveValue(
      'Example studio',
    )
    await expect(code).toHaveCount(0)
    await email.fill('changed@example.invalid')
    const secondSending = page.waitForResponse((response) =>
      response.url().endsWith('/review/challenges'),
    )
    await identity.getByRole('button', { name: text.reviewSendCode, exact: true }).click()
    const secondResponse = await secondSending
    expect(secondResponse.request().postDataJSON().email).toBe('changed@example.invalid')
    const secondChallenge = (await secondResponse.json()).result.challengeId
    expect(secondChallenge).not.toBe(firstChallenge)
    await expect(code).toBeFocused()
    await expect(code).toHaveValue('')
    await code.fill('123456')
    const verifying = page.waitForResponse((response) => response.url().endsWith('/review/verify'))
    await page.keyboard.press('Enter')
    expect((await verifying).request().postDataJSON().challengeId).toBe(secondChallenge)
    await expect(identity.getByText(text.reviewEmailVerified, { exact: true })).toBeVisible()
    await expect(identity.locator('.identity-summary')).toContainText('c***@example.invalid')
    await page.screenshot({
      path: testInfo.outputPath('verified-draft-return-mobile.png'),
      animations: 'disabled',
    })
    await identity.getByRole('button', { name: text.feedbackReturn, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(feedback.locator('textarea#review-feedback-text')).toHaveValue(draft)
    expect(submitted).toHaveLength(0)
    const writing = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/review\/threads$/.test(response.url()),
    )
    await feedback.getByRole('button', { name: text.feedbackSubmit, exact: true }).click()
    expect((await writing).ok()).toBe(true)
    await expect(feedback.locator('.feedback-text').filter({ hasText: draft })).toBeVisible()
    await expect(feedback.locator('.feedback-text b')).toHaveCount(0)
  })
}
