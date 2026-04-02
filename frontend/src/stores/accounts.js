import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const error = ref(null)
  const filterCategory = ref(null)
  const filterStatus = ref(null)
  const searchQuery = ref('')
  const hideChecked = ref(false)

  const API_BASE = '/api/accounts'

  const categories = ['Operational', 'Content', 'Marketing', 'Social', 'Analytics', 'Tech']
  const statuses = ['Connected', 'No Account Yet', 'Failed', 'Unchecked']

  const categoryIcons = {
    Operational: 'mdi-briefcase-outline',
    Content: 'mdi-file-document-edit-outline',
    Marketing: 'mdi-bullhorn-outline',
    Social: 'mdi-share-variant-outline',
    Analytics: 'mdi-chart-line',
    Tech: 'mdi-code-braces',
  }

  const categoryColors = {
    Operational: 'blue',
    Content: 'purple',
    Marketing: 'orange',
    Social: 'pink',
    Analytics: 'teal',
    Tech: 'green',
  }

  const filterHasKeys = ref(false)
  const filterHasMcp = ref(false)
  const filterNoKeys = ref(false)

  const filteredAccounts = computed(() => {
    let result = accounts.value
    if (filterCategory.value) {
      result = result.filter(a => a.category === filterCategory.value)
    }
    if (filterStatus.value) {
      result = result.filter(a => a.status === filterStatus.value)
    }
    if (hideChecked.value) {
      result = result.filter(a => a.status !== 'Connected')
    }
    if (filterHasKeys.value) {
      result = result.filter(a => a._keyCount > 0)
    }
    if (filterNoKeys.value) {
      result = result.filter(a => !a._keyCount || a._keyCount === 0)
    }
    if (filterHasMcp.value) {
      result = result.filter(a => a.mcp_server)
    }
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      )
    }
    return result
  })

  const categoryStats = computed(() => {
    const stats = {}
    for (const cat of categories) {
      const catAccounts = accounts.value.filter(a => a.category === cat)
      const connected = catAccounts.filter(a => a.status === 'Connected').length
      stats[cat] = { total: catAccounts.length, connected, percent: catAccounts.length ? Math.round(connected / catAccounts.length * 100) : 0 }
    }
    return stats
  })

  async function fetchAccounts() {
    loading.value = true
    try {
      const res = await fetch(API_BASE)
      accounts.value = await res.json()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function addAccount(account) {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    })
    const data = await res.json()
    accounts.value.push(data)
    return data
  }

  async function updateAccount(id, updates) {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const data = await res.json()
    const idx = accounts.value.findIndex(a => a.id === id)
    if (idx !== -1) accounts.value[idx] = data
    return data
  }

  async function deleteAccount(id) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
    accounts.value = accounts.value.filter(a => a.id !== id)
  }

  async function verifyAccount(id) {
    const idx = accounts.value.findIndex(a => a.id === id)
    if (idx !== -1) accounts.value[idx].verifying = true

    try {
      const res = await fetch(`${API_BASE}/${id}/verify`, { method: 'POST' })
      const data = await res.json()
      if (idx !== -1) {
        accounts.value[idx] = { ...accounts.value[idx], ...data, verifying: false }
      }
      return data
    } catch (e) {
      if (idx !== -1) accounts.value[idx].verifying = false
      throw e
    }
  }

  return {
    accounts, loading, error,
    filterCategory, filterStatus, searchQuery, hideChecked, filterHasKeys, filterNoKeys, filterHasMcp,
    categories, statuses, categoryIcons, categoryColors, categoryStats,
    filteredAccounts,
    fetchAccounts, addAccount, updateAccount, deleteAccount, verifyAccount,
  }
})
