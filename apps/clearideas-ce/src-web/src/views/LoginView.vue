<script setup lang="ts">
import { computed, ref } from 'vue'
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../components/base/BaseButton.vue'
import Logo from '../components/brand/Logo.vue'
import AuthLayout from '../layouts/AuthLayout.vue'
import { useAuthStore } from '../stores'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const step = ref<'email' | 'code' | 'redirecting'>('email')
const error = ref('')
const success = ref('')
const form = ref({ email: '', code: '' })
const redirectTarget = computed(() => {
  const siteId = getQueryString('siteId')
  return siteId ? `/site/${siteId}` : '/sites'
})

onMounted(() => {
  const email = route.query.email
  if (typeof email === 'string' && email) form.value.email = email
  const code = getQueryString('code')
  if (form.value.email && code) {
    formatCode(code)
    step.value = 'code'
    void verifyCode()
    return
  }
  if (authStore.session) void redirectAfterPause()
})

function getQueryString(key: string) {
  const value = route.query[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

async function sendCode() {
  error.value = ''
  success.value = ''
  try {
    await authStore.sendCode({ email: form.value.email })
    step.value = 'code'
    success.value = 'Check your email for a sign-in code.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not send sign-in code'
  }
}

async function verifyCode() {
  error.value = ''
  success.value = ''
  try {
    const fallbackName = form.value.email.split('@')[0] || 'CE User'
    await authStore.verifyCode({ email: form.value.email, code: form.value.code, name: fallbackName })
    await redirectAfterPause()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Invalid or expired code'
  }
}

async function redirectAfterPause() {
  step.value = 'redirecting'
  await new Promise(resolve => window.setTimeout(resolve, 1800))
  await router.push(redirectTarget.value)
}

function changeEmail() {
  step.value = 'email'
  success.value = ''
  error.value = ''
  form.value.code = ''
}

function formatCode(value: string) {
  form.value.code = value.replace(/\D/g, '').slice(0, 8)
}

function submit() {
  if (step.value === 'email') void sendCode()
  if (step.value === 'code') void verifyCode()
}

</script>

<template>
  <AuthLayout>
    <VCard class="web-auth-card" width="560" variant="flat">
      <VCardText class="pa-7">
        <div class="auth-brand">
          <div class="auth-brand-lockup">
            <Logo class="auth-logo" />
            <p class="auth-edition mb-0">Community Edition</p>
          </div>
          <h1 class="auth-title">{{ step === 'redirecting' ? 'Opening Clear Ideas' : 'Sign in with email code' }}</h1>
        </div>
        <VAlert v-if="error" type="error" class="mb-4">{{ error }}</VAlert>
        <VAlert v-if="success" type="success" class="mb-4">{{ success }}</VAlert>
        <div v-if="step === 'redirecting'" class="auth-redirecting">
          <VProgressCircular indeterminate color="primary" size="34" />
          <p class="text-body-2 text-medium-emphasis mb-0">Authentication confirmed. Taking you to your workspace...</p>
        </div>
        <VForm v-else @submit.prevent="submit">
          <VTextField
            v-model="form.email"
            label="Email"
            autocomplete="email"
            class="mb-3"
            :readonly="step === 'code'"
          />
          <VTextField
            v-if="step === 'code'"
            :model-value="form.code"
            label="Sign-in code"
            autocomplete="one-time-code"
            inputmode="numeric"
            class="mb-5 auth-code-input"
            autofocus
            @update:model-value="formatCode(String($event))"
          />
          <div class="d-flex ga-2 flex-wrap justify-center">
            <BaseButton
              :text="step === 'email' ? 'Send code' : 'Verify code'"
              type="submit"
              color="primary"
              :loading="authStore.loading"
            />
            <BaseButton
              v-if="step === 'code'"
              text="Use different email"
              type="button"
              variant="tonal"
              color="secondary"
              :disabled="authStore.loading"
              @click="changeEmail"
            />
          </div>
        </VForm>
      </VCardText>
    </VCard>
  </AuthLayout>
</template>

<style scoped>
.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 28px;
}

.auth-logo {
  width: min(220px, 46vw);
}

.auth-brand-lockup {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
  max-width: 100%;
}

.auth-edition {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding-left: 14px;
  border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 1.42rem;
  font-weight: 500;
  line-height: 1;
  transform: translateY(-3px);
  white-space: nowrap;
}

.auth-redirecting {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 18px;
  min-height: 140px;
  justify-content: center;
  text-align: center;
}

.auth-code-input :deep(input) {
  font-size: 24px;
  letter-spacing: 8px;
  text-align: center;
}
</style>
