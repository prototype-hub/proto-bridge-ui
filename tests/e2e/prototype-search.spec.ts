import { expect, test, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { login } from './system-helpers'
import { searchLocales } from '../../src/modules/protohub-manager-ui/locales/search'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
const pageId = 'f126e4a336099551aa49a5663fda84afda25351b8ebbc5850176f99dc702d281'
const admin = { 'X-Access-Token': 'mock-admin' }
async function seed(request: APIRequestContext, base: string) {
  const copy = `${base}/api/prototype-hub/versions/v1/revisions/r-v1/pages/${pageId}/copy-inventory`
  expect(
    (
      await request.post(`${copy}/_extract`, {
        headers: admin,
        data: { clientRequestId: randomUUID() },
      })
    ).ok(),
  ).toBe(true)
  for (let index = 0; index < 22; index++)
    expect(
      (
        await request.post(`${copy}/entries`, {
          headers: admin,
          data: {
            text: `Privacy copy ${index + 1} <script>literal</script>`,
            businessTerm: 'Privacy',
            note: 'Collected by author',
            requirementUrl: '',
            clientRequestId: randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true)
  expect(
    (
      await request.post(
        `${base}/api/prototype-hub/versions/v1/revisions/r-v1/materials/prototype-source`,
        {
          headers: admin,
          data: {
            sourceName: 'Privacy portal design',
            sourceUrl: 'https://example.invalid/not-searched',
            clientRequestId: randomUUID(),
          },
        },
      )
    ).ok(),
  ).toBe(true)
  const share = (
    await (
      await request.get(`${base}/api/prototype-hub/versions/v1/shares`, { headers: admin })
    ).json()
  ).result.find((row: { token: string }) => row.token === 'open')
  expect(
    (
      await request.put(`${base}/api/prototype-hub/shares/${share.id}/review`, {
        headers: admin,
        data: {
          enabled: true,
          allowComment: true,
          allowUnverified: true,
          expectedVersion: share.configVersion,
        },
      })
    ).ok(),
  ).toBe(true)
  const grant = (await (await request.get(`${base}/api/prototype-hub/public/shares/open`)).json())
    .result
  const call = async (action: string, data: object = {}, csrf?: string) => {
    const response = await request.post(
      `${base}/api/prototype-hub/public/shares/open/review/${action}`,
      {
        headers: csrf ? { 'X-Review-CSRF': csrf } : {},
        data: { revisionId: grant.revisionId, accessKey: grant.accessKey, ...data },
      },
    )
    expect(response.ok()).toBe(true)
    return (await response.json()).result
  }
  let identity = await call('context')
  const challenge = await call(
    'challenges',
    { email: 'search@example.invalid', displayName: 'Search reviewer' },
    identity.csrfToken,
  )
  identity = await call(
    'verify',
    { challengeId: challenge.challengeId, code: '123456' },
    identity.csrfToken,
  )
  await call(
    'threads',
    { pageId, text: 'Privacy question from reviewer', clientRequestId: randomUUID() },
    identity.csrfToken,
  )
}
test.beforeEach(async ({ request }) => {
  await request.post('/__test/reset')
})
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`F20 content search and three fixed sources ${language} ${width}`, async ({
      page,
      request,
    }, info) => {
      test.setTimeout(60000)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await login(page)
      const base = new URL(page.url()).origin
      await seed(request, base)
      await page.evaluate(
        (value) => localStorage.setItem('proto-bridge-ui:language', value),
        language,
      )
      await page.goto('prototype-hub')
      const labels = searchLocales[language],
        proto = protoLocales[language]
      await page.getByRole('link', { name: labels.searchEntry, exact: true }).click()
      await expect(
        page.getByRole('heading', { name: labels.searchTitle, exact: true }),
      ).toBeVisible()
      await expect(page.getByText(labels.searchStart, { exact: true })).toBeVisible()
      const keyword = page.getByLabel(labels.searchKeyword, { exact: true })
      await keyword.fill('Privacy')
      await keyword.press('Enter')
      await expect(page.locator('.search-result-list > li')).toHaveCount(20)
      await expect(page.locator('mark').first()).toHaveText('Privacy')
      const revisionDetails = page.locator('.search-revision-id').first()
      await revisionDetails.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(revisionDetails.locator('span')).toHaveText('r-v1')
      await page.keyboard.press('Enter')
      expect(page.url()).not.toContain('Privacy')
      expect(
        await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
      ).not.toContain('Privacy')
      await page.screenshot({ path: info.outputPath('search-copy.png'), animations: 'disabled' })
      const pagination = page.locator('.search-pagination')
      await pagination.locator('.ant-pagination-item-2').click()
      await expect(page.locator('.search-result-list > li')).toHaveCount(2)
      await expect(page.locator('#prototype-search-results')).toBeFocused()
      const openSource = async (selector: string) => {
        const action = page.locator('.search-result-actions a').first()
        await action.focus()
        const popupPromise = page.waitForEvent('popup')
        await page.keyboard.press('Enter')
        const popup = await popupPromise
        await popup.setViewportSize(page.viewportSize()!)
        expect(popup.viewportSize()).toEqual(page.viewportSize())
        await expect(popup.locator(selector)).toBeVisible()
        expect(new URL(popup.url()).searchParams.get('revisionId')).toBe('r-v1')
        await popup.screenshot({
          path: info.outputPath(
            `source-${selector.includes('materials') ? 'materials' : selector.includes('copy') ? 'copy' : 'feedback'}.png`,
          ),
          animations: 'disabled',
        })
        expect(await popup.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false,
        )
        await popup.close()
        await expect(keyword).toHaveValue('Privacy')
      }
      await openSource('.copy-inventory-drawer')
      await page.getByRole('link', { name: labels.searchScopeProject, exact: true }).first().click()
      await expect(page.locator('.search-scope strong')).toHaveText(labels.searchProjectScope)
      const scopeDetails = page.locator('.search-scope-identity')
      await scopeDetails.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(scopeDetails.locator('dd')).toHaveText('p1')
      await page.screenshot({ path: info.outputPath('search-scope.png'), animations: 'disabled' })
      await page.getByRole('link', { name: labels.searchClearScope, exact: true }).click()
      await expect(page.locator('.search-scope strong')).toHaveText(labels.searchAllScope)
      await page.getByText(labels.searchMATERIAL, { exact: true }).click()
      await expect(page.locator('.search-result-list > li')).toHaveCount(1)
      await page.screenshot({
        path: info.outputPath('search-materials.png'),
        animations: 'disabled',
      })
      await openSource('.revision-materials')
      await page.getByText(labels.searchFEEDBACK, { exact: true }).click()
      await expect(page.locator('.search-result-list > li')).toHaveCount(1)
      await page.screenshot({
        path: info.outputPath('search-feedback.png'),
        animations: 'disabled',
      })
      const popupPromise = page.waitForEvent('popup')
      await page.locator('.search-result-actions a').first().click()
      const feedback = await popupPromise
      await feedback.setViewportSize(page.viewportSize()!)
      expect(feedback.viewportSize()).toEqual(page.viewportSize())
      await expect(
        feedback.getByRole('dialog', { name: proto.feedback, exact: true }),
      ).toBeVisible()
      await expect(
        feedback
          .locator('.feedback-text')
          .getByText('Privacy question from reviewer', { exact: true }),
      ).toBeVisible()
      const replyDraft = feedback.locator('.feedback-composer textarea')
      await replyDraft.fill('Unsubmitted search-source reply')
      await feedback.keyboard.press('Escape')
      const feedbackTrigger = feedback.getByRole('button', { name: proto.feedback, exact: true })
      await expect(feedbackTrigger).toBeFocused()
      await feedbackTrigger.press('Enter')
      await expect(replyDraft).toHaveValue('Unsubmitted search-source reply')
      await replyDraft.fill('')
      await feedback.locator('.ant-drawer:visible .ant-drawer-close').click()
      await expect(feedbackTrigger).toBeFocused()
      await feedback.close()
      await keyword.fill('No matches')
      await keyword.press('Enter')
      await expect(page.getByText(labels.searchNoMatches, { exact: true })).toBeVisible()
      await keyword.fill(' ')
      await keyword.press('Enter')
      await expect(page.getByText(labels.searchInvalidKeyword, { exact: true })).toBeVisible()
      await expect(keyword).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      )
      await page.goto(`preview/p1/v1?revisionId=r-v1`)
      await page.frameLocator('iframe').locator('#u1').waitFor()
      await page.getByRole('button', { name: proto.pageResources, exact: true }).click()
      const revisionSearch = page.getByRole('link', {
        name: labels.searchThisRevision,
        exact: true,
      })
      expect(await revisionSearch.getAttribute('href')).toContain('revisionId=r-v1')
    })
  }
test('F20 visible server recovery, invalid scopes and controlled source markers', async ({
  page,
}) => {
  await login(page)
  await page.goto('prototype-hub/search?projectId=bad%2Fscope')
  await expect(page.getByText(searchLocales.zh.searchInvalidScope, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: searchLocales.zh.searchClearScope, exact: true }).click()
  let failed = true
  await page.route('**/api/prototype-hub/search/_query', (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { status: 503, message: 'Search temporarily unavailable' },
        })
      : route.continue(),
  )
  await page.getByLabel('关键词', { exact: true }).fill('retry')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await expect(page.getByText(searchLocales.zh.searchFailed, { exact: true })).toBeVisible()
  failed = false
  await page.getByRole('button', { name: searchLocales.zh.searchRetry, exact: true }).click()
  await expect(page.getByText(searchLocales.zh.searchNoMatches, { exact: true })).toBeVisible()
  await page.goto('preview/p1/v1?revisionId=r-v1&tool=copy')
  await expect(page.getByText(searchLocales.zh.searchInvalidTarget, { exact: true })).toBeVisible()
  await expect(page.locator('.copy-inventory-drawer')).toHaveCount(0)
})
