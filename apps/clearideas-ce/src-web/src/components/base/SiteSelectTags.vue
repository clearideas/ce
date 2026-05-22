<script setup lang="ts">defineProps<{ items: any[]; showAll?: boolean }>()</script>
<template><div class="d-flex flex-wrap ga-1"><VChip v-for="item in items" :key="item.id" size="x-small" variant="tonal">{{ item.title }} · {{ item.role }}</VChip></div></template>
