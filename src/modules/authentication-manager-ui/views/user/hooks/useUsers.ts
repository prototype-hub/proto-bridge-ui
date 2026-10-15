import { computed, onMounted, ref, shallowRef } from 'vue'
import { usersApi } from '@/modules/authentication-manager-ui/api/user/users'
import { rolesApi } from '@/modules/authentication-manager-ui/api/role/roles'
import { roleIdentityApi } from '@/modules/authentication-manager-ui/api/role/role-options'
import { userIdentityApi } from '@/modules/authentication-manager-ui/api/user/user-types'
import { positionIdentityApi } from '@/modules/authentication-manager-ui/api/position/position-options'
import { usePaged } from '@/shared/composables/usePaged'
import { useTask } from '@/shared/composables/useTask'
import { saved, deleted } from '@/shared/utils/feedback'
import { formOptions } from '@/modules/authentication-manager-ui/hooks/form-options'
import type { FormContext } from '@/modules/authentication-manager-ui/types/forms'
import type { SystemRecord } from '@/modules/authentication-manager-ui/types/common'
import { enabled, idsOf, optionIds } from '@/modules/authentication-manager-ui/utils/identity'
import { userTerms, validPassword } from '@/modules/authentication-manager-ui/utils/user'
import { t } from '@/shared/i18n'
import { recordsOf } from '@/modules/authentication-manager-ui/utils/model'
import type { ManagedUser, UserInput } from '@/modules/authentication-manager-ui/types/user'
import type { Role } from '@/modules/authentication-manager-ui/types/role'
export function useUsers() {
  const list = usePaged((query, options) =>
    usersApi.list(
      {
        ...query,
        terms: userTerms(query.terms),
        sorts: [
          { name: 'createTime', order: 'desc' },
          { name: 'username', order: 'asc' },
        ],
      },
      options,
    ),
  )
  const task = useTask()
  const open = ref(false)
  const editorSession = ref(0)
  const roles = shallowRef<Role[]>([])
  const context = ref<FormContext>({})
  const positions = ref<SystemRecord[]>([])
  const types = ref<SystemRecord[]>([])
  const typeOptions = computed(() =>
    types.value.map((item) => ({ value: item.id, label: item.name })),
  )
  const form = ref<UserInput>({ username: '', name: '', password: '', roleIdList: [] })
  const resetId = ref('')
  const password = ref('')
  const confirmPassword = ref('')
  async function loadOptions() {
    const [allRoles, options, positionRows, groupedRoles] = await Promise.all([
      rolesApi.all(),
      formOptions(['organizations']),
      positionIdentityApi.positions(),
      roleIdentityApi.roleOptions().catch(() => []),
    ])
    roles.value = allRoles
    context.value = options
    context.value.roleGroups = groupedRoles
    positions.value = positionRows
  }
  async function edit(user?: ManagedUser) {
    await task.run(async () => {
      editorSession.value += 1
      const detail = user ? await usersApi.get(user.id) : undefined
      await loadOptions()
      const extraRoles = detail?.roleList || []
      roles.value = [
        ...roles.value,
        ...extraRoles
          .filter((row) => !roles.value.some((role) => role.id === row.id))
          .map((row) => ({ ...row, unavailable: true })),
      ]
      positions.value.push(
        ...recordsOf(detail?.positions)
          .filter((row) => !positions.value.some((position) => position.id === row.id))
          .map((row) => ({ ...row, unavailable: true })),
      )
      const organizationIds = new Set(optionIds(context.value.organizations || []))
      context.value.organizations ||= []
      context.value.organizations.push(
        ...recordsOf(detail?.orgList)
          .filter((row) => !organizationIds.has(row.id))
          .map((row) => ({ value: row.id, label: row.name, disabled: true })),
      )
      form.value = {
        ...detail,
        id: detail?.id,
        orgIdList: idsOf(detail?.orgList || detail?.orgIdList),
        positions: idsOf(detail?.positions).map((id) => ({ id })),
        username: detail?.username || '',
        name: detail?.name || '',
        password: '',
        roleIdList: idsOf(detail?.roleList || detail?.roleIdList),
      }
      open.value = true
    })
  }
  async function save() {
    await task.run(async () => {
      if (!form.value.id) {
        if (!validPassword(form.value.password || '')) throw new Error(t('identity.passwordRule'))
        if (form.value.password !== form.value.confirmPassword)
          throw new Error(t('system.passwordMismatch'))
        for (const type of ['username', 'password'] as const) {
          const validation = await usersApi.validate(type, String(form.value[type] || ''))
          if (validation.passed !== true)
            throw new Error(
              validation.reason ||
                t(type === 'username' ? 'identity.usernameUnavailable' : 'identity.passwordRule'),
            )
        }
      }
      await usersApi.save(form.value)
      saved()
      open.value = false
      await list.load()
    })
  }
  async function remove(id: string) {
    await task.run(async () => {
      if (enabled(list.data.value.data.find((row) => row.id === id)?.status)) return
      await usersApi.remove(id)
      deleted()
      await list.load()
    })
  }
  async function status(user: ManagedUser) {
    await task.run(async () => {
      await usersApi.status(user.id, enabled(user.status) ? 0 : 1)
      saved()
      await list.load()
    })
  }
  async function reset() {
    await task.run(async () => {
      if (!validPassword(password.value)) throw new Error(t('identity.passwordRule'))
      if (password.value !== confirmPassword.value) throw new Error(t('system.passwordMismatch'))
      const validation = await usersApi.validate('password', password.value)
      if (validation.passed !== true)
        throw new Error(validation.reason || t('identity.passwordRule'))
      await usersApi.password(resetId.value, password.value)
      closeReset()
      saved()
    })
  }
  onMounted(
    () =>
      void task.run(async () => {
        await loadOptions()
        types.value = await userIdentityApi.userTypes()
      }),
  )
  function beginReset(user: ManagedUser) {
    resetId.value = user.id
    password.value = ''
    confirmPassword.value = ''
  }
  function closeReset() {
    resetId.value = ''
    password.value = ''
    confirmPassword.value = ''
  }
  return {
    list,
    context,
    positions,
    types,
    typeOptions,
    task,
    open,
    editorSession,
    roles,
    form,
    edit,
    save,
    remove,
    status,
    beginReset,
    closeReset,
    resetId,
    password,
    confirmPassword,
    reset,
    loadOptions,
  }
}
