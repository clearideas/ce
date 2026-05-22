<template>
  <div class="app-footer">
    <div>
      © {{ currentYear }} Clear Ideas Incorporated
      <span class="d-print-none"> • Community Edition</span>
    </div>
    <div class="d-print-none">
      <RouterLink to="/settings">Settings</RouterLink>
      <span> • </span>
      <a href="/api/health" target="_blank">API health</a>
    </div>
  </div>
</template>

<script setup lang="ts">
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.72rem;
  line-height: 1rem;
  padding: 6px 4px 2px;
}

.app-footer a {
  color: inherit;
  text-decoration: none;
}

.app-footer a:hover {
  color: rgba(var(--v-theme-on-surface), 0.72);
}

@media (max-width: 720px) {
  .app-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
