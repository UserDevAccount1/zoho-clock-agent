<script setup>
import { computed, onMounted } from 'vue'
import { useClockStore } from '@/stores/clock'

const clockStore = useClockStore()

onMounted(() => {
  clockStore.fetchActivity()
})

const activities = computed(() => {
  if (clockStore.activityLog.length > 0) {
    return clockStore.activityLog.slice(0, 15)
  }
  if (clockStore.log.length > 0) {
    return clockStore.log.slice(0, 15)
  }
  return [{ type: 'info', created_at: new Date().toISOString(), message: 'Dashboard initialized — no activity yet' }]
})

function getIcon(type) {
  const icons = {
    clockin: 'mdi-login',
    clockout: 'mdi-logout',
    verify: 'mdi-shield-check',
    create: 'mdi-plus-circle',
    update: 'mdi-pencil',
    delete: 'mdi-delete',
    error: 'mdi-alert-circle',
    info: 'mdi-information',
  }
  return icons[type] || 'mdi-circle'
}

function getColor(type) {
  const colors = {
    clockin: 'success',
    clockout: 'warning',
    verify: 'primary',
    create: 'secondary',
    update: 'info',
    delete: 'error',
    error: 'error',
    info: 'grey',
  }
  return colors[type] || 'grey'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <v-card class="rounded-xl border border-white/5" color="surface">
    <v-card-title class="flex items-center justify-between pa-4 pb-2">
      <div class="flex items-center gap-2">
        <v-icon icon="mdi-timeline-clock" color="primary" />
        <span class="text-subtitle-1 font-weight-bold">Activity Log</span>
      </div>
      <v-btn icon="mdi-refresh" size="x-small" variant="text" @click="clockStore.fetchActivity()" />
    </v-card-title>
    <v-card-text class="pt-0">
      <v-timeline density="compact" side="end" truncate-line="both">
        <v-timeline-item
          v-for="(activity, i) in activities"
          :key="i"
          :dot-color="getColor(activity.type)"
          :icon="getIcon(activity.type)"
          size="small"
        >
          <div class="flex items-center gap-2">
            <span class="text-body-2">{{ activity.message }}</span>
            <v-chip v-if="activity.account_name" size="x-small" variant="tonal" class="ml-1">
              {{ activity.account_name }}
            </v-chip>
            <span class="text-caption text-medium-emphasis ml-auto whitespace-nowrap">
              {{ formatTime(activity.created_at || activity.time) }}
            </span>
          </div>
        </v-timeline-item>
      </v-timeline>

      <div v-if="activities.length <= 1" class="text-center text-medium-emphasis text-caption py-4">
        No recent activity. Use the clock button or verify accounts to get started.
      </div>
    </v-card-text>
  </v-card>
</template>
