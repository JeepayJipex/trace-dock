<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getLogs, getApps, getSessions } from '@/api/logs';
import { useWebSocket } from '@/composables/useWebSocket';
import type { LogEntry, LogFilters } from '@/types';
import LogList from '@/components/LogList.vue';
import LogFiltersPanel from '@/components/LogFiltersPanel.vue';
import LogDetailModal from '@/components/LogDetailModal.vue';

const logs = ref<LogEntry[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const offset = ref(0);
const limit = 50;

const filters = ref<LogFilters>({});
const apps = ref<string[]>([]);
const sessions = ref<string[]>([]);

const selectedLog = ref<LogEntry | null>(null);
const showDetailModal = ref(false);

// WebSocket for live updates
const { isConnected, isLiveMode, toggleLiveMode } = useWebSocket((log: LogEntry) => {
  // Add new log at the beginning
  logs.value = [log, ...logs.value].slice(0, 500);
  total.value++;
});

const hasMore = computed(() => logs.value.length < total.value);

async function fetchLogs(append = false) {
  loading.value = true;
  error.value = null;

  try {
    const currentOffset = append ? offset.value : 0;
    const response = await getLogs(filters.value, limit, currentOffset);
    
    if (append) {
      logs.value = [...logs.value, ...response.logs];
    } else {
      logs.value = response.logs;
    }
    
    total.value = response.total;
    offset.value = currentOffset + response.logs.length;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch logs';
    console.error('Error fetching logs:', err);
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return;
  await fetchLogs(true);
}

async function fetchApps() {
  try {
    const response = await getApps();
    apps.value = response.apps;
  } catch (err) {
    console.error('Error fetching apps:', err);
  }
}

async function fetchSessions() {
  try {
    const response = await getSessions(filters.value.appName);
    sessions.value = response.sessions;
  } catch (err) {
    console.error('Error fetching sessions:', err);
  }
}

function handleFilterChange(newFilters: LogFilters) {
  filters.value = newFilters;
  offset.value = 0;
  fetchLogs();
}

function handleLogClick(log: LogEntry) {
  selectedLog.value = log;
  showDetailModal.value = true;
}

function closeModal() {
  showDetailModal.value = false;
  selectedLog.value = null;
}

// Watch for app filter changes to update sessions
watch(() => filters.value.appName, () => {
  fetchSessions();
});

onMounted(() => {
  fetchLogs();
  fetchApps();
  fetchSessions();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Logs</h1>
        <p class="text-gray-400 text-sm mt-1">
          {{ total.toLocaleString() }} logs total
        </p>
      </div>
      
      <div class="flex items-center space-x-4">
        <!-- Live Mode Toggle -->
        <button
          @click="toggleLiveMode"
          :class="[
            'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors',
            isLiveMode
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : 'bg-dark-800 text-gray-400 border border-dark-700'
          ]"
        >
          <span :class="['w-2 h-2 rounded-full', isLiveMode ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-500']"></span>
          <span>{{ isLiveMode ? 'Live' : 'Paused' }}</span>
        </button>
        
        <!-- Connection Status -->
        <div class="flex items-center space-x-2 text-sm">
          <span :class="['w-2 h-2 rounded-full', isConnected ? 'bg-green-500' : 'bg-red-500']"></span>
          <span class="text-gray-400">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <LogFiltersPanel
      :apps="apps"
      :sessions="sessions"
      :initial-filters="filters"
      @filter="handleFilterChange"
    />

    <!-- Error -->
    <div v-if="error" class="bg-red-500/20 border border-red-500/50 text-red-400 p-4 rounded-lg">
      {{ error }}
    </div>

    <!-- Logs List -->
    <LogList
      :logs="logs"
      :loading="loading"
      :has-more="hasMore"
      @load-more="loadMore"
      @log-click="handleLogClick"
    />

    <!-- Detail Modal -->
    <LogDetailModal
      v-if="showDetailModal && selectedLog"
      :log="selectedLog"
      @close="closeModal"
    />
  </div>
</template>
