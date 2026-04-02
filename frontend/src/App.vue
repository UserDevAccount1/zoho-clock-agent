<script setup>
import AppLayout from './components/AppLayout.vue'
import ClockFAB from './components/ClockFAB.vue'
</script>

<template>
  <v-app>
    <AppLayout>
      <RouterView />
    </AppLayout>
    <ClockFAB />
  </v-app>
</template>
