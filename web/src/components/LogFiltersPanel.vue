<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LogFilters, LogLevel } from '@/types';

defineProps<{
  apps: string[];
  sessions: string[];
  initialFilters: LogFilters;
}>();

const emit = defineEmits<{
  filter: [filters: LogFilters];
}>();

const level = ref<LogLevel | ''>('');
const appName = ref('');
const sessionId = ref('');
const search = ref('');
const startDate = ref('');
const endDate = ref('');

const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];

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

function clearFilters() {
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
  <div class="bg-dark-900 border border-dark-700 rounded-lg p-4">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      <!-- Search -->
      <div class="lg:col-span-2">
        <label class="block text-sm font-medium text-gray-400 mb-1">Search</label>
        <input
          v-model="search"
          type="text"
          placeholder="Search logs..."
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Level -->
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-1">Level</label>
        <select
          v-model="level"
          @change="applyFilters"
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All levels</option>
          <option v-for="l in levels" :key="l" :value="l" class="capitalize">
            {{ l }}
          </option>
        </select>
      </div>

      <!-- App Name -->
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-1">App</label>
        <select
          v-model="appName"
          @change="applyFilters"
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All apps</option>
          <option v-for="app in apps" :key="app" :value="app">
            {{ app }}
          </option>
        </select>
      </div>

      <!-- Session -->
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-1">Session</label>
        <select
          v-model="sessionId"
          @change="applyFilters"
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">All sessions</option>
          <option v-for="session in sessions" :key="session" :value="session">
            {{ session.slice(0, 8) }}...
          </option>
        </select>
      </div>

      <!-- Clear Button -->
      <div class="flex items-end">
        <button
          @click="clearFilters"
          class="w-full bg-dark-700 hover:bg-dark-600 text-gray-300 px-4 py-2 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Date Range -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-1">Start Date</label>
        <input
          v-model="startDate"
          type="datetime-local"
          @change="applyFilters"
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-400 mb-1">End Date</label>
        <input
          v-model="endDate"
          type="datetime-local"
          @change="applyFilters"
          class="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  </div>
</template>
