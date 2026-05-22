<script setup lang="ts">defineProps<{ id?: string; siteId: string; loading?: boolean; showNewFolder?: boolean; showDropZone?: boolean }>()</script>
<template><VEmptyState v-if="!loading" title="No content yet" text="Create a folder or upload files to get started." /></template>
