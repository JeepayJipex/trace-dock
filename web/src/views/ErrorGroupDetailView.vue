<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { getErrorGroup, getErrorGroupOccurrences, updateErrorGroupStatus } from '@/api/errors';
import type { ErrorGroup, ErrorGroupStatus, LogEntry } from '@/types';
import { formatDistanceToNow, format, parseISO, eachDayOfInterval, subDays } from 'date-fns';
import LogCard from '@/components/LogCard.vue';
import LogDetailSidebar from '@/components/LogDetailSidebar.vue';

const route = useRoute();

const errorGroup = ref<ErrorGroup | null>(null);
const occurrences = ref<LogEntry[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingOccurrences = ref(false);
const error = ref<string | null>(null);
const offset = ref(0);
const limit = 20;

const selectedLog = ref<LogEntry | null>(null);

// Stats computed from occurrences
const occurrencesByDay = computed(() => {
  if (occurrences.value.length === 0) return [];
  
  const last7Days = eachDayOfInterval({
    start: subDays(new Date(), 6),
    end: new Date(),
  });
  
  const countByDay = new Map<string, number>();
  last7Days.forEach(day => {
    countByDay.set(format(day, 'yyyy-MM-dd'), 0);
  });
  
  occurrences.value.forEach(log => {
    const day = format(parseISO(log.timestamp), 'yyyy-MM-dd');
    if (countByDay.has(day)) {
      countByDay.set(day, (countByDay.get(day) || 0) + 1);
    }
  });
  
  return last7Days.map(day => ({
    date: format(day, 'MMM d'),
    fullDate: format(day, 'yyyy-MM-dd'),
    count: countByDay.get(format(day, 'yyyy-MM-dd')) || 0,
  }));
});

const maxOccurrenceCount = computed(() => {
  return Math.max(...occurrencesByDay.value.map(d => d.count), 1);
});

const hasMore = computed(() => occurrences.value.length < total.value);

const selectedLogIndex = computed(() => {
  if (!selectedLog.value) return -1;
  return occurrences.value.findIndex(l => l.id === selectedLog.value?.id);
});

function getStatusConfig(status: ErrorGroupStatus) {
  const configs = {
    unreviewed: {
      label: 'Unreviewed',
      bgClass: 'bg-blue-500/20',
      textClass: 'text-blue-400',
      borderClass: 'border-blue-500/30',
    },
    reviewed: {
      label: 'Reviewed',
      bgClass: 'bg-yellow-500/20',
      textClass: 'text-yellow-400',
      borderClass: 'border-yellow-500/30',
    },
    ignored: {
      label: 'Ignored',
      bgClass: 'bg-gray-500/20',
      textClass: 'text-gray-400',
      borderClass: 'border-gray-500/30',
    },
    resolved: {
      label: 'Resolved',
      bgClass: 'bg-green-500/20',
      textClass: 'text-green-400',
      borderClass: 'border-green-500/30',
    },
  };
  return configs[status];
}

async function fetchErrorGroup() {
  loading.value = true;
  error.value = null;

  try {
    const id = route.params.id as string;
    errorGroup.value = await getErrorGroup(id);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch error group';
    console.error('Error fetching error group:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchOccurrences(append = false) {
  loadingOccurrences.value = true;

  try {
    const id = route.params.id as string;
    const currentOffset = append ? offset.value : 0;
    const response = await getErrorGroupOccurrences(id, limit, currentOffset);
    
    if (append) {
      occurrences.value = [...occurrences.value, ...response.logs];
    } else {
      occurrences.value = response.logs;
    }
    
    total.value = response.total;
    offset.value = currentOffset + response.logs.length;
  } catch (err) {
    console.error('Error fetching occurrences:', err);
  } finally {
    loadingOccurrences.value = false;
  }
}

async function loadMore() {
  if (loadingOccurrences.value || !hasMore.value) return;
  await fetchOccurrences(true);
}

async function handleStatusChange(newStatus: ErrorGroupStatus) {
  if (!errorGroup.value) return;
  
  try {
    await updateErrorGroupStatus(errorGroup.value.id, newStatus);
    errorGroup.value.status = newStatus;
  } catch (err) {
    console.error('Error updating status:', err);
  }
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
    selectedLog.value = occurrences.value[currentIndex - 1];
  } else if (direction === 'next' && currentIndex < occurrences.value.length - 1) {
    selectedLog.value = occurrences.value[currentIndex + 1];
  }
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

watch(() => route.params.id, () => {
  fetchErrorGroup();
  fetchOccurrences();
});

onMounted(() => {
  fetchErrorGroup();
  fetchOccurrences();
  window.addEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Back Button -->
    <RouterLink
      to="/errors"
      class="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Error Groups
    </RouterLink>

    <!-- Loading State -->
    <div v-if="loading" class="py-12 text-center">
      <div class="inline-flex items-center gap-2 text-gray-400">
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading error group...
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

    <!-- Error Group Details -->
    <template v-else-if="errorGroup">
      <!-- Header -->
      <div class="bg-dark-900/50 border border-red-500/30 rounded-xl p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-purple-400 text-sm font-medium">{{ errorGroup.appName }}</span>
              <span class="text-dark-500">•</span>
              <span class="text-xs font-mono text-gray-500">{{ errorGroup.fingerprint }}</span>
            </div>
            <h1 class="text-xl font-bold text-white break-words">{{ errorGroup.message }}</h1>
          </div>
          
          <!-- Status Selector -->
          <select
            :value="errorGroup.status"
            @change="(e) => handleStatusChange((e.target as HTMLSelectElement).value as ErrorGroupStatus)"
            :class="[
              'rounded-lg px-4 py-2 text-sm font-medium border cursor-pointer min-w-[140px]',
              getStatusConfig(errorGroup.status).bgClass,
              getStatusConfig(errorGroup.status).textClass,
              getStatusConfig(errorGroup.status).borderClass,
            ]"
          >
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
            <option value="ignored">Ignored</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <!-- Stack Trace Preview -->
        <div v-if="errorGroup.stackTracePreview" class="mt-4">
          <pre class="text-sm text-red-300/70 font-mono bg-dark-950/50 rounded-lg p-4 overflow-x-auto">{{ errorGroup.stackTracePreview }}</pre>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-3xl font-bold text-red-400">{{ errorGroup.occurrenceCount }}</div>
          <div class="text-sm text-gray-500">Total Occurrences</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-sm font-medium text-gray-300" :title="formatFullTime(errorGroup.firstSeen)">
            {{ formatTime(errorGroup.firstSeen) }}
          </div>
          <div class="text-sm text-gray-500">First Seen</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div class="text-sm font-medium text-gray-300" :title="formatFullTime(errorGroup.lastSeen)">
            {{ formatTime(errorGroup.lastSeen) }}
          </div>
          <div class="text-sm text-gray-500">Last Seen</div>
        </div>
        <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
          <div :class="['text-sm font-medium', getStatusConfig(errorGroup.status).textClass]">
            {{ getStatusConfig(errorGroup.status).label }}
          </div>
          <div class="text-sm text-gray-500">Status</div>
        </div>
      </div>

      <!-- Occurrence Chart (Simple Bar Chart) -->
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Occurrences (Last 7 Days)</h3>
        <div class="flex items-end gap-2 h-32">
          <div
            v-for="day in occurrencesByDay"
            :key="day.fullDate"
            class="flex-1 flex flex-col items-center gap-2"
          >
            <div
              class="w-full bg-red-500/30 rounded-t transition-all hover:bg-red-500/50"
              :style="{ height: `${(day.count / maxOccurrenceCount) * 100}%`, minHeight: day.count > 0 ? '4px' : '0' }"
              :title="`${day.count} occurrences on ${day.fullDate}`"
            ></div>
            <span class="text-xs text-gray-500">{{ day.date }}</span>
          </div>
        </div>
      </div>

      <!-- Occurrences List -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-white">
            Occurrences
            <span class="text-gray-500 font-normal">({{ total }})</span>
          </h3>
        </div>

        <div class="space-y-2">
          <LogCard
            v-for="log in occurrences"
            :key="log.id"
            :log="log"
            :is-selected="selectedLog?.id === log.id"
            @select="handleLogClick"
          />

          <!-- Loading -->
          <div v-if="loadingOccurrences" class="py-4 text-center">
            <div class="inline-flex items-center gap-2 text-gray-400">
              <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading...
            </div>
          </div>

          <!-- Load More -->
          <div v-if="hasMore && !loadingOccurrences" class="text-center py-4">
            <button
              @click="loadMore"
              class="px-6 py-2 bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors"
            >
              Load More
            </button>
          </div>

          <!-- Empty State -->
          <div
            v-if="!loadingOccurrences && occurrences.length === 0"
            class="text-center py-8 text-gray-500"
          >
            <p>No occurrences found</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Detail Sidebar -->
    <LogDetailSidebar
      :log="selectedLog"
      @close="closeSidebar"
      @navigate="navigateLog"
    />
  </div>
</template>
