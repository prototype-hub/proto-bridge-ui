import { authLocales as authFeatureLocales } from '@/modules/authentication-manager-ui/locales/auth'
import { usersLocales } from '@/modules/authentication-manager-ui/locales/user'
import { formsLocales } from '@/modules/authentication-manager-ui/locales/forms'
import { menusLocales } from '@/modules/authentication-manager-ui/locales/menu'
import { permissionsLocales } from '@/modules/authentication-manager-ui/locales/permission'
import { logsLocales } from '@/modules/authentication-manager-ui/locales/logs'
import { dictionariesLocales } from '@/modules/authentication-manager-ui/locales/dictionary'
import { organizationsLocales } from '@/modules/authentication-manager-ui/locales/department'
import { positionsLocales } from '@/modules/authentication-manager-ui/locales/position'
import { rolesLocales } from '@/modules/authentication-manager-ui/locales/role'
import { basicSettingsLocales } from '@/modules/authentication-manager-ui/locales/basis'
import { queryLocales } from '@/modules/authentication-manager-ui/locales/query'
import { accountLocales } from '@/modules/authentication-manager-ui/locales/account'

export const authLocales = {
  zh: {
    ...authFeatureLocales.zh.auth,
    ...usersLocales.zh.auth,
    ...formsLocales.zh.auth,
    ...menusLocales.zh.auth,
    ...permissionsLocales.zh.auth,
    ...logsLocales.zh.auth,
  },
  en: {
    ...authFeatureLocales.en.auth,
    ...usersLocales.en.auth,
    ...formsLocales.en.auth,
    ...menusLocales.en.auth,
    ...permissionsLocales.en.auth,
    ...logsLocales.en.auth,
  },
}
export const systemLocales = {
  zh: {
    ...authFeatureLocales.zh.system,
    ...usersLocales.zh.system,
    ...formsLocales.zh.system,
    ...menusLocales.zh.system,
    ...logsLocales.zh.system,
    ...dictionariesLocales.zh.system,
    ...organizationsLocales.zh.system,
    ...positionsLocales.zh.system,
    ...rolesLocales.zh.system,
    ...basicSettingsLocales.zh.system,
    ...queryLocales.zh.system,
    ...accountLocales.zh.system,
  },
  en: {
    ...authFeatureLocales.en.system,
    ...usersLocales.en.system,
    ...formsLocales.en.system,
    ...menusLocales.en.system,
    ...logsLocales.en.system,
    ...dictionariesLocales.en.system,
    ...organizationsLocales.en.system,
    ...positionsLocales.en.system,
    ...rolesLocales.en.system,
    ...basicSettingsLocales.en.system,
    ...queryLocales.en.system,
    ...accountLocales.en.system,
  },
}
export const identityZh = {
  ...usersLocales.zh.identity,
  ...formsLocales.zh.identity,
  ...permissionsLocales.zh.identity,
  ...rolesLocales.zh.identity,
}
export const identityEn = {
  ...usersLocales.en.identity,
  ...formsLocales.en.identity,
  ...permissionsLocales.en.identity,
  ...rolesLocales.en.identity,
}
export const organizationZh = {
  ...formsLocales.zh.organization,
  ...dictionariesLocales.zh.organization,
  ...organizationsLocales.zh.organization,
  ...positionsLocales.zh.organization,
}
export const organizationEn = {
  ...formsLocales.en.organization,
  ...dictionariesLocales.en.organization,
  ...organizationsLocales.en.organization,
  ...positionsLocales.en.organization,
}
export const configurationZh = {
  ...formsLocales.zh.configuration,
  ...menusLocales.zh.configuration,
  ...logsLocales.zh.configuration,
  ...basicSettingsLocales.zh.configuration,
}
export const configurationEn = {
  ...formsLocales.en.configuration,
  ...menusLocales.en.configuration,
  ...logsLocales.en.configuration,
  ...basicSettingsLocales.en.configuration,
}
export const slimmingZh = {
  ...formsLocales.zh.slimming,
  ...menusLocales.zh.slimming,
  ...accountLocales.zh.slimming,
}
export const slimmingEn = {
  ...formsLocales.en.slimming,
  ...menusLocales.en.slimming,
  ...accountLocales.en.slimming,
}

export const localeMessages = {
  zh: {
    accountPassword: accountLocales.zh.accountPassword,
    auth: authLocales.zh,
    system: systemLocales.zh,
    identity: identityZh,
    organization: organizationZh,
    configuration: configurationZh,
    slimming: slimmingZh,
  },
  en: {
    accountPassword: accountLocales.en.accountPassword,
    auth: authLocales.en,
    system: systemLocales.en,
    identity: identityEn,
    organization: organizationEn,
    configuration: configurationEn,
    slimming: slimmingEn,
  },
}
