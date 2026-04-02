<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useClockStore } from '@/stores/clock'

const clockStore = useClockStore()
const showDialog = ref(false)
const serverOnline = ref(false)
const editSchedule = ref(false)
const scheduleIn = ref('08:00')
const scheduleOut = ref('17:00')
let pollTimer = null

onMounted(async () => {
  const health = await clockStore.checkHealth()
  serverOnline.value = !!health
  await clockStore.fetchAgentStatus()

  if (clockStore.agentStatus?.schedule) {
    scheduleIn.value = clockStore.agentStatus.schedule.clockIn
    scheduleOut.value = clockStore.agentStatus.schedule.clockOut
  }

  // Poll agent status every 30s
  pollTimer = setInterval(() => {
    if (showDialog.value) clockStore.fetchAgentStatus()
  }, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function saveSchedule() {
  await clockStore.updateSchedule(scheduleIn.value, scheduleOut.value)
  editSchedule.value = false
}
</script>

<template>
  <v-btn
    icon="mdi-clock-outline"
    color="primary"
    size="large"
    class="fab-clock"
    elevation="8"
    @click="showDialog = true; clockStore.fetchAgentStatus()"
  />

  <v-dialog v-model="showDialog" max-width="460" location="bottom end">
    <v-card class="rounded-xl" color="surface">
      <v-card-title class="flex items-center gap-2 pa-4">
        <v-icon icon="mdi-clock" color="primary" />
        <span>Zoho Clock Agent</span>
        <v-spacer />
        <v-chip
          :color="clockStore.agentStatus?.running ? 'success' : 'error'"
          size="x-small"
          variant="tonal"
        >
          {{ clockStore.agentStatus?.running ? 'Agent Running' : 'Agent Stopped' }}
        </v-chip>
        <v-btn icon="mdi-close" size="small" variant="text" @click="showDialog = false" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <!-- Clock Status -->
        <div class="text-center mb-4">
          <v-avatar
            :color="clockStore.status === 'in' ? 'success' : clockStore.status === 'out' ? 'warning' : 'grey'"
            size="64"
            variant="tonal"
          >
            <v-icon
              :icon="clockStore.status === 'in' ? 'mdi-check-circle' : clockStore.status === 'out' ? 'mdi-close-circle' : 'mdi-help-circle'"
              size="32"
            />
          </v-avatar>
          <div class="text-h6 mt-2">
            {{ clockStore.status === 'in' ? 'Clocked In' : clockStore.status === 'out' ? 'Clocked Out' : 'Unknown' }}
          </div>
          <div v-if="clockStore.agentStatus" class="text-caption text-medium-emphasis">
            {{ clockStore.agentStatus.currentTime }} · {{ clockStore.agentStatus.currentDate }}
            <span v-if="clockStore.agentStatus.isDayOff" class="ml-1 text-warning">(Day Off)</span>
          </div>
        </div>

        <!-- Manual Buttons -->
        <div class="flex gap-3 mb-4">
          <v-btn
            color="success"
            block
            :loading="clockStore.loading"
            prepend-icon="mdi-login"
            @click="clockStore.clockIn()"
          >
            Clock In
          </v-btn>
          <v-btn
            color="warning"
            block
            :loading="clockStore.loading"
            prepend-icon="mdi-logout"
            @click="clockStore.clockOut()"
          >
            Clock Out
          </v-btn>
        </div>

        <v-alert
          v-if="clockStore.error"
          type="error"
          variant="tonal"
          class="mb-3"
          density="compact"
          closable
        >
          {{ clockStore.error }}
        </v-alert>

        <v-alert
          v-if="clockStore.lastAction"
          type="info"
          variant="tonal"
          class="mb-3"
          density="compact"
        >
          {{ clockStore.lastAction.message }} — {{ formatTime(clockStore.lastAction.time) }}
        </v-alert>

        <v-divider class="my-3" />

        <!-- Agent Schedule -->
        <div class="flex items-center justify-between mb-2">
          <div class="text-caption font-weight-bold text-medium-emphasis">AUTO SCHEDULE</div>
          <div class="flex gap-1">
            <v-btn
              size="x-small"
              :color="clockStore.agentStatus?.enabled ? 'success' : 'grey'"
              :variant="clockStore.agentStatus?.enabled ? 'flat' : 'outlined'"
              @click="clockStore.toggleAgent()"
            >
              {{ clockStore.agentStatus?.enabled ? 'Enabled' : 'Disabled' }}
            </v-btn>
            <v-btn size="x-small" variant="text" icon="mdi-pencil" @click="editSchedule = !editSchedule" />
          </div>
        </div>

        <div v-if="!editSchedule" class="flex items-center gap-4 mb-3 pa-3 rounded-lg" style="background: rgba(255,255,255,0.04)">
          <div class="text-center">
            <v-icon icon="mdi-login" color="success" size="18" />
            <div class="text-body-2 font-weight-bold">{{ clockStore.agentStatus?.schedule?.clockIn || '08:00' }}</div>
            <div class="text-caption text-medium-emphasis">Clock In</div>
          </div>
          <v-icon icon="mdi-arrow-right" size="16" class="text-medium-emphasis" />
          <div class="text-center">
            <v-icon icon="mdi-logout" color="warning" size="18" />
            <div class="text-body-2 font-weight-bold">{{ clockStore.agentStatus?.schedule?.clockOut || '17:00' }}</div>
            <div class="text-caption text-medium-emphasis">Clock Out</div>
          </div>
          <v-spacer />
          <div class="text-center">
            <v-icon icon="mdi-earth" size="18" class="text-medium-emphasis" />
            <div class="text-caption text-medium-emphasis">{{ clockStore.agentStatus?.schedule?.timezone || 'Asia/Manila' }}</div>
          </div>
        </div>

        <div v-else class="flex gap-3 mb-3">
          <v-text-field v-model="scheduleIn" label="Clock In" type="time" variant="outlined" density="compact" hide-details />
          <v-text-field v-model="scheduleOut" label="Clock Out" type="time" variant="outlined" density="compact" hide-details />
          <v-btn color="primary" size="small" @click="saveSchedule">Save</v-btn>
        </div>

        <!-- Next Action -->
        <div v-if="clockStore.agentStatus?.nextAction" class="pa-3 rounded-lg mb-3" style="background: rgba(255,255,255,0.04)">
          <div class="flex items-center gap-2">
            <v-icon :icon="clockStore.agentStatus.nextAction.action === 'clockin' ? 'mdi-login' : 'mdi-logout'" size="16" color="primary" />
            <span class="text-caption font-weight-bold">Next:</span>
            <span class="text-caption">{{ clockStore.agentStatus.nextAction.action === 'clockin' ? 'Clock In' : 'Clock Out' }} at {{ clockStore.agentStatus.nextAction.time }}</span>
            <span class="text-caption text-medium-emphasis">({{ clockStore.agentStatus.nextAction.day }})</span>
          </div>
        </div>

        <!-- n8n Integration -->
        <div v-if="clockStore.agentStatus?.n8n" class="pa-3 rounded-lg mb-3" style="background: rgba(255,255,255,0.04)">
          <div class="flex items-center gap-2 mb-1">
            <v-icon icon="mdi-robot" size="16" color="secondary" />
            <span class="text-caption font-weight-bold">n8n AI Agent</span>
            <v-chip size="x-small" color="secondary" variant="tonal">{{ clockStore.agentStatus.n8n.status }}</v-chip>
          </div>
          <div class="text-caption text-medium-emphasis" style="word-break: break-all">
            {{ clockStore.agentStatus.n8n.webhookUrl }}{{ clockStore.agentStatus.n8n.clockInEndpoint }}
          </div>
        </div>

        <!-- Agent Log -->
        <div v-if="clockStore.agentStatus?.log?.length" class="mt-2">
          <div class="text-caption font-weight-bold text-medium-emphasis mb-2">AGENT LOG</div>
          <v-list density="compact" class="rounded-lg" bg-color="transparent" style="max-height: 150px; overflow-y: auto">
            <v-list-item
              v-for="(entry, i) in clockStore.agentStatus.log.slice(0, 8)"
              :key="i"
              :prepend-icon="entry.type === 'clockin' ? 'mdi-login' : entry.type === 'clockout' ? 'mdi-logout' : entry.type === 'error' ? 'mdi-alert' : 'mdi-information'"
              density="compact"
            >
              <v-list-item-title class="text-caption">{{ entry.message }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ formatTime(entry.time) }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.fab-clock {
  position: fixed !important;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}
</style>
