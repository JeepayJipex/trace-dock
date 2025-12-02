<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getTraces, getTraceStats } from '@/api/traces';
import { getApps } from '@/api/logs';
import type { Trace, TraceFilters, TraceStats, TraceStatus } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';

const traces = ref<Trace[]>([]);
const stats = ref<TraceStats | null>(null);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const offset = ref(0);
const limit = 20;

const filters = ref<TraceFilters>({});

const apps = ref<string[]>([]);

const hasMore = computed(() => traces.value.length < total.value);

const statusOptions: { value: TraceStatus | ''; label: string; color: string }[] = [
  { value: '', label: 'All Statuses', color: 'gray' },
  { value: 'running', label: 'Running', color: 'blue' },
  { value: 'completed', label: 'Completed', color: 'green' },
  { value: 'error', label: 'Error', color: 'red' },
];

function getStatusConfig(status: TraceStatus) {
  const configs = {
    running: {
      label: 'Running',
      bgClass: 'bg-blue-500/20',
      textClass: 'text-blue-400',
      borderClass: 'border-blue-500/30',
      icon: '⏳',
    },
    completed: {
      label: 'Completed',
      bgClass: 'bg-green-500/20',
      textClass: 'text-green-400',
      borderClass: 'border-green-500/30',
      icon: '✓',
    },
    error: {
      label: 'Error',
      bgClass: 'bg-red-500/20',
      textClass: 'text-red-400',
      borderClass: 'border-red-500/30',
      icon: '✗',
    },
  };
  return configs[status];
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}min`;
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
    return format(new Date(timestamp), 'PPpp');
  } catch {
    return timestamp;
  }
}

async function fetchTraces(append = false) {
  loading.value = true;
  error.value = null;

  try {
    const currentOffset = append ? offset.value : 0;
    const response = await getTraces({ ...filters.value, limit, offset: currentOffset });
    
    if (append) {
      traces.value = [...traces.value, ...response.traces];
    } else {
      traces.value = response.traces;
    }
    
    total.value = response.total;
    offset.value = currentOffset + response.traces.length;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch traces';
    console.error('Error fetching traces:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  try {
    stats.value = await getTraceStats();
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function fetchApps() {
  try {
    const response = await getApps();
    apps.value = response.apps;
  } catch (err) {
    console.error('Error fetching apps:', err);
  }
}

async function loadMore() {
  if (loading.value || !hasMore.value) return;
  await fetchTraces(true);
}

watch(filters, () => {
  offset.value = 0;
  fetchTraces();
}, { deep: true });

onMounted(() => {
  fetchTraces();
  fetchStats();
  fetchApps();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Traces</h1>
        <p class="text-gray-500 text-sm mt-1">
          <span class="text-gray-400 font-medium">{{ total.toLocaleString() }}</span> traces
          <template v-if="stats">
            • <span class="text-blue-400 font-medium">{{ formatDuration(stats.avgDurationMs) }}</span> avg duration
          </template>
        </p>
      </div>
    </div>

    <!-- Stats Cards -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-white">{{ stats.totalTraces }}</div>
        <div class="text-sm text-gray-500">Total Traces</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-blue-400">{{ stats.byStatus.running || 0 }}</div>
        <div class="text-sm text-gray-500">Running</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-green-400">{{ stats.byStatus.completed || 0 }}</div>
        <div class="text-sm text-gray-500">Completed</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-red-400">{{ stats.byStatus.error || 0 }}</div>
        <div class="text-sm text-gray-500">Errors</div>
      </div>
    </div>

    <!-- Duration Chart (7-day trend) -->
    <div v-if="stats && stats.recentTrend.length > 0" class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
      <h3 class="text-sm font-medium text-gray-400 mb-4">Trace Activity (Last 7 Days)</h3>
      <div class="h-24 flex items-end gap-2">
        <div
          v-for="day in stats.recentTrend"
          :key="day.date"
          class="flex-1 flex flex-col items-center gap-1"
        >
          <div
            class="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-300"
            :style="{ 
              height: `${Math.max(4, (day.count / Math.max(...stats.recentTrend.map(d => d.count))) * 80)}px` 
            }"
            :title="`${day.date}: ${day.count} traces, avg ${formatDuration(day.avgDuration)}`"
          ></div>
          <span class="text-xs text-gray-600">{{ day.date.slice(5) }}</span>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
      <div class="flex flex-wrap gap-4 items-center">
        <!-- Search -->
        <div class="flex-1 min-w-[200px]">
          <input
            v-model="filters.name"
            type="text"
            placeholder="Search trace names..."
            class="w-full bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
        </div>

        <!-- App Filter -->
        <select
          v-model="filters.appName"
          class="bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">All Apps</option>
          <option v-for="app in apps" :key="app" :value="app">{{ app }}</option>
        </select>

        <!-- Status Filter -->
        <select
          v-model="filters.status"
          class="bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option v-for="option in statusOptions" :key="option.value" :value="option.value || undefined">
            {{ option.label }}
          </option>
        </select>

        <!-- Min Duration -->
        <input
          v-model.number="filters.minDuration"
          type="number"
          placeholder="Min duration (ms)"
          class="w-36 bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />

        <!-- Max Duration -->
        <input
          v-model.number="filters.maxDuration"
          type="number"
          placeholder="Max duration (ms)"
          class="w-36 bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>

    <!-- Error Message -->
    <div 
      v-if="error" 
      class="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl"
    >
      <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- Traces List -->
    <div class="space-y-2">
      <!-- Header Row -->
      <div class="bg-dark-900/30 border border-dark-700/30 rounded-lg px-4 py-2 flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
        <div class="flex-1">Trace</div>
        <div class="w-20 text-center">Spans</div>
        <div class="w-24 text-right">Duration</div>
        <div class="w-32">Started</div>
        <div class="w-24">Status</div>
        <div class="w-20"></div>
      </div>

      <!-- Trace Rows -->
      <div
        v-for="trace in traces"
        :key="trace.id"
        class="bg-dark-900/50 border border-dark-700/50 rounded-lg px-4 py-3 flex items-center gap-4 hover:border-dark-600 transition-colors"
      >
        <!-- Trace Info -->
        <div class="flex-1 min-w-0">
          <RouterLink 
            :to="{ name: 'trace-detail', params: { id: trace.id } }"
            class="text-white font-medium hover:text-blue-400 transition-colors block truncate"
          >
            {{ trace.name }}
          </RouterLink>
          <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span class="text-purple-400">{{ trace.appName }}</span>
            <span>•</span>
            <span class="text-gray-600 font-mono">{{ trace.id.slice(0, 8) }}...</span>
            <template v-if="trace.sessionId">
              <span>•</span>
              <span class="text-gray-600">Session: {{ trace.sessionId.slice(0, 8) }}...</span>
            </template>
          </div>
        </div>

        <!-- Span Count -->
        <div class="w-20 text-center">
          <span class="text-blue-400 font-medium">{{ trace.spanCount }}</span>
          <span v-if="trace.errorCount > 0" class="text-red-400 ml-1">({{ trace.errorCount }} errors)</span>
        </div>

        <!-- Duration -->
        <div class="w-24 text-right">
          <span 
            class="font-mono"
            :class="[
              trace.durationMs && trace.durationMs > 1000 ? 'text-yellow-400' : 
              trace.durationMs && trace.durationMs > 5000 ? 'text-red-400' : 'text-gray-300'
            ]"
          >
            {{ formatDuration(trace.durationMs) }}
          </span>
        </div>

        <!-- Started -->
        <div class="w-32 text-sm text-gray-400" :title="formatFullTime(trace.startTime)">
          {{ formatTime(trace.startTime) }}
        </div>

        <!-- Status -->
        <div class="w-24">
          <span
            :class="[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
              getStatusConfig(trace.status).bgClass,
              getStatusConfig(trace.status).textClass,
              getStatusConfig(trace.status).borderClass,
            ]"
          >
            {{ getStatusConfig(trace.status).icon }}
            {{ getStatusConfig(trace.status).label }}
          </span>
        </div>

        <!-- View Button -->
        <div class="w-20 text-right">
          <RouterLink
            :to="{ name: 'trace-detail', params: { id: trace.id } }"
            class="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors"
          >
            View
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </RouterLink>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!loading && traces.length === 0"
        class="text-center py-12 text-gray-500"
      >
        <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p class="text-lg font-medium">No traces found</p>
        <p class="text-sm mt-1">Start a trace in your app to see it here</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="py-8 text-center">
        <div class="inline-flex items-center gap-2 text-gray-400">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading...
        </div>
      </div>

      <!-- Load More -->
      <div v-if="hasMore && !loading" class="text-center py-4">
        <button
          @click="loadMore"
          class="px-6 py-2 bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors"
        >
          Load More
        </button>
      </div>
    </div>
  </div>
</template>
