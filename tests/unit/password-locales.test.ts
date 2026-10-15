import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { localeMessages } from '@/modules/authentication-manager-ui'
import { common } from '@/shared/i18n/common'

describe('password messages at the application module boundary', () => {
  it.each([
    {
      language: 'zh' as const,
      next: '下一步',
      previous: '上一步',
      title: '校验旧密码',
      error: '旧密码不正确，请重新输入',
    },
    {
      language: 'en' as const,
      next: 'Next',
      previous: 'Previous',
      title: 'Verify current password',
      error: 'The current password is incorrect. Try again.',
    },
  ])(
    'resolves step actions and validation feedback after the app merges $language exports',
    ({ language, next, previous, title, error }) => {
      const runtime = createI18n({
        legacy: false,
        locale: language,
        messages: { zh: { common: common.zh }, en: { common: common.en } },
      })
      // App/main merges the public module export, not individual feature locale files.
      for (const locale of ['zh', 'en'] as const)
        runtime.global.mergeLocaleMessage(locale, localeMessages[locale])
      expect(runtime.global.t('accountPassword.next')).toBe(next)
      expect(runtime.global.t('accountPassword.previous')).toBe(previous)
      expect(runtime.global.t('accountPassword.verifyOld')).toBe(title)
      expect(runtime.global.t('accountPassword.oldInvalid')).toBe(error)
      for (const key of ['setNew', 'confirmNew', 'verifyOldFirst', 'rule', 'saveFailed'])
        expect(runtime.global.te(`accountPassword.${key}`)).toBe(true)
      runtime.dispose()
    },
  )
})
