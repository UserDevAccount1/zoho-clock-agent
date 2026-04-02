<script setup>
import { ref, computed, onMounted } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useAccountsStore } from '@/stores/accounts'
import ProcessCard from '@/components/ProcessCard.vue'
import ActivityTimeline from '@/components/ActivityTimeline.vue'

const clockStore = useClockStore()
const accountsStore = useAccountsStore()
const serverOnline = ref(false)

onMounted(async () => {
  const health = await clockStore.checkHealth()
  serverOnline.value = !!health
  await accountsStore.fetchAccounts()
  await clockStore.fetchActivity()
  await clockStore.fetchAgentStatus()
})

const connectedCount = computed(() => accountsStore.accounts.filter(a => a.status === 'Connected').length)
const failedCount = computed(() => accountsStore.accounts.filter(a => a.status === 'Failed').length)
const uncheckedCount = computed(() => accountsStore.accounts.filter(a => a.status === 'Unchecked').length)
const overallPercent = computed(() => {
  if (!accountsStore.accounts.length) return 0
  return Math.round(connectedCount.value / accountsStore.accounts.length * 100)
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-h4 font-weight-bold">Dashboard</h1>
          <p class="text-medium-emphasis">Defeat Diabetes — Process Automation Overview</p>
        </div>
        <v-chip :color="serverOnline ? 'success' : 'error'" variant="tonal" size="small">
          <v-icon :icon="serverOnline ? 'mdi-circle' : 'mdi-circle-outline'" size="8" class="mr-1" />
          {{ serverOnline ? 'Server Online' : 'Server Offline' }}
        </v-chip>
      </div>
    </div>

    <!-- Stats Row -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="3">
        <v-card class="rounded-xl border border-white/5" color="surface">
          <v-card-text class="flex items-center gap-4 pa-4">
            <v-avatar color="primary" variant="tonal" size="52">
              <v-icon icon="mdi-key-chain" size="24" />
            </v-avatar>
            <div>
              <div class="text-h4 font-weight-bold">{{ accountsStore.accounts.length }}</div>
              <div class="text-caption text-medium-emphasis">Total Accounts</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="rounded-xl border border-white/5" color="surface">
          <v-card-text class="flex items-center gap-4 pa-4">
            <v-avatar color="success" variant="tonal" size="52">
              <v-icon icon="mdi-check-circle" size="24" />
            </v-avatar>
            <div>
              <div class="text-h4 font-weight-bold text-success">{{ connectedCount }}</div>
              <div class="text-caption text-medium-emphasis">Connected</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="rounded-xl border border-white/5" color="surface">
          <v-card-text class="flex items-center gap-4 pa-4">
            <v-avatar color="error" variant="tonal" size="52">
              <v-icon icon="mdi-alert-circle" size="24" />
            </v-avatar>
            <div>
              <div class="text-h4 font-weight-bold text-error">{{ failedCount }}</div>
              <div class="text-caption text-medium-emphasis">Failed</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card class="rounded-xl border border-white/5" color="surface">
          <v-card-text class="flex items-center gap-4 pa-4">
            <v-avatar color="grey" variant="tonal" size="52">
              <v-icon icon="mdi-help-circle" size="24" />
            </v-avatar>
            <div>
              <div class="text-h4 font-weight-bold">{{ uncheckedCount }}</div>
              <div class="text-caption text-medium-emphasis">Unchecked</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Overall Progress -->
    <v-card class="rounded-xl border border-white/5 mb-6" color="surface">
      <v-card-text class="pa-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-subtitle-2 font-weight-bold">Account Verification Progress</span>
          <span class="text-h6 font-weight-bold" :class="overallPercent > 80 ? 'text-success' : overallPercent > 40 ? 'text-warning' : 'text-error'">
            {{ overallPercent }}%
          </span>
        </div>
        <v-progress-linear
          :model-value="overallPercent"
          :color="overallPercent > 80 ? 'success' : overallPercent > 40 ? 'warning' : 'error'"
          height="8"
          rounded
        />
        <div class="flex justify-between mt-2 text-caption text-medium-emphasis">
          <span>{{ connectedCount }} verified</span>
          <span>{{ accountsStore.accounts.length }} total</span>
        </div>
      </v-card-text>
    </v-card>

    <!-- Process Cards + Activity -->
    <v-row>
      <v-col cols="12" md="6">
        <div class="flex flex-col gap-4">
          <ProcessCard
            title="Zoho Clock Agent"
            icon="mdi-clock-check"
            :status="clockStore.agentStatus?.running ? 'Running' : 'Stopped'"
            :status-color="clockStore.agentStatus?.running ? 'success' : 'error'"
            :description="`Auto IN ${clockStore.agentStatus?.schedule?.clockIn || '08:00'} / OUT ${clockStore.agentStatus?.schedule?.clockOut || '17:00'} — ${clockStore.agentStatus?.schedule?.timezone || 'Asia/Manila'}`"
            :last-run="clockStore.agentStatus?.lastClockIn ? new Date(clockStore.agentStatus.lastClockIn).toLocaleString('en-AU') : null"
            :next-run="clockStore.agentStatus?.nextAction ? `${clockStore.agentStatus.nextAction.action === 'clockin' ? 'In' : 'Out'} at ${clockStore.agentStatus.nextAction.time}` : null"
          />
          <ProcessCard
            title="Account Verifier Agent"
            icon="mdi-shield-check"
            status="Ready"
            status-color="secondary"
            description="AI agent validates login connections to all accounts"
          />
          <ProcessCard
            title="Bulk Auto-Verify"
            icon="mdi-robot"
            status="Idle"
            status-color="grey"
            description="Automated verification of all 55+ company accounts"
          />
        </div>
      </v-col>
      <v-col cols="12" md="6">
        <ActivityTimeline />
      </v-col>
    </v-row>
  </div>
</template>
