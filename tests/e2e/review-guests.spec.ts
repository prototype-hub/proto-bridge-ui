import { expect, test, type Page } from '@playwright/test'
import { login } from './system-helpers'
import { protoLocales } from '../../src/modules/protohub-manager-ui/locales'
import { ownerProjectAccess } from '../fixtures/project-access'
import type { ReviewGuest } from '../../src/modules/protohub-manager-ui/types'

const endpoint = '**/api/prototype-hub/projects/p1/review-guests/**'
const makeGuest = (number: number): ReviewGuest => ({
  id: `g${number}`,
  displayName: `Visitor ${number}`,
  company: 'Self declared company',
  maskedEmail: `v${number}***@example.invalid`,
  verificationLevel: 'email',
  enabled: true,
  configVersion: 3,
  createTime: 1,
  modifyTime: 2,
})
async function management(page: Page) {
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await page.getByRole('button', { name: protoLocales.zh.reviewGuests, exact: true }).click()
  return page.getByRole('dialog', { name: protoLocales.zh.reviewGuests, exact: true })
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('masked visitor management paginates, confirms CAS transitions and refreshes a conflict without retrying', async ({
  page,
}) => {
  const records = Array.from({ length: 21 }, (_, index) => makeGuest(index + 1))
  const updates: unknown[] = []
  const pages: unknown[] = []
  let conflict = true
  await page.route(endpoint, async (route) => {
    const request = route.request()
    const data = request.postDataJSON()
    if (request.method() === 'POST') {
      pages.push(data)
      await route.fulfill({
        json: {
          success: true,
          status: 200,
          result: {
            data: records.slice(
              data.pageIndex * data.pageSize,
              (data.pageIndex + 1) * data.pageSize,
            ),
            total: records.length,
            pageIndex: data.pageIndex,
            pageSize: data.pageSize,
          },
        },
      })
    } else {
      updates.push(data)
      const record = records[20]!
      if (conflict) {
        conflict = false
        record.configVersion++
        await route.fulfill({
          status: 409,
          json: { success: false, status: 409, message: 'Concurrent update' },
        })
      } else {
        record.enabled = data.enabled
        record.configVersion++
        await route.fulfill({ json: { success: true, status: 200, result: record } })
      }
    }
  })
  const drawer = await management(page)
  await expect(drawer.getByText('Visitor 1', { exact: true })).toBeVisible()
  await expect(drawer.getByText('v1***@example.invalid', { exact: true })).toBeVisible()
  await expect(drawer.getByText(protoLocales.zh.reviewGuestsHint, { exact: true })).toBeVisible()
  await drawer.locator('.ant-pagination-next button').click()
  await expect(drawer.getByText('Visitor 21', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Visitor 1', { exact: true })).toHaveCount(0)
  expect(pages).toEqual([
    { pageIndex: 0, pageSize: 20 },
    { pageIndex: 1, pageSize: 20 },
  ])
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewGuestDisable, exact: true })
    .click()
  await expect(
    page.getByText(protoLocales.zh.reviewGuestDisableConfirm, { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewGuestConflict, { exact: true })).toBeVisible()
  expect(updates).toEqual([{ enabled: false, expectedVersion: 3 }])
  await drawer
    .getByRole('button', { name: protoLocales.zh.reviewGuestDisable, exact: true })
    .click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewGuestDisabled, { exact: true })).toBeVisible()
  expect(updates).toEqual([
    { enabled: false, expectedVersion: 3 },
    { enabled: false, expectedVersion: 4 },
  ])
  await drawer.getByRole('button', { name: protoLocales.zh.reviewGuestEnable, exact: true }).click()
  await expect(
    page.getByText(protoLocales.zh.reviewGuestEnableConfirm, { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByText(protoLocales.zh.reviewGuestEnabled, { exact: true })).toBeVisible()
  expect(updates).toHaveLength(3)
})

test('viewer scope hides visitor management and never queries it despite global action grants', async ({
  page,
}) => {
  const calls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/review-guests/')) calls.push(request.url())
  })
  await page.route('**/api/prototype-hub/projects/p1', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: {
          id: 'p1',
          name: 'Viewer project',
          createdBy: 'u1',
          createdAt: 1,
          updatedAt: 1,
          ...ownerProjectAccess,
          role: 'viewer',
          capabilities: {
            read: true,
            edit: false,
            manageMembers: false,
            deleteProject: false,
            manageShares: false,
          },
        },
      },
    }),
  )
  await login(page)
  await page.goto('prototype-hub/projects/p1')
  await expect(page.getByRole('heading', { name: 'Viewer project', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: protoLocales.zh.reviewGuests, exact: true }),
  ).toHaveCount(0)
  expect(calls).toEqual([])
})

test('390px visitor drawer stays inside the viewport and supports Chinese and English keyboard confirmation', async ({
  page,
}, testInfo) => {
  let record = makeGuest(1)
  await page.route(endpoint, (route) => {
    const request = route.request()
    if (request.method() === 'PUT')
      record = {
        ...record,
        enabled: request.postDataJSON().enabled,
        configVersion: record.configVersion + 1,
      }
    return route.fulfill({
      json: {
        success: true,
        status: 200,
        result:
          request.method() === 'POST'
            ? { data: [record], total: 1, pageIndex: 0, pageSize: 20 }
            : record,
      },
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  const drawer = await management(page)
  await expect(drawer.getByText('Visitor 1', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const disable = drawer.getByRole('button', {
    name: protoLocales.zh.reviewGuestDisable,
    exact: true,
  })
  await disable.focus()
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('button', { name: '确定', exact: true })
  await confirm.focus()
  await page.keyboard.press('Enter')
  await expect(drawer.getByText(protoLocales.zh.reviewGuestDisabled, { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('review-guests-mobile-zh.png'),
    animations: 'disabled',
    fullPage: true,
  })
  await drawer.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: protoLocales.en.reviewGuests, exact: true }).click()
  const english = page.getByRole('dialog', { name: protoLocales.en.reviewGuests, exact: true })
  await expect(english.getByText(protoLocales.en.reviewGuestsHint, { exact: true })).toBeVisible()
  const enable = english.getByRole('button', {
    name: protoLocales.en.reviewGuestEnable,
    exact: true,
  })
  await enable.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText(protoLocales.en.reviewGuestEnableConfirm, { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('review-guests-mobile-en.png'),
    animations: 'disabled',
    fullPage: true,
  })
})
