import { createI18n } from 'vue-i18n'
import { common } from './common'
export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: { zh: { common: common.zh }, en: { common: common.en } },
})
export const t = i18n.global.t
