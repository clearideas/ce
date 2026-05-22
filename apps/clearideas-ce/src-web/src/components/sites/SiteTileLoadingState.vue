<template>
  <VCard v-for="n in 8" :key="n" class="site-tile-item" variant="flat">
    <VSkeletonLoader type="image, list-item-two-line" />
  </VCard>
</template>
