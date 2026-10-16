import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
import { request, resetUnauthorized } from '@/shared/api/client'
import { permissionSet, hasPermission } from '@/shared/auth/permissions'
import { sessionApi } from '@/modules/authentication-manager-ui'
import type { User, ServerMenu, ResourcePermission } from '@/shared/auth/types'
import { t } from '@/shared/i18n'
export const useSession = defineStore('session', () => {
  const user = shallowRef<User>()
  const menus = shallowRef<ServerMenu[]>([])
  const permissions = shallowRef(new Set<string>())
  const initialized = ref(false)
  const menusReady = ref(false)
  let generation = 0
  let sessionFlight: Promise<void> | undefined
  let menuFlight: Promise<void> | undefined
  const routeCleanups = new Set<() => void>()
  let resources: ResourcePermission[] = []
  function clear() {
    generation++
    token.clear()
    request.cancelAll()
    routeCleanups.forEach((remove) => remove())
    routeCleanups.clear()
    user.value = undefined
    menus.value = []
    permissions.value = new Set()
    resources = []
    initialized.value = false
    menusReady.value = false
    sessionFlight = undefined
    menuFlight = undefined
  }
  function registerRoutes(remove: () => void) {
    routeCleanups.add(remove)
  }
  async function initialize(withMenus = true) {
    const epoch = generation
    if (!initialized.value) {
      sessionFlight ||= (async () => {
        const [profile, auth] = await Promise.all([sessionApi.user(), sessionApi.authorization()])
        if (epoch !== generation) throw new ApiError(t('common.sessionExpired'), 401)
        if (profile.status === 0 || profile.status === -1 || profile.status === 'disabled') {
          clear()
          throw new ApiError(t('common.accountDisabled'), 401)
        }
        user.value = profile
        resources = auth.permissions || []
        permissions.value = permissionSet([], resources)
        initialized.value = true
      })().finally(() => {
        if (epoch === generation) sessionFlight = undefined
      })
      await sessionFlight
    }
    if (withMenus && !menusReady.value) {
      menuFlight ||= sessionApi
        .menus()
        .then((result) => {
          if (epoch !== generation) throw new ApiError(t('common.sessionExpired'), 401)
          menus.value = result
          permissions.value = permissionSet(result, resources)
          menusReady.value = true
        })
        .finally(() => {
          if (epoch === generation) menuFlight = undefined
        })
      await menuFlight
    }
  }
  async function login(
    input: Parameters<typeof sessionApi.login>[0],
    options: { rememberMe?: boolean } = {},
  ) {
    clear()
    const epoch = generation
    const result = await sessionApi.login(input)
    // Logout or a newer login invalidates an earlier response, including persistent credentials.
    if (epoch !== generation) throw new ApiError(t('common.sessionExpired'), 401)
    token.set(result.token, options.rememberMe)
    resetUnauthorized()
  }
  async function refreshMenus() {
    const epoch = generation
    if (menuFlight) await menuFlight
    if (epoch !== generation) throw new ApiError(t('common.sessionExpired'), 401)
    menusReady.value = false
    await initialize()
  }
  async function logout() {
    try {
      await sessionApi.logout()
    } finally {
      clear()
    }
  }
  const can = (value: string | string[]) => hasPermission(permissions.value, value)
  return {
    user,
    menus,
    permissions,
    initialized,
    menusReady,
    initialize,
    refreshMenus,
    login,
    logout,
    clear,
    can,
    registerRoutes,
  }
})
