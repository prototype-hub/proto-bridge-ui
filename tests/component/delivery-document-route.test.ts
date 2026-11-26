import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import DeliveryDocumentWorkspace from '@/modules/protohub-manager-ui/components/DeliveryDocumentWorkspace.vue'
import { i18n } from '@/shared/i18n'
import { protoLocales } from '@/modules/protohub-manager-ui/locales'
import type { Project, Revision, WorkspaceContext } from '@/modules/protohub-manager-ui/types'
const captured = vi.hoisted(() => ({
  update: undefined as (() => Promise<boolean>) | undefined,
  confirm: undefined as { onOk: () => void; onCancel: () => void } | undefined,
  state: undefined as unknown,
}))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: (guard: () => Promise<boolean>) => (captured.update = guard),
}))
vi.mock('@/app/stores/session', () => ({ useSession: () => ({ user: { id: 'actor' } }) }))
vi.mock('@/modules/protohub-manager-ui/hooks/useDeliveryDocument', () => ({
  useDeliveryDocument: () => captured.state,
}))
vi.mock('ant-design-vue', () => ({
  Alert: { template: '<div />' },
  Button: { template: '<button><slot /></button>' },
  Pagination: { template: '<div />' },
  Modal: {
    useModal: () => [
      { confirm: (input: typeof captured.confirm) => (captured.confirm = input) },
      () => null,
    ],
  },
}))
let wrapper: VueWrapper
let draft: {
  document: { pages: { pageId: string; body: string }[] }
  changed: ReturnType<typeof ref<boolean>>
  busy: ReturnType<typeof ref<boolean>>
}
beforeEach(() => {
  i18n.global.mergeLocaleMessage('zh', { proto: protoLocales.zh })
  captured.update = undefined
  captured.confirm = undefined
  draft = {
    document: { pages: [{ pageId: 'home', body: 'Manual draft' }] },
    changed: ref(true),
    busy: ref(false),
  }
  captured.state = {
    ...draft,
    available: ref(false),
    assembled: ref(false),
    error: ref(''),
    conflict: ref(false),
    valid: ref(true),
  }
  wrapper = mount(DeliveryDocumentWorkspace, {
    props: {
      project: { name: 'Project' } as Project,
      revision: { id: 'fixed' } as Revision,
      context: { versionName: 'V1' } as WorkspaceContext,
    },
    global: { plugins: [i18n] },
  })
})
afterEach(() => wrapper?.unmount())
it('cancels a same-route page change without ending the edited session', async () => {
  const navigation = captured.update!()
  expect(captured.confirm).toBeDefined()
  captured.confirm!.onCancel()
  expect(await navigation).toBe(false)
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(draft.document.pages[0]?.body).toBe('Manual draft')
})
it('explicitly closes the session after discard is accepted for a same-route page change', async () => {
  const navigation = captured.update!()
  captured.confirm!.onOk()
  expect(await navigation).toBe(true)
  expect(wrapper.emitted('close')).toHaveLength(1)
})
