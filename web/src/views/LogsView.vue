<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getLogs, getApps, getSessions } from '@/api/logs';
import { useWebSocket } from '@/composables/useWebSocket';
import type { LogEntry, LogFilters } from '@/types';
import LogList from '@/components/LogList.vue';
import SearchBar from '@/components/SearchBar.vue';
import LogDetailSidebar from '@/components/LogDetailSidebar.vue';

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
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);

// WebSocket for live updates
const { isConnected, isLiveMode, toggleLiveMode } = useWebSocket((log: LogEntry) => {
  // Add new log at the beginning
  logs.value = [log, ...logs.value].slice(0, 500);
  total.value++;
});

const hasMore = computed(() => logs.value.length < total.value);

const selectedLogIndex = computed(() => {
  if (!selectedLog.value) return -1;
  return logs.value.findIndex(l => l.id === selectedLog.value?.id);
});

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
}

function closeSidebar() {
  selectedLog.value = null;
}

function navigateLog(direction: 'prev' | 'next') {
  const currentIndex = selectedLogIndex.value;
  if (currentIndex === -1) return;
  
  if (direction === 'prev' && currentIndex > 0) {
    selectedLog.value = logs.value[currentIndex - 1];
  } else if (direction === 'next' && currentIndex < logs.value.length - 1) {
    selectedLog.value = logs.value[currentIndex + 1];
  }
}

// Handle filter clicks from LogCard/LogList
function handleAddFilter(key: string, value: string) {
  if (searchBarRef.value) {
    searchBarRef.value.addFilter(key, value);
  }
}

// Watch for app filter changes to update sessions
watch(() => filters.value.appName, () => {
  fetchSessions();
});

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (!selectedLog.value) return;
  
  if (event.key === 'Escape') {
    closeSidebar();
  } else if (event.key === 'ArrowUp' || event.key === 'k') {
    event.preventDefault();
    navigateLog('prev');
  } else if (event.key === 'ArrowDown' || event.key === 'j') {
    event.preventDefault();
    navigateLog('next');
  }
}

onMounted(() => {
  fetchLogs();
  fetchApps();
  fetchSessions();
  window.addEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Logs</h1>
        <p class="text-gray-500 text-sm mt-1">
          <span class="text-gray-400 font-medium">{{ total.toLocaleString() }}</span> logs total
        </p>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- Live Mode Toggle -->
        <button
          @click="toggleLiveMode"
          :class="[
            'flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm',
            isLiveMode
              ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/20'
              : 'bg-dark-800/50 text-gray-400 border border-dark-700/50 hover:bg-dark-700/50'
          ]"
        >
          <span 
            :class="[
              'w-2 h-2 rounded-full transition-all',
              isLiveMode ? 'bg-green-500 animate-pulse-dot' : 'bg-gray-500'
            ]"
          ></span>
          {{ isLiveMode ? 'Live' : 'Paused' }}
        </button>
        
        <!-- Connection Status -->
        <div 
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
            isConnected 
              ? 'bg-dark-800/30 text-gray-400' 
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          ]"
        >
          <span 
            :class="[
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            ]"
          ></span>
          {{ isConnected ? 'Connected' : 'Disconnected' }}
        </div>
      </div>
    </div>

    <!-- Filters -->
    <SearchBar
      ref="searchBarRef"
      v-model="filters"
      :apps="apps"
      :sessions="sessions"
      @update:model-value="handleFilterChange"
    />

    <!-- Error -->
    <div 
      v-if="error" 
      class="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl"
    >
      <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- Logs List -->
    <LogList
      :logs="logs"
      :loading="loading"
      :has-more="hasMore"
      :selected-log-id="selectedLog?.id"
      @load-more="loadMore"
      @log-click="handleLogClick"
      @filter="handleAddFilter"
    />

    <!-- Detail Sidebar -->
    <LogDetailSidebar
      :log="selectedLog"
      @close="closeSidebar"
      @navigate="navigateLog"
      @filter="handleAddFilter"
    />
  </div>
</template>
