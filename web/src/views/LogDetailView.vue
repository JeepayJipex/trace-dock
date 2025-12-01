<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getLog } from '@/api/logs';
import type { LogEntry } from '@/types';
import LogDetailPanel from '@/components/LogDetailPanel.vue';

const route = useRoute();
const router = useRouter();

const log = ref<LogEntry | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function fetchLog() {
  const id = route.params.id as string;
  
  if (!id) {
    error.value = 'No log ID provided';
    loading.value = false;
    return;
  }

  try {
    log.value = await getLog(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch log';
  } finally {
    loading.value = false;
  }
}

function goBack() {
  router.push('/');
}

onMounted(() => {
  fetchLog();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <button
      @click="goBack"
      class="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span>Back to Logs</span>
    </button>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="bg-red-500/20 border border-red-500/50 text-red-400 p-4 rounded-lg">
      {{ error }}
    </div>

    <!-- Log Detail -->
    <LogDetailPanel v-else-if="log" :log="log" />
  </div>
</template>
