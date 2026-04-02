<script setup>
defineProps({
  title: String,
  icon: String,
  status: String,
  statusColor: String,
  lastRun: String,
  nextRun: String,
  description: String,
})
</script>

<template>
  <v-card class="rounded-xl border border-white/5" color="surface">
    <v-card-text>
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <v-avatar :color="statusColor" size="40" variant="tonal">
            <v-icon :icon="icon" />
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-bold">{{ title }}</div>
            <div class="text-caption text-medium-emphasis">{{ description }}</div>
          </div>
        </div>
        <v-chip :color="statusColor" size="small" variant="tonal">
          {{ status }}
        </v-chip>
      </div>
      <v-divider class="my-3" />
      <div class="flex justify-between text-caption text-medium-emphasis">
        <span>Last: {{ lastRun || 'Never' }}</span>
        <span>Next: {{ nextRun || 'Manual' }}</span>
      </div>
    </v-card-text>
  </v-card>
</template>
