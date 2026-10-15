import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { message } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import '@/shared/styles/tokens.css'
import { i18n } from '@/shared/i18n'
import { config } from '@/shared/config'
import { configureClient } from '@/shared/api/client'
import { permissionKey } from '@/shared/auth/provider'
import { localeMessages as authenticationMessages } from '@/modules/authentication-manager-ui'
import { locales as protoLocales } from '@/modules/protohub-manager-ui'
import { useSettings } from './stores/settings'
import { useSession } from './stores/session'
import { router } from './router'
import App from './App.vue'
import { layoutLocales } from './locales'
const pinia = createPinia()
const app = createApp(App).use(pinia).use(i18n)
for (const language of ['zh', 'en'] as const)
  i18n.global.mergeLocaleMessage(language, {
    ...authenticationMessages[language],
    layout: layoutLocales[language],
    proto: protoLocales[language],
  })
useSettings(pinia)
const session = useSession(pinia)
app.provide(permissionKey, { can: session.can })
configureClient({
  onError: (error) => {
    void message.error(error.message)
  },
  onUnauthorized: async () => {
    session.clear()
    if (!router.currentRoute.value.meta.public)
      await router.replace({
        path: '/login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
  },
})
document.title = config.displayName
app.use(router).mount('#app')
