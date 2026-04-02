<script setup>
import { ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

const store = useAccountsStore()
const viewMode = ref('table') // 'table' or 'cards'
const editDialog = ref(false)
const deleteDialog = ref(false)
const detailDialog = ref(false)
const editingAccount = ref({})
const deletingAccount = ref(null)
const viewingAccount = ref(null)
const isNew = ref(false)
const showPassword = ref(false)
const showEditPassword = ref(false)
const detailTab = ref('overview')
const accountKeys = ref([])
const newKey = ref({ key_type: 'api_key', key_name: '', key_value: '' })
const showKeyValues = ref({})
const addKeyDialog = ref(false)
const showMcpSetup = ref(false)

const KEY_TYPES = [
  { title: 'API Key', value: 'api_key' },
  { title: 'API Secret', value: 'api_secret' },
  { title: 'OAuth Client ID', value: 'oauth_client_id' },
  { title: 'OAuth Client Secret', value: 'oauth_client_secret' },
  { title: 'OAuth Token', value: 'oauth_token' },
  { title: 'Refresh Token', value: 'refresh_token' },
  { title: 'Access Token', value: 'access_token' },
  { title: 'Webhook URL', value: 'webhook_url' },
  { title: 'MCP Config', value: 'mcp_config' },
  { title: 'Other', value: 'other' },
]

function keyTypeIcon(type) {
  const icons = {
    api_key: 'mdi-key',
    api_secret: 'mdi-key-chain',
    oauth_client_id: 'mdi-identifier',
    oauth_client_secret: 'mdi-lock',
    oauth_token: 'mdi-ticket-confirmation',
    refresh_token: 'mdi-refresh',
    access_token: 'mdi-ticket',
    webhook_url: 'mdi-webhook',
    mcp_config: 'mdi-connection',
    other: 'mdi-dots-horizontal',
  }
  return icons[type] || 'mdi-key'
}

function keyTypeLabel(type) {
  return KEY_TYPES.find(k => k.value === type)?.title || type
}

async function fetchAccountKeys(accountId) {
  try {
    const res = await fetch(`/api/accounts/${accountId}/keys`)
    accountKeys.value = await res.json()
  } catch (e) {
    accountKeys.value = []
  }
}

async function addKey() {
  if (!viewingAccount.value) return
  await fetch(`/api/accounts/${viewingAccount.value.id}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newKey.value),
  })
  newKey.value = { key_type: 'api_key', key_name: '', key_value: '' }
  addKeyDialog.value = false
  await fetchAccountKeys(viewingAccount.value.id)
}

async function deleteKey(keyId) {
  if (!viewingAccount.value) return
  await fetch(`/api/accounts/${viewingAccount.value.id}/keys/${keyId}`, { method: 'DELETE' })
  await fetchAccountKeys(viewingAccount.value.id)
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text || '')
}

function toggleKeyVisibility(keyId) {
  showKeyValues.value[keyId] = !showKeyValues.value[keyId]
}

async function saveAccountField(field, value) {
  if (!viewingAccount.value) return
  await fetch(`/api/accounts/${viewingAccount.value.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  })
  await store.fetchAccounts()
  viewingAccount.value = store.accounts.find(a => a.id === viewingAccount.value.id)
}

const headers = [
  { title: 'Name', key: 'name', sortable: true },
  { title: 'URL', key: 'url', sortable: false },
  { title: 'Category', key: 'category', sortable: true },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Last Verified', key: 'last_verified', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
]

function statusColor(status) {
  return { Connected: 'success', Failed: 'error', Unchecked: 'warning', 'No Account Yet': 'grey' }[status] || 'grey'
}

function statusIcon(status) {
  return { Connected: 'mdi-check-circle', Failed: 'mdi-close-circle', Unchecked: 'mdi-alert-circle', 'No Account Yet': 'mdi-account-off' }[status] || 'mdi-help-circle'
}

function openAdd() {
  isNew.value = true
  editingAccount.value = { name: '', url: '', category: 'Operational', status: 'Unchecked', username: '', password: '' }
  editDialog.value = true
}

function openEdit(account) {
  isNew.value = false
  editingAccount.value = { ...account }
  showEditPassword.value = false
  editDialog.value = true
}

function openDetail(account) {
  viewingAccount.value = account
  showPassword.value = false
  detailTab.value = 'overview'
  showKeyValues.value = {}
  showMcpSetup.value = false
  detailDialog.value = true
  fetchAccountKeys(account.id)
}

async function saveAccount() {
  if (isNew.value) {
    await store.addAccount(editingAccount.value)
  } else {
    await store.updateAccount(editingAccount.value.id, editingAccount.value)
  }
  editDialog.value = false
}

function confirmDelete(account) {
  deletingAccount.value = account
  deleteDialog.value = true
}

async function doDelete() {
  await store.deleteAccount(deletingAccount.value.id)
  deleteDialog.value = false
}

async function verify(account) {
  try {
    await store.verifyAccount(account.id)
    // Refresh viewing account if open
    if (viewingAccount.value?.id === account.id) {
      viewingAccount.value = { ...store.accounts.find(a => a.id === account.id) }
    }
  } catch (e) {
    console.error('Verify failed:', e)
  }
}

const healthChecking = ref({})
async function healthCheck(account) {
  healthChecking.value[account.id] = true
  try {
    const res = await fetch(`/api/accounts/${account.id}/health-check`, { method: 'POST' })
    const data = await res.json()
    await store.fetchAccounts()
    if (viewingAccount.value?.id === account.id) {
      viewingAccount.value = store.accounts.find(a => a.id === account.id)
      await fetchAccountKeys(account.id)
    }
    return data
  } catch (e) {
    console.error('Health check failed:', e)
  } finally {
    healthChecking.value[account.id] = false
  }
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function openUrl(url) {
  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  window.open(fullUrl, '_blank')
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <v-card class="rounded-xl border border-white/5 mb-4" color="surface">
      <v-card-text class="pa-4">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Search -->
          <v-text-field
            v-model="store.searchQuery"
            prepend-inner-icon="mdi-magnify"
            label="Search accounts..."
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="max-w-xs"
          />

          <v-divider vertical class="mx-1 hidden sm:block" />

          <!-- Category Filter -->
          <v-select
            v-model="store.filterCategory"
            :items="[{ title: 'All Categories', value: null }, ...store.categories.map(c => ({ title: c, value: c }))]"
            variant="outlined"
            density="compact"
            hide-details
            class="max-w-40"
          />

          <!-- Status Filter -->
          <v-select
            v-model="store.filterStatus"
            :items="[{ title: 'All Status', value: null }, ...store.statuses.map(s => ({ title: s, value: s }))]"
            variant="outlined"
            density="compact"
            hide-details
            class="max-w-36"
          />

          <v-spacer />

          <!-- Filter Chips -->
          <div class="flex flex-wrap gap-1">
            <v-chip
              :color="store.filterHasKeys ? 'primary' : undefined"
              :variant="store.filterHasKeys ? 'flat' : 'outlined'"
              size="small"
              @click="store.filterHasKeys = !store.filterHasKeys; store.filterNoKeys = false"
              prepend-icon="mdi-key"
            >
              Has Keys
            </v-chip>
            <v-chip
              :color="store.filterNoKeys ? 'warning' : undefined"
              :variant="store.filterNoKeys ? 'flat' : 'outlined'"
              size="small"
              @click="store.filterNoKeys = !store.filterNoKeys; store.filterHasKeys = false"
              prepend-icon="mdi-key-remove"
            >
              No Keys
            </v-chip>
            <v-chip
              :color="store.filterHasMcp ? 'secondary' : undefined"
              :variant="store.filterHasMcp ? 'flat' : 'outlined'"
              size="small"
              @click="store.filterHasMcp = !store.filterHasMcp"
              prepend-icon="mdi-connection"
            >
              MCP
            </v-chip>
            <v-chip
              :color="store.hideChecked ? 'success' : undefined"
              :variant="store.hideChecked ? 'flat' : 'outlined'"
              size="small"
              @click="store.hideChecked = !store.hideChecked"
              prepend-icon="mdi-eye-off"
            >
              Hide Verified
            </v-chip>
          </div>

          <v-divider vertical class="mx-1" />

          <!-- View Toggle -->
          <v-btn-toggle v-model="viewMode" mandatory density="compact" variant="outlined" color="primary">
            <v-btn value="table" icon="mdi-table" size="small" />
            <v-btn value="cards" icon="mdi-view-grid" size="small" />
          </v-btn-toggle>

          <v-btn icon="mdi-refresh" size="small" variant="text" @click="store.fetchAccounts()" title="Refresh accounts" />

          <v-btn color="primary" prepend-icon="mdi-plus" size="small" @click="openAdd">
            Add Account
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <!-- Category Stats -->
    <v-row class="mb-4">
      <v-col v-for="cat in store.categories" :key="cat" cols="6" sm="4" md="2">
        <v-card
          class="rounded-xl border cursor-pointer transition-all hover:scale-105"
          :class="store.filterCategory === cat ? 'border-primary' : 'border-white/5'"
          color="surface"
          @click="store.filterCategory = store.filterCategory === cat ? null : cat"
        >
          <v-card-text class="text-center pa-3">
            <v-icon :icon="store.categoryIcons[cat]" :color="store.categoryColors[cat]" size="24" />
            <div class="text-caption font-weight-bold mt-1">{{ cat }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ store.categoryStats[cat]?.connected }}/{{ store.categoryStats[cat]?.total }}
            </div>
            <v-progress-linear
              :model-value="store.categoryStats[cat]?.percent || 0"
              :color="store.categoryColors[cat]"
              height="3"
              rounded
              class="mt-1"
            />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- TABLE VIEW -->
    <v-card v-if="viewMode === 'table'" class="rounded-xl border border-white/5" color="surface">
      <v-data-table
        :headers="headers"
        :items="store.filteredAccounts"
        :loading="store.loading"
        hover
        items-per-page="15"
        :items-per-page-options="[10, 15, 25, 50]"
      >
        <template #item.name="{ item }">
          <div class="flex items-center gap-2 py-1">
            <v-avatar :color="store.categoryColors[item.category]" size="28" variant="tonal">
              <v-icon :icon="store.categoryIcons[item.category]" size="14" />
            </v-avatar>
            <span class="font-weight-medium">{{ item.name }}</span>
          </div>
        </template>

        <template #item.url="{ item }">
          <a
            class="text-secondary text-decoration-none cursor-pointer flex items-center gap-1"
            @click="openUrl(item.url)"
          >
            <span class="text-caption">{{ item.url }}</span>
            <v-icon icon="mdi-open-in-new" size="12" />
          </a>
        </template>

        <template #item.category="{ item }">
          <v-chip :color="store.categoryColors[item.category]" size="small" variant="tonal">
            {{ item.category }}
          </v-chip>
        </template>

        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" size="small" variant="tonal">
            <v-icon v-if="item.verifying" icon="mdi-loading" class="mdi-spin mr-1" size="small" />
            <v-icon v-else :icon="statusIcon(item.status)" size="small" class="mr-1" />
            {{ item.verifying ? 'Verifying...' : item.status }}
          </v-chip>
        </template>

        <template #item.last_verified="{ item }">
          <span class="text-caption text-medium-emphasis">{{ formatDate(item.last_verified) }}</span>
        </template>

        <template #item.actions="{ item }">
          <v-btn icon size="x-small" variant="text" color="secondary" @click="openDetail(item)" title="View details">
            <v-icon icon="mdi-eye" size="16" />
          </v-btn>
          <v-btn icon size="x-small" variant="text" color="primary" :loading="item.verifying" @click="verify(item)" title="Verify">
            <v-icon icon="mdi-shield-check" size="16" />
          </v-btn>
          <v-btn icon size="x-small" variant="text" @click="openEdit(item)" title="Edit">
            <v-icon icon="mdi-pencil" size="16" />
          </v-btn>
          <v-btn icon size="x-small" variant="text" color="error" @click="confirmDelete(item)" title="Delete">
            <v-icon icon="mdi-delete" size="16" />
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- CARD VIEW -->
    <v-row v-else>
      <v-col v-for="account in store.filteredAccounts" :key="account.id" cols="12" sm="6" md="4" lg="3">
        <v-card class="rounded-xl border border-white/5 h-100" color="surface">
          <v-card-text class="pa-4">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-2">
                <v-avatar :color="store.categoryColors[account.category]" size="36" variant="tonal">
                  <v-icon :icon="store.categoryIcons[account.category]" size="18" />
                </v-avatar>
                <div>
                  <div class="text-subtitle-2 font-weight-bold">{{ account.name }}</div>
                  <a
                    class="text-caption text-secondary text-decoration-none cursor-pointer"
                    @click="openUrl(account.url)"
                  >
                    {{ account.url }}
                    <v-icon icon="mdi-open-in-new" size="10" />
                  </a>
                </div>
              </div>
              <v-chip :color="statusColor(account.status)" size="x-small" variant="tonal">
                <v-icon :icon="statusIcon(account.status)" size="12" class="mr-1" />
                {{ account.status }}
              </v-chip>
            </div>

            <div class="flex items-center gap-1 mb-2 text-caption text-medium-emphasis">
              <v-icon icon="mdi-account" size="14" />
              {{ account.username || '-' }}
            </div>

            <v-chip :color="store.categoryColors[account.category]" size="x-small" variant="tonal" class="mb-3">
              {{ account.category }}
            </v-chip>

            <v-divider class="my-2" />

            <div class="flex items-center justify-between">
              <span class="text-caption text-medium-emphasis">{{ formatDate(account.last_verified) }}</span>
              <div class="flex gap-0">
                <v-btn icon size="x-small" variant="text" color="secondary" @click="openDetail(account)">
                  <v-icon icon="mdi-eye" size="14" />
                </v-btn>
                <v-btn icon size="x-small" variant="text" color="primary" :loading="account.verifying" @click="verify(account)">
                  <v-icon icon="mdi-shield-check" size="14" />
                </v-btn>
                <v-btn icon size="x-small" variant="text" @click="openEdit(account)">
                  <v-icon icon="mdi-pencil" size="14" />
                </v-btn>
                <v-btn icon size="x-small" variant="text" color="error" @click="confirmDelete(account)">
                  <v-icon icon="mdi-delete" size="14" />
                </v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Results Count -->
    <div class="text-caption text-medium-emphasis mt-3 text-center">
      Showing {{ store.filteredAccounts.length }} of {{ store.accounts.length }} accounts
    </div>

    <!-- View Detail Dialog (Tabbed) -->
    <v-dialog v-model="detailDialog" max-width="780" scrollable>
      <v-card v-if="viewingAccount" class="rounded-xl" color="surface" min-height="520">
        <!-- Header -->
        <v-card-title class="flex items-center gap-3 pa-4">
          <v-avatar :color="store.categoryColors[viewingAccount.category]" size="44" variant="tonal">
            <v-icon :icon="store.categoryIcons[viewingAccount.category]" size="22" />
          </v-avatar>
          <div>
            <div class="text-h6">{{ viewingAccount.name }}</div>
            <div class="text-caption text-medium-emphasis flex items-center gap-2">
              <span>{{ viewingAccount.category }}</span>
              <span class="mx-1">·</span>
              <a class="text-secondary text-decoration-none cursor-pointer" @click="openUrl(viewingAccount.url)">
                {{ viewingAccount.url }} <v-icon icon="mdi-open-in-new" size="10" />
              </a>
            </div>
          </div>
          <v-spacer />
          <v-chip :color="statusColor(viewingAccount.status)" size="small" variant="tonal">
            <v-icon :icon="statusIcon(viewingAccount.status)" size="14" class="mr-1" />
            {{ viewingAccount.status }}
          </v-chip>
          <v-btn icon="mdi-close" size="small" variant="text" @click="detailDialog = false" />
        </v-card-title>

        <!-- Tabs -->
        <v-tabs v-model="detailTab" color="primary" density="compact" class="border-b border-white/5">
          <v-tab value="overview" prepend-icon="mdi-account-circle">Overview</v-tab>
          <v-tab value="keys" prepend-icon="mdi-key-chain">
            API Keys
            <v-badge v-if="accountKeys.length" :content="accountKeys.length" color="primary" inline class="ml-1" />
          </v-tab>
          <v-tab value="links" prepend-icon="mdi-link-variant">Links & MCP</v-tab>
        </v-tabs>

        <v-card-text class="pa-0" style="min-height: 340px">
          <v-tabs-window v-model="detailTab">

            <!-- TAB 1: Overview -->
            <v-tabs-window-item value="overview">
              <div class="pa-4">
                <!-- Credentials -->
                <div class="text-caption font-weight-bold text-medium-emphasis mb-2">CREDENTIALS</div>
                <v-list density="compact" bg-color="transparent" class="mb-4">
                  <v-list-item prepend-icon="mdi-email-outline" :title="viewingAccount.username || 'Not set'" subtitle="Email / Username">
                    <template #append>
                      <v-btn icon="mdi-content-copy" size="x-small" variant="text" @click="copyToClipboard(viewingAccount.username)" />
                    </template>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-lock-outline" subtitle="Password">
                    <template #title>
                      <div class="flex items-center gap-2">
                        <code class="text-body-2">{{ showPassword ? (viewingAccount.password || 'Not set') : '••••••••••' }}</code>
                        <v-btn :icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'" size="x-small" variant="text" @click="showPassword = !showPassword" />
                        <v-btn icon="mdi-content-copy" size="x-small" variant="text" @click="copyToClipboard(viewingAccount.password)" />
                      </div>
                    </template>
                  </v-list-item>
                </v-list>

                <!-- Verification -->
                <div class="text-caption font-weight-bold text-medium-emphasis mb-2">VERIFICATION</div>
                <v-list density="compact" bg-color="transparent" class="mb-4">
                  <v-list-item prepend-icon="mdi-clock-outline" :title="formatDate(viewingAccount.last_verified) || 'Never'" subtitle="Last Verified" />
                  <v-list-item v-if="viewingAccount.verify_message" prepend-icon="mdi-message-text-outline" subtitle="Result">
                    <template #title>
                      <span class="text-body-2">{{ viewingAccount.verify_message }}</span>
                    </template>
                  </v-list-item>
                </v-list>

                <!-- Notes -->
                <div class="text-caption font-weight-bold text-medium-emphasis mb-2">NOTES</div>
                <div class="text-body-2 text-medium-emphasis pa-3 rounded-lg" style="background: rgba(255,255,255,0.04)">
                  {{ viewingAccount.notes || 'No notes' }}
                </div>
              </div>
            </v-tabs-window-item>

            <!-- TAB 2: API Keys & Credentials -->
            <v-tabs-window-item value="keys">
              <div class="pa-4">
                <div class="flex items-center justify-between mb-3">
                  <div class="text-caption font-weight-bold text-medium-emphasis">API KEYS & SECRETS</div>
                  <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="addKeyDialog = true">Add Key</v-btn>
                </div>

                <div v-if="accountKeys.length === 0" class="text-center py-8 text-medium-emphasis">
                  <v-icon icon="mdi-key-plus" size="48" class="mb-2 opacity-30" />
                  <div class="text-body-2">No API keys configured</div>
                  <div class="text-caption">Add API keys, OAuth tokens, secrets, and other credentials</div>
                </div>

                <v-list v-else density="compact" bg-color="transparent">
                  <v-list-item
                    v-for="key in accountKeys"
                    :key="key.id"
                    :prepend-icon="keyTypeIcon(key.key_type)"
                    class="mb-2 rounded-lg"
                    style="background: rgba(255,255,255,0.03)"
                  >
                    <template #title>
                      <div class="flex items-center gap-2">
                        <v-chip size="x-small" variant="tonal" color="primary">{{ keyTypeLabel(key.key_type) }}</v-chip>
                        <span class="font-weight-medium text-body-2">{{ key.key_name }}</span>
                      </div>
                    </template>
                    <template #subtitle>
                      <code class="text-caption" style="word-break: break-all">
                        {{ showKeyValues[key.id] ? key.key_value : key.key_value.substring(0, 8) + '••••••••' }}
                      </code>
                    </template>
                    <template #append>
                      <v-btn :icon="showKeyValues[key.id] ? 'mdi-eye-off' : 'mdi-eye'" size="x-small" variant="text" @click="toggleKeyVisibility(key.id)" />
                      <v-btn icon="mdi-content-copy" size="x-small" variant="text" @click="copyToClipboard(key.key_value)" />
                      <v-btn icon="mdi-delete" size="x-small" variant="text" color="error" @click="deleteKey(key.id)" />
                    </template>
                  </v-list-item>
                </v-list>
              </div>
            </v-tabs-window-item>

            <!-- TAB 3: Links & MCP -->
            <v-tabs-window-item value="links">
              <div class="pa-4">
                <div class="text-caption font-weight-bold text-medium-emphasis mb-3">QUICK LINKS</div>
                <v-list density="compact" bg-color="transparent" class="mb-4">
                  <v-list-item prepend-icon="mdi-web" subtitle="Main URL">
                    <template #title>
                      <a class="text-secondary text-decoration-none cursor-pointer" @click="openUrl(viewingAccount.url)">
                        {{ viewingAccount.url }} <v-icon icon="mdi-open-in-new" size="12" />
                      </a>
                    </template>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-login" subtitle="Login URL">
                    <template #title>
                      <div class="flex items-center gap-2">
                        <a v-if="viewingAccount.login_url" class="text-secondary text-decoration-none cursor-pointer" @click="openUrl(viewingAccount.login_url)">
                          {{ viewingAccount.login_url }} <v-icon icon="mdi-open-in-new" size="12" />
                        </a>
                        <v-text-field
                          v-else
                          :model-value="viewingAccount.login_url || ''"
                          placeholder="e.g. https://app.example.com/login"
                          variant="underlined"
                          density="compact"
                          hide-details
                          @change="e => saveAccountField('login_url', e.target.value)"
                        />
                      </div>
                    </template>
                  </v-list-item>
                  <v-list-item prepend-icon="mdi-code-braces" subtitle="Developer Portal / API Docs">
                    <template #title>
                      <div class="flex items-center gap-2">
                        <a v-if="viewingAccount.developer_url" class="text-secondary text-decoration-none cursor-pointer" @click="openUrl(viewingAccount.developer_url)">
                          {{ viewingAccount.developer_url }} <v-icon icon="mdi-open-in-new" size="12" />
                        </a>
                        <v-text-field
                          v-else
                          :model-value="viewingAccount.developer_url || ''"
                          placeholder="e.g. https://developer.example.com"
                          variant="underlined"
                          density="compact"
                          hide-details
                          @change="e => saveAccountField('developer_url', e.target.value)"
                        />
                      </div>
                    </template>
                  </v-list-item>
                </v-list>

                <v-divider class="my-3" />

                <!-- MCP: Show full config if connected -->
                <div v-if="viewingAccount.mcp_server" class="mb-3">
                  <div class="text-caption font-weight-bold text-medium-emphasis mb-2">MCP SERVER — CONNECTED</div>
                  <v-card variant="tonal" color="primary" class="rounded-lg">
                    <v-card-text class="pa-3">
                      <div class="flex items-center gap-2 mb-2">
                        <v-icon icon="mdi-connection" color="primary" size="20" />
                        <span class="font-weight-bold text-body-2">{{ viewingAccount.mcp_server }}</span>
                        <v-chip size="x-small" color="success" variant="flat">Active</v-chip>
                      </div>
                      <code class="text-caption" style="word-break: break-all; display: block; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; white-space: pre-wrap">{
  "mcpServers": {
    "{{ viewingAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '-') }}": {
      "command": "npx",
      "args": ["{{ viewingAccount.mcp_server }}"],
      "env": { ... }
    }
  }
}</code>
                      <div class="flex gap-2 mt-2">
                        <v-btn size="x-small" variant="text" color="error" prepend-icon="mdi-link-off" @click="saveAccountField('mcp_server', '')">
                          Disconnect
                        </v-btn>
                      </div>
                    </v-card-text>
                  </v-card>
                </div>

                <!-- MCP: Show setup option if not connected -->
                <div v-else>
                  <div class="text-caption font-weight-bold text-medium-emphasis mb-2">MCP SERVER</div>
                  <div v-if="!showMcpSetup" class="text-center py-4">
                    <v-icon icon="mdi-connection" size="32" class="mb-2 opacity-30" />
                    <div class="text-caption text-medium-emphasis mb-2">No MCP server configured for this account</div>
                    <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="showMcpSetup = true">
                      Set Up MCP
                    </v-btn>
                  </div>
                  <div v-else>
                    <v-text-field
                      :model-value="''"
                      placeholder="e.g. @delorenj/mcp-server-trello"
                      variant="outlined"
                      density="compact"
                      label="MCP Package Name"
                      hint="NPM package name for the MCP server"
                      persistent-hint
                      @change="e => { saveAccountField('mcp_server', e.target.value); showMcpSetup = false }"
                    />
                    <v-btn size="x-small" variant="text" class="mt-1" @click="showMcpSetup = false">Cancel</v-btn>
                  </div>
                </div>
              </div>
            </v-tabs-window-item>
          </v-tabs-window>
        </v-card-text>

        <v-divider />
        <v-card-actions class="pa-4">
          <v-btn color="primary" prepend-icon="mdi-open-in-new" @click="openUrl(viewingAccount.url)">
            Open Site
          </v-btn>
          <v-spacer />
          <v-btn color="success" variant="tonal" prepend-icon="mdi-stethoscope" :loading="healthChecking[viewingAccount.id]" @click="healthCheck(viewingAccount)">
            Health Check
          </v-btn>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-shield-check" :loading="viewingAccount.verifying" @click="verify(viewingAccount)">
            Verify Login
          </v-btn>
          <v-btn variant="text" prepend-icon="mdi-pencil" @click="detailDialog = false; openEdit(viewingAccount)">
            Edit
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add Key Dialog -->
    <v-dialog v-model="addKeyDialog" max-width="450">
      <v-card class="rounded-xl" color="surface">
        <v-card-title class="pa-4">
          <v-icon icon="mdi-key-plus" class="mr-2" />
          Add API Key / Secret
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-select
            v-model="newKey.key_type"
            :items="KEY_TYPES"
            label="Key Type"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field v-model="newKey.key_name" label="Name / Label" placeholder="e.g. Production API Key" variant="outlined" density="compact" class="mb-3" />
          <v-textarea v-model="newKey.key_value" label="Value" placeholder="Paste key, token, or secret here" variant="outlined" density="compact" rows="3" />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="addKeyDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="addKey" :disabled="!newKey.key_name || !newKey.key_value">Add</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Edit/Add Dialog -->
    <v-dialog v-model="editDialog" max-width="500">
      <v-card class="rounded-xl" color="surface">
        <v-card-title class="pa-4">
          <v-icon :icon="isNew ? 'mdi-plus-circle' : 'mdi-pencil'" class="mr-2" />
          {{ isNew ? 'Add Account' : 'Edit Account' }}
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4">
          <v-text-field v-model="editingAccount.name" label="Name" variant="outlined" density="compact" class="mb-3" />
          <v-text-field v-model="editingAccount.url" label="URL (without https://)" variant="outlined" density="compact" class="mb-3" />
          <v-select
            v-model="editingAccount.category"
            :items="store.categories"
            label="Category"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field v-model="editingAccount.username" label="Username / Email" variant="outlined" density="compact" class="mb-3" />
          <v-text-field
            v-model="editingAccount.password"
            label="Password"
            variant="outlined"
            density="compact"
            class="mb-3"
            :type="showEditPassword ? 'text' : 'password'"
            :append-inner-icon="showEditPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showEditPassword = !showEditPassword"
          />
          <v-select
            v-model="editingAccount.status"
            :items="store.statuses"
            label="Status"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field v-model="editingAccount.login_url" label="Login URL" placeholder="https://app.example.com/login" variant="outlined" density="compact" class="mb-3" />
          <v-text-field v-model="editingAccount.developer_url" label="Developer Portal URL" placeholder="https://developer.example.com" variant="outlined" density="compact" class="mb-3" />
          <v-text-field v-model="editingAccount.mcp_server" label="MCP Server Package" placeholder="@org/mcp-server-name" variant="outlined" density="compact" class="mb-3" />
          <v-textarea v-model="editingAccount.notes" label="Notes" variant="outlined" density="compact" rows="2" />
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="saveAccount">{{ isNew ? 'Add' : 'Save' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirmation -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card class="rounded-xl" color="surface">
        <v-card-title class="pa-4">
          <v-icon icon="mdi-alert" color="error" class="mr-2" />
          Delete Account
        </v-card-title>
        <v-card-text>
          Are you sure you want to delete <strong>{{ deletingAccount?.name }}</strong>? This action cannot be undone.
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="doDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
