import { onMounted, ref, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sessionApi, type LoginConfig } from '@/modules/authentication-manager-ui/api/auth/session'
import { useSession } from '@/app/stores/session'
import { t } from '@/shared/i18n'
import { useTask } from '@/shared/composables/useTask'
import { token } from '@/shared/auth/token'
import { ApiError } from '@/shared/api/errors'
export function useLogin() {
  const session = useSession()
  const router = useRouter()
  const route = useRoute()
  const task = useTask()
  const loading = ref(true)
  const config = ref<LoginConfig>({})
  const captchaEnabled = ref(false)
  const captcha = ref({ key: '', base64: '' })
  const form = reactive({ username: '', password: '', verifyCode: '', rememberMe: false })
  async function enterPlatform() {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(
      redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/login')
        ? redirect
        : '/',
    )
  }
  async function refreshCaptcha() {
    if (captchaEnabled.value) captcha.value = await sessionApi.captcha()
  }
  async function prepare() {
    loading.value = true
    await task.run(async () => {
      const [loginConfig, captchaConfig] = await Promise.all([
        sessionApi.config(),
        sessionApi.captchaConfig(),
      ])
      config.value = loginConfig
      captchaEnabled.value = captchaConfig.enabled
      await refreshCaptcha()
      const rememberedToken = token.getRemembered()
      if (rememberedToken) {
        try {
          // A persisted token is only a credential; verify the account before leaving the login page.
          await session.initialize(false)
          await enterPlatform()
        } catch (cause) {
          // Another login or browser tab can replace the credential while restore is pending.
          if (cause instanceof ApiError && cause.status === 401 && token.get() === rememberedToken)
            session.clear()
          throw cause
        }
      }
    })
    loading.value = false
  }
  async function submit() {
    if (
      !form.username.trim() ||
      !form.password ||
      (captchaEnabled.value && !form.verifyCode.trim())
    )
      return
    await task.run(async () => {
      const rememberMe = form.rememberMe
      config.value = await sessionApi.config()
      let password = form.password
      if (config.value.encrypt?.enabled) {
        const { JSEncrypt } = await import('jsencrypt')
        const encryptor = new JSEncrypt()
        encryptor.setPublicKey(config.value.encrypt.publicKey)
        const encrypted = encryptor.encrypt(password)
        if (!encrypted) throw new Error(t('common.unknown'))
        password = encrypted
      }
      try {
        await session.login(
          {
            username: form.username.trim(),
            password,
            expires: rememberMe ? -1 : 3600000,
            verifyCode: captchaEnabled.value ? form.verifyCode : undefined,
            verifyKey: captchaEnabled.value ? captcha.value.key : undefined,
            encryptId: config.value.encrypt?.enabled ? config.value.encrypt.id : undefined,
          },
          { rememberMe },
        )
      } catch (cause) {
        form.verifyCode = ''
        await refreshCaptcha()
        throw cause
      }
      form.password = ''
      await enterPlatform()
    })
  }
  onMounted(prepare)
  return {
    form,
    loading,
    captchaEnabled,
    captcha,
    ...task,
    prepare,
    submit,
    refreshCaptcha: () => task.run(refreshCaptcha),
  }
}
