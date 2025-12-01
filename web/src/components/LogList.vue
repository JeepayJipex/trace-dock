<script setup lang="ts">
import type { LogEntry } from '@/types';
import { formatDistanceToNow } from 'date-fns';

defineProps<{
  logs: LogEntry[];
  loading: boolean;
  hasMore: boolean;
}>();

const emit = defineEmits<{
  loadMore: [];
  logClick: [log: LogEntry];
}>();

function getLevelClass(level: string): string {
  const classes: Record<string, string> = {
    debug: 'log-level-debug',
    info: 'log-level-info',
    warn: 'log-level-warn',
    error: 'log-level-error',
  };
  return classes[level] || 'log-level-debug';
}

function formatTime(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return timestamp;
  }
}

function formatFullTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Log Entries -->
    <div
      v-for="log in logs"
      :key="log.id"
      @click="emit('logClick', log)"
      class="bg-dark-900 border border-dark-700 rounded-lg p-4 hover:bg-dark-800 cursor-pointer transition-colors log-entry-new"
    >
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <!-- Header -->
          <div class="flex items-center gap-3 mb-2">
            <span
              :class="[getLevelClass(log.level), 'px-2 py-0.5 rounded text-xs font-medium uppercase']"
            >
              {{ log.level }}
            </span>
            <span class="text-gray-500 text-sm" :title="formatFullTime(log.timestamp)">
              {{ formatTime(log.timestamp) }}
            </span>
            <span class="text-gray-600 text-sm">•</span>
            <span class="text-purple-400 text-sm font-medium">{{ log.appName }}</span>
          </div>
          
          <!-- Message -->
          <p class="text-white font-medium truncate">{{ log.message }}</p>
          
          <!-- Metadata Preview -->
          <div v-if="log.metadata && Object.keys(log.metadata).length > 0" class="mt-2">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(value, key) in log.metadata"
                :key="key"
                class="bg-dark-700 text-gray-400 px-2 py-0.5 rounded text-xs"
              >
                {{ key }}: {{ typeof value === 'object' ? JSON.stringify(value) : value }}
              </span>
            </div>
          </div>
        </div>
        
        <!-- Environment Badge -->
        <div class="flex-shrink-0">
          <span class="bg-dark-700 text-gray-400 px-2 py-1 rounded text-xs">
            {{ log.environment.type }}
          </span>
        </div>
      </div>
      
      <!-- Stack Trace Indicator -->
      <div v-if="log.stackTrace" class="mt-2 flex items-center gap-2 text-red-400 text-xs">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Has stack trace</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!loading && logs.length === 0" class="text-center py-12">
      <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="text-gray-400">No logs found</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>

    <!-- Load More -->
    <div v-if="hasMore && !loading" class="text-center py-4">
      <button
        @click="emit('loadMore')"
        class="bg-dark-800 hover:bg-dark-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
      >
        Load More
      </button>
    </div>
  </div>
</template>
