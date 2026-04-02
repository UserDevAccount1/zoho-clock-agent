import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useClockStore = defineStore('clock', () => {
  const status = ref('unknown')
  const loading = ref(false)
  const lastAction = ref(null)
  const error = ref(null)
  const log = ref([])
  const activityLog = ref([])
  const agentStatus = ref(null)

  const API_BASE = '/api'

  async function checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`)
      return await res.json()
    } catch (e) {
      error.value = 'Server unreachable'
      return null
    }
  }

  async function fetchActivity() {
    try {
      const res = await fetch(`${API_BASE}/activity`)
      activityLog.value = await res.json()
    } catch (e) {
      console.error('Failed to fetch activity:', e)
    }
  }

  async function fetchAgentStatus() {
    try {
      const res = await fetch(`${API_BASE}/agent/status`)
      agentStatus.value = await res.json()
      // Sync clock status from agent
      if (agentStatus.value.todayClocked?.in && !agentStatus.value.todayClocked?.out) {
        status.value = 'in'
      } else if (agentStatus.value.todayClocked?.out) {
        status.value = 'out'
      }
    } catch (e) {
      console.error('Failed to fetch agent status:', e)
    }
  }

  async function toggleAgent() {
    const res = await fetch(`${API_BASE}/agent/toggle`, { method: 'POST' })
    agentStatus.value = await res.json()
  }

  async function startAgent() {
    const res = await fetch(`${API_BASE}/agent/start`, { method: 'POST' })
    agentStatus.value = await res.json()
  }

  async function stopAgent() {
    const res = await fetch(`${API_BASE}/agent/stop`, { method: 'POST' })
    agentStatus.value = await res.json()
  }

  async function updateSchedule(clockIn, clockOut) {
    const res = await fetch(`${API_BASE}/agent/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clockIn, clockOut }),
    })
    agentStatus.value = await res.json()
  }

  async function clockIn() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/agent/clockin`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        status.value = 'in'
        lastAction.value = { type: 'clockin', time: new Date().toISOString(), ...data }
        log.value.unshift({ type: 'clockin', time: new Date().toISOString(), message: data.message })
      } else {
        error.value = data.error || 'Clock in failed'
      }
      if (data.agentStatus) agentStatus.value = data.agentStatus
      await fetchActivity()
      return data
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  async function clockOut() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/agent/clockout`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        status.value = 'out'
        lastAction.value = { type: 'clockout', time: new Date().toISOString(), ...data }
        log.value.unshift({ type: 'clockout', time: new Date().toISOString(), message: data.message })
      } else {
        error.value = data.error || 'Clock out failed'
      }
      if (data.agentStatus) agentStatus.value = data.agentStatus
      await fetchActivity()
      return data
    } catch (e) {
      error.value = e.message
      return { success: false, error: e.message }
    } finally {
      loading.value = false
    }
  }

  return {
    status, loading, lastAction, error, log, activityLog, agentStatus,
    checkHealth, fetchActivity, fetchAgentStatus,
    toggleAgent, startAgent, stopAgent, updateSchedule,
    clockIn, clockOut,
  }
})
