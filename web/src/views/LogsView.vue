<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useLogsQuery } from '@/composables/useLogsQuery';
import { useWebSocket } from '@/composables/useWebSocket';
import type { LogEntry, LogFilters } from '@/types';
import LogList from '@/components/LogList.vue';
import SearchBar from '@/components/SearchBar.vue';
import LogDetailSidebar from '@/components/LogDetailSidebar.vue';

// Use the query composable
const {
  filters,
  logs,
  total,
  ignoredCount,
  apps,
  sessions,
  hasMore,
  isLoading,
  isFetching,
  hideIgnoredErrors,
  pollingEnabled,
  setFilters,
  loadMore,
  toggleHideIgnored,
  togglePolling,
  addLog,
  hasActiveFilters,
} = useLogsQuery({ syncToUrl: true });

const selectedLog = ref<LogEntry | null>(null);
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);

// WebSocket for live updates
const { isConnected, isLiveMode, toggleLiveMode } = useWebSocket((log: LogEntry) => {
  // Add new log via the query composable
  if (isLiveMode.value) {
    addLog(log);
  }
});

const selectedLogIndex = computed(() => {
  if (!selectedLog.value) return -1;
  return logs.value.findIndex(l => l.id === selectedLog.value?.id);
});

function handleFilterChange(newFilters: LogFilters) {
  setFilters(newFilters);
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
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
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
          <span v-if="isFetching && !isLoading" class="ml-2 text-blue-400">
            <svg class="inline w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </span>
        </p>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- Polling Toggle -->
        <button
          @click="togglePolling"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm',
            pollingEnabled
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
              : 'bg-dark-800/50 text-gray-400 border border-dark-700/50 hover:bg-dark-700/50'
          ]"
          title="Auto-refresh every 5 seconds"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ pollingEnabled ? 'Auto' : 'Manual' }}
        </button>

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

    <!-- Active Filters Indicator -->
    <div v-if="hasActiveFilters" class="flex items-center gap-2 text-sm text-blue-400">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span>Filters synced to URL - share this link!</span>
    </div>

    <!-- Hide Ignored Toggle + Ignored Count Banner -->
    <div class="flex items-center justify-between bg-dark-900/30 border border-dark-700/30 rounded-lg px-4 py-3">
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            :checked="hideIgnoredErrors"
            @change="toggleHideIgnored"
            class="rounded bg-dark-700 border-dark-600 text-blue-500 focus:ring-blue-500/50"
          />
          <span class="text-sm text-gray-400">Hide ignored errors</span>
        </label>
      </div>
      
      <!-- Ignored Count Indicator -->
      <div v-if="hideIgnoredErrors && ignoredCount > 0" class="flex items-center gap-2">
        <span class="text-sm text-gray-500">
          <span class="text-gray-400 font-medium">{{ ignoredCount }}</span> ignored error(s) hidden
        </span>
        <RouterLink
          to="/errors?status=ignored"
          class="text-sm text-blue-400 hover:text-blue-300 hover:underline transition-colors"
        >
          View all →
        </RouterLink>
      </div>
    </div>

    <!-- Logs List -->
    <LogList
      :logs="logs"
      :loading="isLoading"
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
