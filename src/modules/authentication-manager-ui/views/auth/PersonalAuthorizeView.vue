<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  Card as ACard,
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
  Button as AButton,
  Alert as AAlert,
} from 'ant-design-vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { authorizationApi } from '@/modules/authentication-manager-ui/api/auth/authorization'
import { sessionApi } from '@/modules/authentication-manager-ui/api/auth/session'
import { getValue } from '@/modules/authentication-manager-ui/utils/model'
import { safeExternalUrl } from '@/modules/authentication-manager-ui/views/auth/utils/redirect'
import type { Model } from '@/modules/authentication-manager-ui/types/common'
import { sessionStorageAdapter } from '@/shared/storage'
import { useTask } from '@/shared/composables/useTask'
const { t } = useI18n(),
  route = useRoute(),
  task = useTask(),
  config = ref<Model>({}),
  form = ref({ password: '', verifyCode: '' }),
  captcha = ref({ key: '', base64: '' })
const key = () => String(route.query.personal_token || '')
async function refresh() {
  captcha.value = await sessionApi.captcha()
}
async function authorize() {
  await task.run(async () => {
    const parameters: Model = { password: form.value.password }
    if (getValue(config.value, 'authConfiguration.encrypt.enabled')) {
      const { JSEncrypt } = await import('jsencrypt')
      const encrypt = new JSEncrypt()
      encrypt.setPublicKey(String(getValue(config.value, 'authConfiguration.encrypt.publicKey')))
      const encrypted = encrypt.encrypt(form.value.password)
      if (!encrypted) throw new Error(t('common.invalid'))
      parameters.password = encrypted
      parameters.encryptId = getValue(config.value, 'authConfiguration.encrypt.id')
    }
    if (captcha.value.key) {
      parameters.verifyKey = captcha.value.key
      parameters.verifyCode = form.value.verifyCode
    }
    try {
      const url = new URL(
        safeExternalUrl(
          (
            await authorizationApi.tokenRedirect(
              key(),
              config.value.authType === 'none' ? {} : { authParameters: parameters },
            )
          ).result,
        ),
      )
      const value = url.searchParams.get(':X_Personal_Token')
      if (value) {
        sessionStorageAdapter.set('personal-token', value)
        url.searchParams.delete(':X_Personal_Token')
      }
      form.value.password = ''
      window.location.assign(url.href)
    } catch (error) {
      if (captcha.value.key) await refresh()
      throw error
    }
  })
}
onMounted(async () => {
  await task.run(async () => {
    if (!key()) throw new Error(t('common.required'))
    config.value = (await authorizationApi.tokenConfig(key())).result
    if (getValue(config.value, 'authConfiguration.captchaType') === 'image') await refresh()
  })
  if (!task.error.value && config.value.authType === 'none') await authorize()
})
</script>
<template>
  <main class="authorization-page">
    <a-card :title="t('system.authorize')"
      ><a-alert v-if="task.error.value" type="error" :message="task.error.value" /><a-form
        v-if="config.authType === 'password'"
        :model="form"
        layout="vertical"
        @finish="authorize"
        ><a-form-item
          name="password"
          :label="t('common.password')"
          :rules="[{ required: true, message: t('common.required') }]"
          ><a-input-password v-model:value="form.password" /></a-form-item
        ><a-form-item
          v-if="captcha.key"
          name="verifyCode"
          :label="t('auth.captcha')"
          :rules="[{ required: true, message: t('common.required') }]"
          ><a-input v-model:value="form.verifyCode"
            ><template #addonAfter
              ><button type="button" @click="refresh">
                <img
                  :src="captcha.base64"
                  :alt="t('auth.captcha')"
                /></button></template></a-input></a-form-item
        ><a-button html-type="submit" type="primary" :loading="task.busy.value">{{
          t('system.authorize')
        }}</a-button></a-form
      ></a-card
    >
  </main>
</template>
<style scoped>
.authorization-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: var(--color-background);
  padding: var(--space-6);
}
.ant-card {
  width: min(480px, 100%);
}
img {
  height: 30px;
}
button {
  border: 0;
  background: transparent;
  cursor: pointer;
}
</style>
