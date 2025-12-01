<script setup lang="ts">
import type { LogEntry } from '@/types';
import LogCard from './LogCard.vue';

defineProps<{
  logs: LogEntry[];
  loading: boolean;
  hasMore: boolean;
  selectedLogId?: string | null;
}>();

const emit = defineEmits<{
  loadMore: [];
  logClick: [log: LogEntry];
  filter: [key: string, value: string];
}>();
</script>

<template>
  <div class="space-y-2">
    <!-- Log Entries -->
    <LogCard
      v-for="log in logs"
      :key="log.id"
      :log="log"
      :is-selected="selectedLogId === log.id"
      @select="emit('logClick', $event)"
      @filter="(key, value) => emit('filter', key, value)"
      class="log-entry-new"
    />

    <!-- Empty State -->
    <div v-if="!loading && logs.length === 0" class="text-center py-16">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-dark-800/50 mb-4">
        <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <p class="text-gray-400 font-medium">No logs found</p>
      <p class="text-gray-600 text-sm mt-1">Logs will appear here when your application sends them</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
        <span class="text-gray-400 text-sm">Loading logs...</span>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="hasMore && !loading" class="text-center py-4">
      <button
        @click="emit('loadMore')"
        class="inline-flex items-center gap-2 bg-dark-800/50 hover:bg-dark-700/50 text-gray-400 hover:text-white px-5 py-2.5 rounded-lg transition-all border border-dark-700/50 hover:border-dark-600"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
        Load more
      </button>
    </div>
  </div>
</template>
