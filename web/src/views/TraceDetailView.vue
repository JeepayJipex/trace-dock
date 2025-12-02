<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { getTraceById } from '@/api/traces';
import type { TraceWithDetails, Span, LogEntry, TraceStatus } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';
import LogCard from '@/components/LogCard.vue';
import LogDetailSidebar from '@/components/LogDetailSidebar.vue';

const route = useRoute();

const traceData = ref<TraceWithDetails | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const selectedLog = ref<LogEntry | null>(null);
const selectedSpan = ref<Span | null>(null);
const hoveredSpan = ref<string | null>(null);

// Calculate the timeline scale
const timelineStart = computed(() => {
  if (!traceData.value) return 0;
  return new Date(traceData.value.trace.startTime).getTime();
});

const timelineEnd = computed(() => {
  if (!traceData.value) return 0;
  const trace = traceData.value.trace;
  if (trace.endTime) {
    return new Date(trace.endTime).getTime();
  }
  // If trace not ended, use now or last span end
  const spans = traceData.value.spans;
  if (spans.length > 0) {
    const lastSpanEnd = Math.max(
      ...spans.map(s => s.endTime ? new Date(s.endTime).getTime() : Date.now())
    );
    return lastSpanEnd;
  }
  return Date.now();
});

const timelineDuration = computed(() => {
  return Math.max(1, timelineEnd.value - timelineStart.value);
});

// Build span hierarchy
const spanTree = computed(() => {
  if (!traceData.value) return [];
  
  const spans = traceData.value.spans;
  const spanMap = new Map<string, Span & { children: Span[]; depth: number }>();
  
  // Initialize all spans
  spans.forEach(span => {
    spanMap.set(span.id, { ...span, children: [], depth: 0 });
  });
  
  // Build tree
  const rootSpans: (Span & { children: Span[]; depth: number })[] = [];
  
  spans.forEach(span => {
    const enrichedSpan = spanMap.get(span.id)!;
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      const parent = spanMap.get(span.parentSpanId)!;
      parent.children.push(enrichedSpan);
      enrichedSpan.depth = parent.depth + 1;
    } else {
      rootSpans.push(enrichedSpan);
    }
  });
  
  // Flatten tree in order for display
  const flattenSpans = (spans: (Span & { children: Span[]; depth: number })[]): (Span & { depth: number })[] => {
    const result: (Span & { depth: number })[] = [];
    const sortByStart = (a: Span, b: Span) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    
    spans.sort(sortByStart).forEach(span => {
      result.push(span);
      if (span.children.length > 0) {
        result.push(...flattenSpans(span.children as (Span & { children: Span[]; depth: number })[]));
      }
    });
    
    return result;
  };
  
  return flattenSpans(rootSpans);
});

function getStatusConfig(status: TraceStatus) {
  const configs = {
    running: {
      label: 'Running',
      bgClass: 'bg-blue-500/20',
      textClass: 'text-blue-400',
      borderClass: 'border-blue-500/30',
      barColor: 'bg-blue-500',
    },
    completed: {
      label: 'Completed',
      bgClass: 'bg-green-500/20',
      textClass: 'text-green-400',
      borderClass: 'border-green-500/30',
      barColor: 'bg-green-500',
    },
    error: {
      label: 'Error',
      bgClass: 'bg-red-500/20',
      textClass: 'text-red-400',
      borderClass: 'border-red-500/30',
      barColor: 'bg-red-500',
    },
  };
  return configs[status];
}

function getSpanPosition(span: Span): { left: string; width: string } {
  const start = new Date(span.startTime).getTime();
  const end = span.endTime ? new Date(span.endTime).getTime() : Date.now();
  
  const left = ((start - timelineStart.value) / timelineDuration.value) * 100;
  const width = Math.max(0.5, ((end - start) / timelineDuration.value) * 100);
  
  return {
    left: `${Math.max(0, left)}%`,
    width: `${Math.min(100 - left, width)}%`,
  };
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

function formatTimeOffset(timestamp: string): string {
  const offset = new Date(timestamp).getTime() - timelineStart.value;
  return `+${formatDuration(offset)}`;
}

async function fetchTrace() {
  loading.value = true;
  error.value = null;

  try {
    const id = route.params.id as string;
    traceData.value = await getTraceById(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch trace';
    console.error('Error fetching trace:', err);
  } finally {
    loading.value = false;
  }
}

function handleSpanClick(span: Span) {
  selectedSpan.value = span;
  selectedLog.value = null;
}

function handleLogClick(log: LogEntry) {
  selectedLog.value = log;
  selectedSpan.value = null;
}

function closeSidebar() {
  selectedLog.value = null;
  selectedSpan.value = null;
}

// Keyboard navigation
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSidebar();
  }
}

watch(() => route.params.id, () => {
  fetchTrace();
});

onMounted(() => {
  fetchTrace();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <RouterLink
      to="/traces"
      class="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Traces
    </RouterLink>

    <!-- Loading State -->
    <div v-if="loading" class="py-12 text-center">
      <div class="inline-flex items-center gap-2 text-gray-400">
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading trace...
      </div>
    </div>

    <!-- Error State -->
    <div 
      v-else-if="error" 
      class="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl"
    >
      <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- Trace Details -->
    <template v-else-if="traceData">
      <!-- Header -->
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-purple-400 text-sm font-medium">{{ traceData.trace.appName }}</span>
              <span class="text-dark-500">•</span>
              <span class="text-xs font-mono text-gray-500">{{ traceData.trace.id }}</span>
            </div>
            <h1 class="text-xl font-bold text-white break-words">{{ traceData.trace.name }}</h1>
            <p v-if="traceData.trace.sessionId" class="text-sm text-gray-500 mt-1">
              Session: {{ traceData.trace.sessionId }}
            </p>
          </div>
          
          <!-- Status Badge -->
          <span
            :class="[
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border',
              getStatusConfig(traceData.trace.status).bgClass,
              getStatusConfig(traceData.trace.status).textClass,
              getStatusConfig(traceData.trace.status).borderClass,
            ]"
          >
            {{ getStatusConfig(traceData.trace.status).label }}
          </span>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-2xl font-bold text-white">{{ formatDuration(traceData.trace.durationMs) }}</div>
          <div class="text-sm text-gray-500">Duration</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-2xl font-bold text-blue-400">{{ traceData.trace.spanCount }}</div>
          <div class="text-sm text-gray-500">Spans</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-2xl font-bold text-red-400">{{ traceData.trace.errorCount }}</div>
          <div class="text-sm text-gray-500">Errors</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-sm font-medium text-gray-300" :title="formatFullTime(traceData.trace.startTime)">
            {{ formatTime(traceData.trace.startTime) }}
          </div>
          <div class="text-sm text-gray-500">Started</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-2xl font-bold text-gray-300">{{ traceData.logs.length }}</div>
          <div class="text-sm text-gray-500">Logs</div>
        </div>
      </div>

      <!-- Waterfall Timeline -->
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Waterfall Timeline</h3>
        
        <!-- Timeline Header -->
        <div class="flex items-center text-xs text-gray-500 mb-2 pl-[200px]">
          <span>0ms</span>
          <span class="flex-1 text-center">{{ formatDuration(timelineDuration / 2) }}</span>
          <span>{{ formatDuration(timelineDuration) }}</span>
        </div>

        <!-- Spans -->
        <div class="space-y-1">
          <div
            v-for="span in spanTree"
            :key="span.id"
            class="flex items-center gap-2 py-1 hover:bg-dark-800/50 rounded cursor-pointer transition-colors"
            :class="{ 'bg-dark-800': selectedSpan?.id === span.id }"
            @click="handleSpanClick(span)"
            @mouseenter="hoveredSpan = span.id"
            @mouseleave="hoveredSpan = null"
          >
            <!-- Span Name -->
            <div 
              class="w-[200px] flex-shrink-0 truncate text-sm"
              :style="{ paddingLeft: `${(span as any).depth * 16}px` }"
            >
              <span class="text-gray-300">{{ span.name }}</span>
              <span v-if="span.operationType" class="text-gray-600 text-xs ml-1">({{ span.operationType }})</span>
            </div>

            <!-- Timeline Bar -->
            <div class="flex-1 h-6 relative bg-dark-800/30 rounded">
              <div
                :class="[
                  'absolute h-full rounded transition-all',
                  getStatusConfig(span.status).barColor,
                  hoveredSpan === span.id || selectedSpan?.id === span.id ? 'opacity-100' : 'opacity-70',
                ]"
                :style="getSpanPosition(span)"
              >
                <!-- Duration label inside bar if wide enough -->
                <span 
                  v-if="span.durationMs && span.durationMs > timelineDuration * 0.1"
                  class="absolute inset-0 flex items-center justify-center text-xs text-white font-medium"
                >
                  {{ formatDuration(span.durationMs) }}
                </span>
              </div>
            </div>

            <!-- Duration -->
            <div class="w-20 text-right text-sm font-mono text-gray-400 flex-shrink-0">
              {{ formatDuration(span.durationMs) }}
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="spanTree.length === 0" class="text-center py-8 text-gray-500">
            <p>No spans recorded for this trace</p>
          </div>
        </div>
      </div>

      <!-- Selected Span Details -->
      <div v-if="selectedSpan" class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">Span Details</h3>
          <button @click="selectedSpan = null" class="text-gray-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <div class="text-xs text-gray-500 uppercase">Name</div>
            <div class="text-sm text-white font-medium">{{ selectedSpan.name }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase">Operation Type</div>
            <div class="text-sm text-white font-medium">{{ selectedSpan.operationType || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase">Duration</div>
            <div class="text-sm text-white font-medium">{{ formatDuration(selectedSpan.durationMs) }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase">Status</div>
            <span
              :class="[
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                getStatusConfig(selectedSpan.status).bgClass,
                getStatusConfig(selectedSpan.status).textClass,
              ]"
            >
              {{ getStatusConfig(selectedSpan.status).label }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div class="text-xs text-gray-500 uppercase">Start Time</div>
            <div class="text-sm text-gray-300">
              {{ formatFullTime(selectedSpan.startTime) }}
              <span class="text-gray-500 text-xs">{{ formatTimeOffset(selectedSpan.startTime) }}</span>
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase">End Time</div>
            <div class="text-sm text-gray-300">
              {{ selectedSpan.endTime ? formatFullTime(selectedSpan.endTime) : 'Running...' }}
            </div>
          </div>
        </div>

        <div v-if="selectedSpan.metadata && Object.keys(selectedSpan.metadata).length > 0">
          <div class="text-xs text-gray-500 uppercase mb-2">Metadata</div>
          <pre class="text-sm text-gray-300 font-mono bg-dark-950/50 rounded-lg p-4 overflow-x-auto">{{ JSON.stringify(selectedSpan.metadata, null, 2) }}</pre>
        </div>
      </div>

      <!-- Logs -->
      <div v-if="traceData.logs.length > 0" class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-6">
        <h3 class="text-lg font-semibold text-white mb-4">
          Logs
          <span class="text-gray-500 font-normal">({{ traceData.logs.length }})</span>
        </h3>
        
        <div class="space-y-2">
          <LogCard
            v-for="log in traceData.logs"
            :key="log.id"
            :log="log"
            :is-selected="selectedLog?.id === log.id"
            @select="handleLogClick"
          />
        </div>
      </div>
    </template>

    <!-- Detail Sidebar for Logs -->
    <LogDetailSidebar
      :log="selectedLog"
      @close="closeSidebar"
    />
  </div>
</template>
