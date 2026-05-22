<script setup lang="ts">
import ThemeToggle from './components/ThemeToggle.vue'
</script>

<template>
  <VMain class="auth-page web-auth-page">
    <div class="auth-theme-toggle">
      <ThemeToggle />
    </div>
    <slot />
  </VMain>
</template>

<style scoped>
.auth-theme-toggle {
  position: fixed;
  z-index: 10;
  inset-block-start: 18px;
  inset-inline-end: 18px;
}
</style>
