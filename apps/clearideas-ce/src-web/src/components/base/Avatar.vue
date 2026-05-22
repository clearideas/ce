<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string; email?: string; size?: number }>(), { size: 34 })
const initials = computed(() => (props.name || props.email || '?').slice(0, 1).toUpperCase())
</script>
<template><VAvatar color="primary" :size="size">{{ initials }}</VAvatar></template>
