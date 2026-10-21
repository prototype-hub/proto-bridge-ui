<script setup lang="ts">
import { computed } from 'vue'
import {
  Form as AForm,
  FormItem as AFormItem,
  Input as AInput,
  InputPassword as AInputPassword,
  Button as AButton,
  Alert as AAlert,
  Checkbox as ACheckbox,
} from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useLogin } from '@/modules/authentication-manager-ui/views/auth/hooks/useLogin'
import { useBranding } from '@/app/stores/branding'
import { useSettings } from '@/app/stores/settings'
const branding = useBranding()
const { t, locale } = useI18n()
const settings = useSettings()
const { form, loading, busy, error, captcha, captchaEnabled, submit, prepare, refreshCaptcha } =
  useLogin()
const recordNumber = computed(() => branding.front.recordNumber?.trim() || '')
const policeRecordNumber = computed(() => branding.front.policeRecordNumber?.trim() || '')
const policeRecordUrl = computed(
  () =>
    `https://beian.mps.gov.cn/#/query/webSearch?code=${policeRecordNumber.value.replace(/[^0-9]/g, '')}`,
)
</script>
<template>
  <main class="login-shell">
    <div class="login-visual" aria-hidden="true">
      <img :src="branding.images.background" alt="" />
    </div>
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-language">
        <a-button @click="settings.setLanguage(locale === 'zh' ? 'en' : 'zh')">{{
          t('common.language')
        }}</a-button>
      </div>
      <div class="login-content">
        <header class="login-brand">
          <img :src="branding.images.logo" :alt="branding.title" />
          <h1 id="login-title">{{ branding.title }}</h1>
        </header>
        <a-alert v-if="error" type="error" :message="error" show-icon class="login-error" /><a-form
          layout="vertical"
          :model="form"
          @finish="submit"
          ><a-form-item
            name="username"
            :label="t('common.username')"
            :rules="[{ required: true, message: t('common.required') }]"
            ><a-input
              v-model:value="form.username"
              autocomplete="username"
              autofocus /></a-form-item
          ><a-form-item
            name="password"
            :label="t('common.password')"
            :rules="[{ required: true, message: t('common.required') }]"
            ><a-input-password
              v-model:value="form.password"
              autocomplete="current-password" /></a-form-item
          ><a-form-item
            v-if="captchaEnabled"
            name="verifyCode"
            :label="t('auth.captcha')"
            :rules="[{ required: true, message: t('common.required') }]"
            ><div class="captcha-control">
              <a-input v-model:value="form.verifyCode" autocomplete="off" /><a-button
                class="captcha-refresh"
                type="text"
                :aria-label="t('common.refresh')"
                @click="refreshCaptcha"
                ><img :src="captcha.base64" :alt="t('auth.captcha')" width="160" height="40"
              /></a-button></div></a-form-item
          ><a-form-item class="login-remember">
            <a-checkbox v-model:checked="form.rememberMe" :disabled="busy || loading">{{
              t('auth.rememberMe')
            }}</a-checkbox></a-form-item
          ><a-button
            type="primary"
            html-type="submit"
            block
            :loading="busy || loading"
            :disabled="loading"
            >{{ t('common.login') }}</a-button
          ><a-button v-if="error" block class="retry-button" @click="prepare">{{
            t('common.retry')
          }}</a-button></a-form
        >
      </div>
      <footer class="login-footer muted">
        <p v-if="branding.front.copyright">{{ branding.front.copyright }}</p>
        <div v-if="branding.front.showRecordNumber" class="login-filings">
          <a
            v-if="recordNumber"
            class="filing-link"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            >{{ recordNumber }}</a
          ><a
            v-if="policeRecordNumber"
            class="filing-link"
            :href="policeRecordUrl"
            target="_blank"
            rel="noopener noreferrer"
            >{{ policeRecordNumber }}</a
          >
        </div>
      </footer>
    </section>
  </main>
</template>
<style scoped>
.login-shell {
  display: flex;
  min-height: 100dvh;
  background: var(--color-surface);
}
.login-visual {
  position: relative;
  flex: 1;
  min-width: 0;
}
.login-visual img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.login-panel {
  display: flex;
  flex: 0 0 27%;
  flex-direction: column;
  gap: var(--space-8);
  min-width: 25rem;
  min-height: 100dvh;
  padding: var(--space-8);
  background: var(--color-surface);
}
.login-language {
  display: flex;
  justify-content: flex-end;
}
.login-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-6);
  width: 100%;
  max-width: 22rem;
  min-width: 0;
  margin: 0 auto;
}
.login-brand {
  display: grid;
  justify-items: center;
  gap: var(--space-6);
  margin-bottom: var(--space-4);
  text-align: center;
}
.login-brand img {
  max-width: 100%;
  height: 3rem;
  object-fit: contain;
}
.login-brand h1 {
  margin: 0;
  font-size: var(--text-title);
  overflow-wrap: anywhere;
}
.login-footer {
  font-size: var(--text-small);
  text-align: center;
  overflow-wrap: anywhere;
}
.login-footer p {
  margin: 0;
}
.login-footer p + p {
  margin-top: var(--space-2);
}
.login-filings {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2) var(--space-4);
  margin-top: var(--space-2);
}
.filing-link {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
}
.filing-link:hover {
  color: var(--color-primary);
}
.login-error {
  margin-bottom: 0;
}
.retry-button {
  margin-top: var(--space-3);
}
.captcha-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.captcha-control > .ant-input {
  flex: 1;
  min-width: 0;
  height: 2.5rem;
}
.captcha-refresh {
  flex: 0 1 10rem;
  width: 10rem;
  max-width: 50%;
  height: 2.5rem;
  padding: 0;
  border: 0;
}
.captcha-refresh img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
@media (width <= 48rem) {
  .login-visual {
    display: none;
  }
  .login-panel {
    flex-basis: 100%;
    min-width: 0;
    padding: var(--space-6);
  }
}
</style>
