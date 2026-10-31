import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import type {
  Share,
  PublicShare,
  PrototypePage,
  ReviewContext,
  ReviewThread,
} from '../../src/modules/protohub-manager-ui/types'
const headers = { 'X-Access-Token': 'mock-admin' }
const link = (path: string, thread: ReviewThread) =>
  `${path}?${new URLSearchParams({ revisionId: thread.revisionId, pageId: thread.pageId, threadId: thread.id })}`
async function fixture(page: Page) {
  await page.request.post('/__test/reset')
  await login(page)
  const shares = (
    await (await page.request.get('/api/prototype-hub/versions/v1/shares', { headers })).json()
  ).result as Share[]
  const share = shares.find((row) => row.token === 'open')!
  await page.request.put(`/api/prototype-hub/shares/${share.id}/review`, {
    headers,
    data: {
      enabled: true,
      allowComment: true,
      allowUnverified: true,
      expectedVersion: share.configVersion,
    },
  })
  const grant = (await (await page.request.get('/api/prototype-hub/public/shares/open')).json())
    .result as PublicShare
  const pages = (await (await page.request.get(grant.pagesUrl!)).json()).result as PrototypePage[]
  const flat = (rows: PrototypePage[]): PrototypePage[] =>
    rows.flatMap((row) => [row, ...flat(row.children || [])])
  const selected = flat(pages).find((row) => !row.folder && row.pageId && row.path)!
  async function call(action: string, data: object = {}, csrf?: string) {
    const res = await page.request.post(`/api/prototype-hub/public/shares/open/review/${action}`, {
      headers: csrf ? { 'X-Review-CSRF': csrf } : {},
      data: { revisionId: grant.revisionId, accessKey: grant.accessKey, ...data },
    })
    expect(res.ok()).toBe(true)
    return (await res.json()).result
  }
  let identity = (await call('context')) as ReviewContext
  identity = await call(
    'unverified',
    {
      displayName: '陈客户 / Client Chen',
      company: 'Customer experience studio / 客户体验设计中心',
    },
    identity.csrfToken,
  )
  const thread = (await call(
    'threads',
    {
      pageId: selected.pageId,
      text: '历史反馈：请核对确认按钮的下一步操作。 / Please clarify the next action after confirming.',
      clientRequestId: crypto.randomUUID(),
    },
    identity.csrfToken,
  )) as ReviewThread
  await call('logout', {}, identity.csrfToken)
  identity = await call('context')
  const challenge = await call(
    'challenges',
    {
      email: 'target@example.invalid',
      displayName: '李访客 / Visitor Li',
      company: '产品体验团队 / Product experience team',
    },
    identity.csrfToken,
  )
  await call('verify', { challengeId: challenge.challengeId, code: '123456' }, identity.csrfToken)
  return { thread, grant }
}
for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`association scope, draft, keyboard, delegated reply and revoke: ${language} ${width}`, async ({
      page,
    }) => {
      test.setTimeout(60000)
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      const { thread } = await fixture(page)
      const text = protoLocales[language]
      await page.evaluate(
        (value) => localStorage.setItem('proto-bridge-ui:language', value),
        language === 'zh' ? 'zh-CN' : 'en',
      )
      await page.goto(link('preview/p1/v1', thread))
      let feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
      await expect(
        feedback.locator('.feedback-text').filter({ hasText: '历史反馈：' }),
      ).toBeVisible()
      const evidenceDir = process.env.PROTOTYPE_HUB_UI_EVIDENCE_DIR
      const capture = async (name: string) => {
        if (evidenceDir)
          await page.screenshot({
            path: `${evidenceDir}/after-${language}-${width}-${name}.png`,
            animations: 'disabled',
          })
      }
      await capture('member-source-thread')
      await feedback.getByRole('button', { name: text.feedbackResolve, exact: true }).click()
      await expect(feedback.getByText(text.feedbackResolved, { exact: true })).toBeVisible()
      await feedback.locator('#review-feedback-text').fill('Preserved member reply draft')
      await feedback.locator('input[type="file"]').setInputFiles({
        name: 'draft.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      })
      const entry = feedback.getByRole('button', { name: text.associationTitle, exact: true })
      await entry.focus()
      await page.keyboard.press('Enter')
      const association = page.getByRole('dialog', { name: text.associationTitle, exact: true })
      await expect(
        association.getByRole('heading', { name: text.associationTitle, exact: true }),
      ).toBeFocused()
      await expect(feedback).not.toBeVisible()
      await expect(association.getByText(thread.revisionId, { exact: true })).toBeVisible()
      await capture('association-overview')
      await association.getByRole('button', { name: text.associationCreate, exact: true }).click()
      await expect(association.getByRole('radio')).toHaveCount(1)
      await association.getByRole('radio').focus()
      await page.keyboard.press('Space')
      await association
        .getByLabel(text.associationEvidence, { exact: true })
        .fill('Offline verification: client call reference #42')
      await capture('association-create')
      await association
        .getByRole('checkbox', { name: text.associationConfirmed, exact: true })
        .focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('Tab')
      await expect(
        association.getByRole('button', {
          name: language === 'zh' ? '\u53d6\u6d88' : 'Cancel',
          exact: true,
        }),
      ).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(
        association.getByRole('button', { name: text.associationCreate, exact: true }),
      ).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(
        association.getByText(text.associationStatus_active, { exact: true }).first(),
      ).toBeVisible()
      await capture('association-active')
      await association
        .getByRole('button', { name: text.associationBackThread, exact: true })
        .click()
      await expect(entry).toBeFocused()
      await expect(feedback.locator('#review-feedback-text')).toHaveValue(
        'Preserved member reply draft',
      )
      await expect(feedback.locator('.feedback-image-draft')).toBeVisible()
      // A reload intentionally ends this internal draft; no source draft is migrated to the public actor.
      await page.goto(link('share/open', thread))
      feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
      await expect(
        feedback.getByText(text.associationHistoricalAccess, { exact: true }),
      ).toBeVisible()
      await expect(
        feedback.getByRole('button', { name: text.feedbackReopen, exact: true }),
      ).toHaveCount(0)
      await expect(feedback.locator('#review-feedback-text')).toHaveValue('')
      await feedback.locator('#review-feedback-text').fill('Reply from the verified target')
      await feedback.getByRole('button', { name: text.feedbackSubmit, exact: true }).click()
      await expect(
        feedback.locator('.feedback-text').filter({ hasText: 'Reply from the verified target' }),
      ).toBeVisible()
      await expect(
        feedback.locator('.feedback-message-meta').filter({ hasText: '李访客 / Visitor Li' }),
      ).toBeVisible()
      await capture('associated-public-reply')
      await page.goto(link('preview/p1/v1', thread))
      feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
      await feedback.getByRole('button', { name: text.associationTitle, exact: true }).click()
      await association.getByRole('button', { name: text.associationRevoke, exact: true }).click()
      await association
        .getByLabel(text.associationRevokeReason, { exact: true })
        .fill('Client requested revocation')
      await association
        .getByRole('checkbox', { name: text.associationConfirmed, exact: true })
        .check()
      await capture('association-revoke')
      await association.getByRole('button', { name: text.associationRevoke, exact: true }).click()
      await expect(
        association.getByText(text.associationStatus_revoked, { exact: true }),
      ).toBeVisible()
      await capture('association-revoked')
      await page.goto(link('share/open', thread))
      feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
      await expect(feedback.getByText(text.feedbackUnavailable, { exact: true })).toBeVisible()
      await capture('associated-access-revoked')
      expect(errors).toEqual([])
    })
  }

test('unknown create/revoke use exact request recovery, conflict is explicit, and paged target selection remains stable', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  const { thread } = await fixture(page)
  const text = protoLocales.en
  await page.evaluate(() => localStorage.setItem('proto-bridge-ui:language', 'en'))
  await page.goto(link('preview/p1/v1', thread))
  const feedback = page.getByRole('dialog', { name: text.feedback, exact: true })
  await feedback.getByRole('button', { name: text.associationTitle, exact: true }).click()
  const association = page.getByRole('dialog', { name: text.associationTitle, exact: true })
  const targetResponse = await page.request.post(
    '/api/prototype-hub/projects/p1/review-guests/_query',
    { headers, data: { verificationLevel: 'email', pageIndex: 0, pageSize: 20 } },
  )
  const target = (await targetResponse.json()).result.data[0]
  await page.route('**/api/prototype-hub/projects/p1/review-guests/_query', async (route) => {
    const input = route.request().postDataJSON()
    await route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          data:
            input.pageIndex === 0
              ? [
                  { ...target, id: 'disabled', displayName: 'Disabled visitor', enabled: false },
                  target,
                ]
              : [{ ...target, id: 'other', displayName: 'Another verified visitor' }],
          total: 21,
          pageIndex: input.pageIndex,
          pageSize: 20,
        },
      },
    })
  })
  await association.getByRole('button', { name: text.associationCreate, exact: true }).click()
  await expect(association.getByRole('radio').first()).toBeDisabled()
  await association.getByRole('radio').nth(1).focus()
  await page.keyboard.press('Space')
  await association.locator('.association-pagination .ant-pagination-next button').click()
  await expect(association.getByRole('radio')).toHaveCount(1)
  await expect(association.locator('.association-selection')).toContainText(target.displayName)
  await association
    .getByLabel(text.associationEvidence, { exact: true })
    .fill('Offline reference #99')
  await association.getByRole('checkbox', { name: text.associationConfirmed, exact: true }).check()
  let conflict = true,
    lost = true
  const requests: object[] = []
  await page.route('**/api/prototype-hub/projects/p1/review-associations', async (route) => {
    requests.push(route.request().postDataJSON())
    if (conflict) {
      conflict = false
      await route.fulfill({
        status: 409,
        json: { status: 409, success: false, message: 'Changed' },
      })
      return
    }
    const response = await route.fetch()
    if (lost) {
      lost = false
      await route.fulfill({
        status: 503,
        json: { status: 503, success: false, message: 'Lost response' },
      })
    } else await route.fulfill({ response })
  })
  await association.getByRole('button', { name: text.associationCreate, exact: true }).click()
  await expect(association.getByText(text.associationConflict, { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
  const capture = async (name: string) => {
    if (process.env.PROTOTYPE_HUB_UI_EVIDENCE_DIR)
      await page.screenshot({
        path: `${process.env.PROTOTYPE_HUB_UI_EVIDENCE_DIR}/after-en-390-${name}.png`,
        animations: 'disabled',
      })
  }
  await capture('association-conflict')
  await association.getByRole('button', { name: text.associationCreate, exact: true }).click()
  await association.getByRole('radio').nth(1).check()
  await association.getByRole('checkbox', { name: text.associationConfirmed, exact: true }).check()
  await association.getByRole('button', { name: text.associationCreate, exact: true }).click()
  await expect(association.getByText(text.associationUnknown, { exact: true })).toBeInViewport()
  await expect(
    association.getByRole('region', { name: text.associationSubmissionResult, exact: true }),
  ).toBeFocused()
  await expect(
    association.getByRole('button', { name: text.associationBackThread, exact: true }),
  ).toHaveCount(0)
  await expect(association.getByRole('button', { name: 'Back', exact: true })).toBeDisabled()
  await capture('association-create-unknown')
  await association.getByRole('button', { name: text.associationRetryExact, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(
    association.getByText(text.associationStatus_active, { exact: true }).first(),
  ).toBeVisible()
  expect(requests).toHaveLength(3)
  expect(requests[2]).toEqual(requests[1])
  expect(requests[1]).not.toEqual(requests[0])
  let revokeLost = true
  const revokes: object[] = []
  await page.route(
    '**/api/prototype-hub/projects/p1/review-associations/*/revoke',
    async (route) => {
      revokes.push(route.request().postDataJSON())
      const response = await route.fetch()
      if (revokeLost) {
        revokeLost = false
        await route.fulfill({
          status: 503,
          json: { status: 503, success: false, message: 'Lost response' },
        })
      } else await route.fulfill({ response })
    },
  )
  await association.getByRole('button', { name: text.associationRevoke, exact: true }).click()
  await association
    .getByLabel(text.associationRevokeReason, { exact: true })
    .fill('Offline revocation #99')
  await association.getByRole('checkbox', { name: text.associationConfirmed, exact: true }).check()
  await association.getByRole('button', { name: text.associationRevoke, exact: true }).click()
  await expect(association.getByText(text.associationUnknown, { exact: true })).toBeInViewport()
  await expect(
    association.getByRole('region', { name: text.associationSubmissionResult, exact: true }),
  ).toBeFocused()
  await capture('association-revoke-unknown')
  await association.getByRole('button', { name: text.associationRetryExact, exact: true }).click()
  await expect(association.getByText(text.associationStatus_revoked, { exact: true })).toBeVisible()
  expect(revokes).toHaveLength(2)
  expect(revokes[1]).toEqual(revokes[0])
})
