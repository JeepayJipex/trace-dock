<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { getErrorGroups, getErrorGroupStats, updateErrorGroupStatus } from '@/api/errors';
import { getApps } from '@/api/logs';
import type { ErrorGroup, ErrorGroupFilters, ErrorGroupStats, ErrorGroupStatus } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';

const errorGroups = ref<ErrorGroup[]>([]);
const stats = ref<ErrorGroupStats | null>(null);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const offset = ref(0);
const limit = 20;

const filters = ref<ErrorGroupFilters>({
  sortBy: 'last_seen',
  sortOrder: 'desc',
});

const apps = ref<string[]>([]);
const selectedGroups = ref<Set<string>>(new Set());

const hasMore = computed(() => errorGroups.value.length < total.value);

const statusOptions: { value: ErrorGroupStatus | ''; label: string; color: string }[] = [
  { value: '', label: 'All Statuses', color: 'gray' },
  { value: 'unreviewed', label: 'Unreviewed', color: 'blue' },
  { value: 'reviewed', label: 'Reviewed', color: 'yellow' },
  { value: 'ignored', label: 'Ignored', color: 'gray' },
  { value: 'resolved', label: 'Resolved', color: 'green' },
];

const sortOptions = [
  { value: 'last_seen', label: 'Last Seen' },
  { value: 'first_seen', label: 'First Seen' },
  { value: 'occurrence_count', label: 'Occurrences' },
];

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

async function fetchErrorGroups(append = false) {
  loading.value = true;
  error.value = null;

  try {
    const currentOffset = append ? offset.value : 0;
    const response = await getErrorGroups(filters.value, limit, currentOffset);
    
    if (append) {
      errorGroups.value = [...errorGroups.value, ...response.errorGroups];
    } else {
      errorGroups.value = response.errorGroups;
    }
    
    total.value = response.total;
    offset.value = currentOffset + response.errorGroups.length;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch error groups';
    console.error('Error fetching error groups:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  try {
    stats.value = await getErrorGroupStats();
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
  await fetchErrorGroups(true);
}

async function handleStatusChange(groupId: string, newStatus: ErrorGroupStatus) {
  try {
    await updateErrorGroupStatus(groupId, newStatus);
    // Update local state
    const group = errorGroups.value.find(g => g.id === groupId);
    if (group) {
      group.status = newStatus;
    }
    // Refresh stats
    await fetchStats();
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

async function handleBulkStatusChange(newStatus: ErrorGroupStatus) {
  if (selectedGroups.value.size === 0) return;
  
  try {
    const promises = Array.from(selectedGroups.value).map(id => 
      updateErrorGroupStatus(id, newStatus)
    );
    await Promise.all(promises);
    
    // Update local state
    errorGroups.value.forEach(group => {
      if (selectedGroups.value.has(group.id)) {
        group.status = newStatus;
      }
    });
    
    selectedGroups.value.clear();
    await fetchStats();
  } catch (err) {
    console.error('Error updating statuses:', err);
  }
}

function toggleSelectAll() {
  if (selectedGroups.value.size === errorGroups.value.length) {
    selectedGroups.value.clear();
  } else {
    selectedGroups.value = new Set(errorGroups.value.map(g => g.id));
  }
}

function toggleSelect(groupId: string) {
  if (selectedGroups.value.has(groupId)) {
    selectedGroups.value.delete(groupId);
  } else {
    selectedGroups.value.add(groupId);
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

function truncateMessage(message: string, maxLength = 100): string {
  const firstLine = message.split('\n')[0];
  return firstLine.length > maxLength ? firstLine.slice(0, maxLength) + '...' : firstLine;
}

watch(filters, () => {
  offset.value = 0;
  fetchErrorGroups();
}, { deep: true });

onMounted(() => {
  fetchErrorGroups();
  fetchStats();
  fetchApps();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">Error Groups</h1>
        <p class="text-gray-500 text-sm mt-1">
          <span class="text-gray-400 font-medium">{{ total.toLocaleString() }}</span> error groups
          <template v-if="stats">
            • <span class="text-red-400 font-medium">{{ stats.totalOccurrences.toLocaleString() }}</span> total occurrences
          </template>
        </p>
      </div>
    </div>

    <!-- Stats Cards -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-blue-400">{{ stats.byStatus.unreviewed }}</div>
        <div class="text-sm text-gray-500">Unreviewed</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-yellow-400">{{ stats.byStatus.reviewed }}</div>
        <div class="text-sm text-gray-500">Reviewed</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-green-400">{{ stats.byStatus.resolved }}</div>
        <div class="text-sm text-gray-500">Resolved</div>
      </div>
      <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
        <div class="text-2xl font-bold text-gray-400">{{ stats.byStatus.ignored }}</div>
        <div class="text-sm text-gray-500">Ignored</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4">
      <div class="flex flex-wrap gap-4 items-center">
        <!-- Search -->
        <div class="flex-1 min-w-[200px]">
          <input
            v-model="filters.search"
            type="text"
            placeholder="Search error messages..."
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

        <!-- Sort -->
        <select
          v-model="filters.sortBy"
          class="bg-dark-800 border border-dark-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option v-for="option in sortOptions" :key="option.value" :value="option.value">
            Sort by {{ option.label }}
          </option>
        </select>

        <!-- Sort Order -->
        <button
          @click="filters.sortOrder = filters.sortOrder === 'desc' ? 'asc' : 'desc'"
          class="bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white hover:bg-dark-700 transition-colors"
          :title="filters.sortOrder === 'desc' ? 'Descending' : 'Ascending'"
        >
          <svg v-if="filters.sortOrder === 'desc'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      <!-- Bulk Actions -->
      <div v-if="selectedGroups.size > 0" class="mt-4 flex items-center gap-4 pt-4 border-t border-dark-700/50">
        <span class="text-sm text-gray-400">
          {{ selectedGroups.size }} selected
        </span>
        <button
          @click="handleBulkStatusChange('reviewed')"
          class="px-3 py-1.5 text-sm bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
        >
          Mark Reviewed
        </button>
        <button
          @click="handleBulkStatusChange('ignored')"
          class="px-3 py-1.5 text-sm bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 transition-colors"
        >
          Ignore
        </button>
        <button
          @click="handleBulkStatusChange('resolved')"
          class="px-3 py-1.5 text-sm bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
        >
          Mark Resolved
        </button>
        <button
          @click="selectedGroups.clear()"
          class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear Selection
        </button>
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

    <!-- Error Groups List -->
    <div class="space-y-2">
      <!-- Header Row -->
      <div class="bg-dark-900/30 border border-dark-700/30 rounded-lg px-4 py-2 flex items-center gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
        <div class="w-8">
          <input
            type="checkbox"
            :checked="selectedGroups.size === errorGroups.length && errorGroups.length > 0"
            :indeterminate="selectedGroups.size > 0 && selectedGroups.size < errorGroups.length"
            @change="toggleSelectAll"
            class="rounded bg-dark-700 border-dark-600 text-blue-500 focus:ring-blue-500/50"
          />
        </div>
        <div class="flex-1">Error</div>
        <div class="w-24 text-center">Occurrences</div>
        <div class="w-32">Last Seen</div>
        <div class="w-28">Status</div>
        <div class="w-20"></div>
      </div>

      <!-- Error Group Rows -->
      <div
        v-for="group in errorGroups"
        :key="group.id"
        class="bg-dark-900/50 border border-dark-700/50 rounded-lg hover:border-dark-600 transition-colors"
      >
        <div class="px-4 py-3 flex items-center gap-4">
          <!-- Checkbox -->
          <div class="w-8">
            <input
              type="checkbox"
              :checked="selectedGroups.has(group.id)"
              @change="toggleSelect(group.id)"
              class="rounded bg-dark-700 border-dark-600 text-blue-500 focus:ring-blue-500/50"
            />
          </div>

          <!-- Error Info -->
          <div class="flex-1 min-w-0">
            <RouterLink 
              :to="{ name: 'error-group-detail', params: { id: group.id } }"
              class="text-white font-medium hover:text-blue-400 transition-colors block truncate"
            >
              {{ truncateMessage(group.message) }}
            </RouterLink>
            <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span class="text-purple-400">{{ group.appName }}</span>
              <span>•</span>
              <span :title="formatFullTime(group.firstSeen)">
                First seen {{ formatTime(group.firstSeen) }}
              </span>
            </div>
          </div>

          <!-- Occurrences -->
          <div class="w-24 text-center">
            <span class="text-red-400 font-bold text-lg">{{ group.occurrenceCount }}</span>
          </div>

          <!-- Last Seen -->
          <div class="w-32 text-sm text-gray-400" :title="formatFullTime(group.lastSeen)">
            {{ formatTime(group.lastSeen) }}
          </div>

          <!-- Status -->
          <div class="w-28">
            <select
              :value="group.status"
              @change="(e) => handleStatusChange(group.id, (e.target as HTMLSelectElement).value as ErrorGroupStatus)"
              :class="[
                'w-full rounded-lg px-2 py-1 text-xs font-medium border cursor-pointer',
                getStatusConfig(group.status).bgClass,
                getStatusConfig(group.status).textClass,
                getStatusConfig(group.status).borderClass,
              ]"
            >
              <option value="unreviewed">Unreviewed</option>
              <option value="reviewed">Reviewed</option>
              <option value="ignored">Ignored</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <!-- View Button -->
          <div class="w-20 text-right">
            <RouterLink
              :to="{ name: 'error-group-detail', params: { id: group.id } }"
              class="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-dark-800 text-gray-300 rounded-lg hover:bg-dark-700 hover:text-white transition-colors"
            >
              View
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </RouterLink>
          </div>
        </div>

        <!-- Stack Trace Preview -->
        <div v-if="group.stackTracePreview" class="px-4 pb-3">
          <pre class="text-xs text-red-300/60 font-mono bg-dark-950/50 rounded p-2 overflow-x-auto max-h-16">{{ group.stackTracePreview }}</pre>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="!loading && errorGroups.length === 0"
        class="text-center py-12 text-gray-500"
      >
        <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-lg font-medium">No error groups found</p>
        <p class="text-sm mt-1">Errors will appear here when they are logged</p>
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
