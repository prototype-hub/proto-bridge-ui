import { expect, test, type Locator } from '@playwright/test'
import { login } from './system-helpers'
import type { PrototypePage } from '../../src/modules/protohub-manager-ui/types'

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:5187/__test/reset')
})

test('project detail returns to the real default project menu under tools and preserves list query data', async ({
  page,
}) => {
  await page.route('**/api/menu/user-own/tree', (route) =>
    route.fulfill({
      json: {
        success: true,
        status: 200,
        result: [
          {
            id: 'proto-root',
            code: 'protohub',
            name: '原型管理',
            url: '/protohub',
            children: [
              {
                id: 'project-menu',
                code: 'protohub/Project',
                componentCode: 'protohub/Project',
                name: '原型项目',
                url: '/protohub',
                permissions: [
                  { permission: 'prototype-hub-project', actions: ['query', 'save', 'delete'] },
                  { permission: 'prototype-hub-version', actions: ['query', 'save', 'delete'] },
                  { permission: 'prototype-hub-share', actions: ['query', 'save', 'delete'] },
                ],
              },
            ],
          },
        ],
      },
    }),
  )
  await login(page)
  await expect(page).toHaveURL(/\/tools\/protohub$/)
  await page.goto('protohub/projects/p1')
  await expect(page.getByRole('heading', { name: 'Contract project', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/protohub$/)
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await page.goto('protohub?filter=Chinese%20title&page=2')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await expect(page).toHaveURL(
    /\/tools\/prototype-hub\/projects\/p1\?filter=Chinese\+title&page=2$/,
  )
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page).toHaveURL(/\/tools\/protohub\?filter=Chinese\+title&page=2$/)
  await expect(page.getByRole('heading', { name: '原型项目', exact: true })).toBeVisible()
  await expect(page.getByText('页面不存在', { exact: true })).toHaveCount(0)
})

test('version preview and public share open the first accessible menu page and retain tree interactions', async ({
  page,
}, testInfo) => {
  const pages: PrototypePage[] = [
    { name: '空目录', folder: true, children: [] },
    {
      name: '业务目录',
      folder: true,
      children: [
        {
          name: '总览',
          path: 'overview.html',
          children: [{ name: "客户's详情", path: 'child.html' }],
        },
        { name: '详情别名', path: 'child.html' },
      ],
    },
  ]
  const pageEndpoints = [
    '**/api/prototype-hub/versions/v1/revisions/r-v1/pages',
    '**/api/prototype-hub/public/shares/open/access-key/pages',
  ]
  for (const path of pageEndpoints)
    await page.route(path, (route) =>
      route.fulfill({ json: { success: true, status: 200, result: pages } }),
    )
  await login(page)
  for (const path of ['preview/p1/v1', 'share/open']) {
    const requests: { url: string; token?: string }[] = []
    const record = (request: import('@playwright/test').Request) => {
      if (request.url().includes('/api/'))
        requests.push({ url: request.url(), token: request.headers()['x-access-token'] })
    }
    page.on('request', record)
    await page.goto(path)
    const frame = page.locator('iframe')
    await expect(frame).toHaveAttribute('src', /\/overview\.html$/)
    const tree = page.locator('.workspace-nav')
    await expect(tree.locator('.tree-page')).toHaveText(['总览', "客户's详情", '详情别名'])
    await expect(tree.locator('.ant-tree-node-selected .tree-page')).toHaveText('总览')
    const folder = tree.getByRole('button', { name: '业务目录', exact: true })
    await expect(folder).toHaveAttribute('aria-expanded', 'true')
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await expect(tree.locator('.tree-page:visible')).toHaveCount(0)
    await expect(frame).toHaveAttribute('src', /\/overview\.html$/)
    await folder.click()
    await tree.getByText("客户's详情", { exact: true }).click()
    await expect(frame).toHaveAttribute('src', /\/child\.html$/)
    await tree.getByText('详情别名', { exact: true }).click()
    await expect(tree.locator('.ant-tree-node-selected .tree-page')).toHaveText('详情别名')
    await tree.getByRole('button', { name: '空目录', exact: true }).click()
    await expect(frame).toHaveAttribute('src', /\/child\.html$/)
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    const before = await frame.boundingBox()
    await page.getByRole('button', { name: '隐藏页面目录', exact: true }).click()
    await expect(tree).not.toBeVisible()
    expect((await frame.boundingBox())!.width).toBeGreaterThan(before!.width)
    await page.getByRole('button', { name: '显示页面目录', exact: true }).click()
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await expect(tree.locator('.tree-page:visible')).toHaveCount(0)
    await folder.click()
    await expect(page.locator('.workspace-nav .tree-page')).toHaveText([
      '总览',
      "客户's详情",
      '详情别名',
    ])
    await expect(frame).toHaveAttribute('src', /\/child\.html$/)
    await page.screenshot({
      path: testInfo.outputPath(
        `proto-preview-${path.startsWith('share') ? 'share' : 'version'}-tree.png`,
      ),
      animations: 'disabled',
      fullPage: true,
    })
    page.off('request', record)
    if (path.startsWith('share')) {
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every((request) => !request.token)).toBe(true)
      expect(
        requests.some((request) => /\/menu\/|\/user\/detail|\/authorize\/me/.test(request.url)),
      ).toBe(false)
    }
  }

  for (const endpoint of pageEndpoints) {
    await page.unroute(endpoint)
    await page.route(endpoint, (route) =>
      route.fulfill({ json: { success: true, status: 200, result: [] } }),
    )
  }
  for (const path of ['preview/p1/v1', 'share/open']) {
    await page.goto(path)
    await expect(page.locator('iframe')).toHaveAttribute('src', /\/index\.html$/)
    await expect(page.locator('.ant-tree-node-selected')).toHaveCount(0)
  }
})

async function expectSingleLineEllipsis(node: Locator, container: Locator) {
  await expect(node).toBeVisible()
  const bounds = await container.boundingBox()
  expect(bounds).not.toBeNull()
  const layout = await node.evaluate((element) => {
    const icon = element
      .closest('.ant-tree-node-content-wrapper')
      ?.querySelector('.ant-tree-iconEle')
    const label = element.querySelector<HTMLElement>('.ellipsis')
    if (!icon || !label) throw new Error('The tree label and its icon must be rendered')
    const iconBounds = icon.getBoundingClientRect()
    const labelBounds = label.getBoundingClientRect()
    const style = getComputedStyle(label)
    return {
      iconCenter: iconBounds.y + iconBounds.height / 2,
      labelCenter: labelBounds.y + labelBounds.height / 2,
      iconRight: iconBounds.right,
      labelLeft: labelBounds.left,
      labelRight: labelBounds.right,
      labelWidth: labelBounds.width,
      overflowing: label.scrollWidth > label.clientWidth,
      ellipsis: style.textOverflow,
      whiteSpace: style.whiteSpace,
    }
  })
  expect(Math.abs(layout.iconCenter - layout.labelCenter)).toBeLessThanOrEqual(1)
  expect(layout.labelLeft).toBeGreaterThanOrEqual(layout.iconRight - 1)
  expect(layout.labelRight).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1)
  expect(layout.labelWidth).toBeGreaterThan(20)
  expect(layout.overflowing).toBe(true)
  expect(layout.ellipsis).toBe('ellipsis')
  expect(layout.whiteSpace).toBe('nowrap')
}

test('management and anonymous preview keep long tree labels beside icons with ellipsis and full hover titles on desktop and mobile', async ({
  page,
}, testInfo) => {
  const folderTitle = '完整业务目录标题：客户管理与订单流程的原型页面集合'
  const pageTitle = '完整原型页面标题：客户资料、订单明细与业务审核状态展示'
  const childTitle = '完整子页面标题：查看客户历史订单及每一项审批记录'
  const pages: PrototypePage[] = [
    {
      name: folderTitle,
      folder: true,
      children: [
        {
          name: pageTitle,
          path: 'index.html',
          children: [{ name: childTitle, path: 'child.html' }],
        },
      ],
    },
  ]
  for (const path of [
    '**/api/prototype-hub/versions/v1/revisions/r-v1/pages',
    '**/api/prototype-hub/public/shares/open/access-key/pages',
  ])
    await page.route(path, (route) =>
      route.fulfill({ json: { success: true, status: 200, result: pages } }),
    )
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  for (const path of ['preview/p1/v1', 'share/open']) {
    await page.goto(path)
    const frame = page.locator('iframe')
    await expect(frame).toHaveAttribute('src', /\/index\.html$/)
    const tree = page.locator('.workspace-nav')
    const folder = tree.getByRole('button', { name: folderTitle, exact: true })
    const child = tree.locator('.tree-page').filter({ hasText: childTitle })
    for (const [node, title] of [
      [folder, folderTitle],
      [child, childTitle],
    ] as const) {
      await expectSingleLineEllipsis(node, tree)
      await node.locator('.ellipsis').hover()
      await expect(page.getByRole('tooltip').filter({ hasText: title })).toHaveText(title)
      await page.mouse.move(1400, 850)
    }
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await expect(child).not.toBeVisible()
    await expect(frame).toHaveAttribute('src', /\/index\.html$/)
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'true')
    await child.click()
    await expect(frame).toHaveAttribute('src', /\/child\.html$/)
    await expect(tree.locator('.ant-tree-node-selected .tree-page')).toHaveText(childTitle)
    await page.screenshot({
      path: testInfo.outputPath(
        `proto-tree-label-${path.startsWith('share') ? 'share' : 'version'}.png`,
      ),
      animations: 'disabled',
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['preview/p1/v1', 'share/open']) {
    await page.goto(path)
    const frame = page.locator('iframe')
    await expect(frame).toHaveAttribute('src', /\/index\.html$/)
    await page.getByRole('button', { name: '显示页面目录', exact: true }).click()
    const tree = page.locator('.ant-drawer-body section[role="dialog"]')
    const folder = tree.getByRole('button', { name: folderTitle, exact: true })
    const child = tree.locator('.tree-page').filter({ hasText: childTitle })
    await expect(folder).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(
        `proto-tree-label-mobile-${path.startsWith('share') ? 'share' : 'version'}.png`,
      ),
      animations: 'disabled',
      fullPage: true,
    })
    await expectSingleLineEllipsis(folder, tree)
    await expectSingleLineEllipsis(child, tree)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await folder.click()
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await expect(child).not.toBeVisible()
    await folder.click()
    await child.click()
    await expect(frame).toHaveAttribute('src', /\/child\.html$/)
    await expect(tree).not.toBeVisible()
  }
})
