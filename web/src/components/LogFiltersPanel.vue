<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LogFilters, LogLevel } from '@/types';

const props = defineProps<{
  apps: string[];
  sessions: string[];
  initialFilters: LogFilters;
}>();

const emit = defineEmits<{
  filter: [filters: LogFilters];
}>();

const level = ref<LogLevel | ''>(props.initialFilters.level || '');
const appName = ref(props.initialFilters.appName || '');
const sessionId = ref(props.initialFilters.sessionId || '');
const search = ref(props.initialFilters.search || '');
const startDate = ref(props.initialFilters.startDate ? props.initialFilters.startDate.slice(0, 16) : '');
const endDate = ref(props.initialFilters.endDate ? props.initialFilters.endDate.slice(0, 16) : '');

const levels: { value: LogLevel; label: string; icon: string }[] = [
  { value: 'error', label: 'Error', icon: '🔴' },
  { value: 'warn', label: 'Warn', icon: '🟠' },
  { value: 'info', label: 'Info', icon: '🔵' },
  { value: 'debug', label: 'Debug', icon: '🟣' },
];

const hasActiveFilters = () => {
  return level.value || appName.value || sessionId.value || search.value || startDate.value || endDate.value;
};

function applyFilters() {
  const filters: LogFilters = {};
  
  if (level.value) filters.level = level.value;
  if (appName.value) filters.appName = appName.value;
  if (sessionId.value) filters.sessionId = sessionId.value;
  if (search.value) filters.search = search.value;
  if (startDate.value) filters.startDate = new Date(startDate.value).toISOString();
  if (endDate.value) filters.endDate = new Date(endDate.value).toISOString();
  
  emit('filter', filters);
}

function resetFilters() {
  level.value = '';
  appName.value = '';
  sessionId.value = '';
  search.value = '';
  startDate.value = '';
  endDate.value = '';
  emit('filter', {});
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
});
</script>

<template>
  <div class="bg-dark-900/50 border border-dark-700/50 rounded-xl p-5 space-y-4">
    <!-- Row 1: Search (full width) -->
    <div>
      <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
        Search
      </label>
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="search"
          type="text"
          placeholder="Search in messages, metadata, stack traces..."
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
        />
      </div>
    </div>

    <!-- Row 2: Level | App | Session -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Level -->
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Level
        </label>
        <select
          v-model="level"
          @change="applyFilters"
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all appearance-none cursor-pointer"
        >
          <option value="">All levels</option>
          <option v-for="l in levels" :key="l.value" :value="l.value">
            {{ l.icon }} {{ l.label }}
          </option>
        </select>
      </div>

      <!-- App Name -->
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Application
        </label>
        <select
          v-model="appName"
          @change="applyFilters"
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all appearance-none cursor-pointer"
        >
          <option value="">All applications</option>
          <option v-for="app in apps" :key="app" :value="app">
            {{ app }}
          </option>
        </select>
      </div>

      <!-- Session -->
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          Session
        </label>
        <select
          v-model="sessionId"
          @change="applyFilters"
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all appearance-none cursor-pointer"
        >
          <option value="">All sessions</option>
          <option v-for="session in sessions" :key="session" :value="session">
            {{ session.slice(0, 8) }}...
          </option>
        </select>
      </div>
    </div>

    <!-- Row 3: Date Range + Reset -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          From
        </label>
        <input
          v-model="startDate"
          type="datetime-local"
          @change="applyFilters"
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
        />
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
          To
        </label>
        <input
          v-model="endDate"
          type="datetime-local"
          @change="applyFilters"
          class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
        />
      </div>
      <div class="md:col-span-2 flex justify-end">
        <button
          v-if="hasActiveFilters()"
          @click="resetFilters"
          class="flex items-center gap-2 bg-dark-700/50 hover:bg-dark-600/50 text-gray-400 hover:text-white px-4 py-2.5 rounded-lg transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reset filters
        </button>
      </div>
    </div>
  </div>
</template>
