<script setup>
import { onMounted } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import AccountTable from '@/components/AccountTable.vue'

const store = useAccountsStore()

onMounted(() => {
  store.fetchAccounts()
})
</script>

<template>
  <div>
    <div class="mb-6">
      <h1 class="text-h4 font-weight-bold">Manage Accounts</h1>
      <p class="text-medium-emphasis">Defeat Diabetes company accounts and credentials</p>
    </div>

    <AccountTable />
  </div>
</template>
