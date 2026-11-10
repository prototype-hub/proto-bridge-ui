import { expect, test } from '@playwright/test'
import { login } from './system-helpers'
import { fixtureAcceptedLicense } from '../fixtures/license'

test.beforeEach(async ({ request, baseURL }) => {
  await request.post(new URL('/__test/reset', baseURL).href)
})

for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390]) {
    test(`${language} ${width}: recycled project uses its existing quota when restored by keyboard`, async ({
      page,
      baseURL,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const api = new URL('/api/prototype-hub/projects', baseURL).href
      const headers = { 'x-access-token': 'mock-admin' }
      let recycledId = ''
      for (let index = 0; index < 4; index++) {
        const response = await page.request.post(api, {
          headers,
          data: { name: index === 0 ? 'Retained quota project' : `Quota project ${index}` },
        })
        expect(response.ok()).toBe(true)
        if (index === 0) recycledId = (await response.json()).result.id
      }
      expect((await page.request.delete(`${api}/${recycledId}`, { headers })).ok()).toBe(true)
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      const text = (zh: string, en: string) => (language === 'zh' ? zh : en)
      const notice = page.locator('.capacity-notice')
      await expect(notice).toContainText(text('已用 5 / 5', 'Used 5 / 5'))
      await expect(notice).toContainText(text('回收站', 'recycled projects'))
      await expect(
        notice.getByRole('button', { name: text('新建项目', 'New project'), exact: true }),
      ).toBeDisabled()
      await page.goto('prototype-hub/recycle-bin')
      const restore = page.getByRole('button', { name: text('恢复', 'Restore'), exact: true })
      await expect(restore).toBeEnabled()
      await restore.focus()
      await page.keyboard.press('Enter')
      const prompt = page.locator('.ant-popconfirm')
      await expect(prompt).toContainText(text('沿用已占用的项目名额', 'existing quota slot'))
      const confirm = prompt.getByRole('button', { name: text('确定', 'OK'), exact: true })
      await confirm.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByText('Retained quota project', { exact: true })).toHaveCount(0)
      await expect(notice).toContainText(text('已用 5 / 5', 'Used 5 / 5'))
      await page.goto('prototype-hub')
      await expect(page.getByText('Retained quota project', { exact: true })).toBeVisible()
      await expect(notice).toContainText(text('已用 5 / 5', 'Used 5 / 5'))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`restored-${language}-${width}.png`),
        fullPage: true,
      })
    })

    test(`${language} ${width}: signed uniform capacity stays distinct from actual basic capacity`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const status = fixtureAcceptedLicense('controlled-fingerprint')
      await page.route('**/api/prototype-hub/license', (route) =>
        route.fulfill({ json: { success: true, result: status } }),
      )
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      const text = (zh: string, en: string) => (language === 'zh' ? zh : en)
      await page.goto('prototype-hub/license')
      await expect(page.locator('.license-capacity dd')).toHaveText(['5', '5'])
      await page.locator('.license-record summary').focus()
      await page.keyboard.press('Enter')
      const uniform = page.locator('.license-claims > div').filter({
        has: page.getByText(
          text(
            '声明每项目版本上限（全部项目）',
            'Declared version limit per project (all projects)',
          ),
          { exact: true },
        ),
      })
      await expect(uniform.locator('dd')).toHaveText('20')
      await expect(page.locator('.license-claims')).not.toContainText('p1')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: info.outputPath(`uniform-${language}-${width}.png`),
        fullPage: true,
      })
    })
  }

for (const language of ['zh', 'en'] as const)
  for (const width of [1440, 390])
    test(`${language} ${width}: unsupported credential keeps the accepted summary without inventing verified claims`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const status = {
        ...fixtureAcceptedLicense('old-document-fingerprint'),
        status: 'unsupported',
        verifiedEntitlements: null,
      }
      await page.route('**/api/prototype-hub/license', (route) =>
        route.fulfill({ json: { success: true, result: status } }),
      )
      await login(page)
      if (language === 'en') await page.getByRole('button', { name: '语言', exact: true }).click()
      await page.goto('prototype-hub/license')
      const hint = page.locator('.license-unsupported')
      await expect(hint).toContainText(language === 'zh' ? '停服备份后切换' : 'back up and switch')
      await expect(hint).toContainText(
        language === 'zh' ? '不能绕过旧接受谱系' : 'cannot bypass the accepted lineage',
      )
      await expect(hint).toContainText(
        language === 'zh' ? '不会自动清除' : 'never reset automatically',
      )
      await expect(page.locator('.license-record')).toContainText('fixture-license')
      const summary = page.locator('.license-record summary')
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.license-claims')).toContainText('old-document-fingerprint')
      await expect(page.locator('.license-claims')).not.toContainText('20')
      await expect(page.getByRole('button', { name: /reset|重置/i })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({
        path: info.outputPath(`unsupported-${language}-${width}.png`),
        fullPage: true,
      })
    })
