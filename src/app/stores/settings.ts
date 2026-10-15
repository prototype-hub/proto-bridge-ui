import { defineStore } from 'pinia'
import { storage } from '@/shared/storage'
import { i18n } from '@/shared/i18n'
export const useSettings = defineStore('settings', () => {
  function setLanguage(value: 'zh' | 'en') {
    i18n.global.locale.value = value
    storage.set('language', value)
    document.documentElement.lang = value === 'zh' ? 'zh-CN' : 'en'
  }
  setLanguage(storage.get('language') === 'en' ? 'en' : 'zh')
  return { setLanguage }
})
