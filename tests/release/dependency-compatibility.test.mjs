import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { ESLint } from 'eslint'

const require = createRequire(import.meta.url)
const eslintRequire = createRequire(require.resolve('eslint'))
const typescriptRequire = createRequire(require.resolve('typescript-eslint'))

test('fixed lint callers resolve the patched matcher and preserve their matching options', () => {
  const callers = [
    eslintRequire,
    createRequire(eslintRequire.resolve('@eslint/config-array')),
    createRequire(typescriptRequire.resolve('@typescript-eslint/typescript-estree')),
  ]
  for (const from of callers) {
    assert.equal(from('minimatch/package.json').version, '11.0.1')
    const { Minimatch, minimatch } = from('minimatch')
    assert.equal(minimatch('.config.ts', '*.ts', { dot: true }), true)
    assert.equal(
      new Minimatch('*.vue', { dot: true, matchBase: true }).match('src/Panel.vue'),
      true,
    )
    assert.equal(
      new Minimatch('src/**/*.{vue,ts}', { dot: true }).match('src/.hidden/Panel.vue'),
      true,
    )
    const include = new Minimatch('src/**/*.vue', { dot: true })
    assert.equal(include.pattern, 'src/**/*.vue')
    assert.equal(include.match('src', true), true)
    assert.equal(include.match('src/components', true), true)
    assert.equal(include.match('other', true), false)
    const options = { dot: true, allowWindowsEscape: true }
    assert.equal(new Minimatch('!**/dist/**', options).match('src/Panel.vue'), true)
    assert.equal(new Minimatch('!**/dist/**', options).match('dist/Panel.vue'), false)
    assert.equal(
      new Minimatch('!**/dist/**', { ...options, flipNegate: true }).match('dist/Panel.vue'),
      true,
    )
  }
})

test('flat ignore negation re-includes a selected file without linting its ignored sibling', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['**/generated/*', '!**/generated/keep.ts'] },
      { files: ['**/*.ts'], rules: { 'no-debugger': 'error' } },
    ],
  })
  assert.equal(await eslint.isPathIgnored('src/generated/drop.ts'), true)
  assert.equal(await eslint.isPathIgnored('src/generated/keep.ts'), false)
  const [result] = await eslint.lintText('debugger\n', { filePath: 'src/generated/keep.ts' })
  assert.equal(result.messages[0]?.ruleId, 'no-debugger')
})

test('the actual flat configuration still selects Vue and TypeScript rules and ignores outputs', async () => {
  const eslint = new ESLint()
  for (const path of ['dist/output.js', 'coverage/output.js', 'node_modules/package/index.js'])
    assert.equal(await eslint.isPathIgnored(path), true)
  assert.equal(await eslint.isPathIgnored('src/FixturePanel.vue'), false)
  for (const [filePath, code, ruleId] of [
    ['src/fixture.ts', 'const unused = 1\n', '@typescript-eslint/no-unused-vars'],
    [
      'src/FixturePanel.vue',
      '<script setup lang="ts">const unused = 1</script><template><div /></template>',
      '@typescript-eslint/no-unused-vars',
    ],
    ['src/fixture.js', 'undeclared()\n', 'no-undef'],
  ]) {
    const [result] = await eslint.lintText(code, { filePath })
    assert.equal(result.fatalErrorCount, 0)
    assert.ok(result.messages.some((message) => message.ruleId === ruleId))
  }
})

test('Vue Test Utils formats real mounted HTML through both CJS and ESM without external beautify', async () => {
  const testUtilsRoot = dirname(require.resolve('@vue/test-utils/package.json'))
  const fromTestUtils = createRequire(join(testUtilsRoot, 'package.json'))
  assert.throws(() => fromTestUtils.resolve('js-beautify'), { code: 'MODULE_NOT_FOUND' })
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'SVGElement']
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name))
  try {
    for (const name of names)
      Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
    const { defineComponent, h } = await import('vue')
    const component = defineComponent({
      render: () => h('section', [h('strong', 'fixed'), h('p', 'focus')]),
    })
    const esm = await import(
      pathToFileURL(join(testUtilsRoot, 'dist/vue-test-utils.esm-bundler.mjs'))
    )
    for (const { mount } of [fromTestUtils('@vue/test-utils'), esm]) {
      const wrapper = mount(component)
      try {
        assert.equal(
          wrapper.html({ raw: true }),
          '<section><strong>fixed</strong><p>focus</p></section>',
        )
        assert.equal(wrapper.html(), '<section><strong>fixed</strong>\n  <p>focus</p>\n</section>')
      } finally {
        wrapper.unmount()
      }
    }
  } finally {
    names.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index])
      else delete globalThis[name]
    })
    dom.window.close()
  }
})
