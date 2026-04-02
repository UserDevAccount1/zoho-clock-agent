<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const rail = ref(true)

const navItems = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard', to: '/' },
  { title: 'Accounts', icon: 'mdi-key-chain', to: '/accounts' },
]
</script>

<template>
  <v-navigation-drawer
    :rail="rail"
    permanent
    color="surface"
    class="border-r border-white/5"
  >
    <v-list-item
      :prepend-icon="rail ? 'mdi-menu' : undefined"
      class="py-4"
      @click="rail = !rail"
    >
      <template v-if="!rail">
        <v-list-item-title class="text-h6 font-weight-bold">
          Outsourcey
        </v-list-item-title>
        <v-list-item-subtitle class="text-caption">
          Process Automation
        </v-list-item-subtitle>
      </template>
    </v-list-item>

    <v-divider />

    <v-list density="compact" nav>
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :to="item.to"
        :active="router.currentRoute.value.path === item.to"
        rounded="lg"
        class="my-1"
        color="primary"
      />
    </v-list>

    <template #append>
      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-cog"
          title="Settings"
          rounded="lg"
          disabled
        />
      </v-list>
    </template>
  </v-navigation-drawer>

  <v-main>
    <v-container fluid class="pa-6">
      <slot />
    </v-container>
  </v-main>
</template>
