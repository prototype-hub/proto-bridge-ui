import { defineComponent, h } from 'vue'

/** Mount a composable in a real Vue scope while leaving each test in control of its dependencies. */
export function hookHarness(setup: () => unknown) {
  return defineComponent({
    setup() {
      setup()
      return () => h('div')
    },
  })
}
