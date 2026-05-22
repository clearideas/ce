<script setup lang="ts">withDefaults(defineProps<{ rows?: number; variant?: string; showCheckbox?: boolean }>(), { rows: 8, showCheckbox: false })</script>
<template><div class="content-list-loading-state pa-4"><VSkeletonLoader v-for="n in rows" :key="n" type="list-item" /></div></template>
