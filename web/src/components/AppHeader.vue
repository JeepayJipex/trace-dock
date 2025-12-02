<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { getErrorGroupStats } from '@/api/errors';
import { getTraceStats } from '@/api/traces';

const route = useRoute();

const isConnected = ref(false);
const unreviewedCount = ref(0);
const runningTracesCount = ref(0);

const connectionStatusClass = computed(() => {
  return isConnected.value
    ? 'bg-green-500'
    : 'bg-red-500';
});

const isLogsActive = computed(() => {
  return route.path === '/' || route.path.startsWith('/log/');
});

const isErrorsActive = computed(() => {
  return route.path.startsWith('/errors');
});

const isTracesActive = computed(() => {
  return route.path.startsWith('/traces');
});

const isSettingsActive = computed(() => {
  return route.path.startsWith('/settings');
});

async function fetchErrorStats() {
  try {
    const stats = await getErrorGroupStats();
    unreviewedCount.value = stats.byStatus.unreviewed || 0;
  } catch (err) {
    console.error('Error fetching error stats:', err);
  }
}

async function fetchTraceStats() {
  try {
    const stats = await getTraceStats();
    runningTracesCount.value = stats.byStatus.running || 0;
  } catch (err) {
    console.error('Error fetching trace stats:', err);
  }
}

onMounted(() => {
  fetchErrorStats();
  fetchTraceStats();
  // Refresh stats every 30 seconds
  setInterval(() => {
    fetchErrorStats();
    fetchTraceStats();
  }, 30000);
});
</script>

<template>
  <header class="bg-dark-900 border-b border-dark-700 sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <div class="flex items-center space-x-8">
          <RouterLink to="/" class="flex items-center space-x-3">
            <svg class="w-8 h-8" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="header-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
                </linearGradient>
              </defs>
              <rect x="10" y="20" width="80" height="60" rx="8" fill="url(#header-grad)" />
              <rect x="18" y="30" width="30" height="4" rx="2" fill="white" opacity="0.9"/>
              <rect x="18" y="40" width="50" height="4" rx="2" fill="white" opacity="0.7"/>
              <rect x="18" y="50" width="40" height="4" rx="2" fill="white" opacity="0.5"/>
              <rect x="18" y="60" width="55" height="4" rx="2" fill="white" opacity="0.3"/>
              <circle cx="78" cy="32" r="6" fill="#10b981"/>
            </svg>
            <span class="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              TraceDock
            </span>
          </RouterLink>

          <!-- Navigation -->
          <nav class="flex items-center space-x-1">
            <RouterLink
              to="/"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isLogsActive
                  ? 'bg-dark-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Logs
              </span>
            </RouterLink>

            <RouterLink
              to="/errors"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors relative',
                isErrorsActive
                  ? 'bg-dark-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Errors
                <!-- Badge for unreviewed errors -->
                <span
                  v-if="unreviewedCount > 0"
                  class="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold bg-red-500 text-white rounded-full"
                >
                  {{ unreviewedCount > 99 ? '99+' : unreviewedCount }}
                </span>
              </span>
            </RouterLink>

            <RouterLink
              to="/traces"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors relative',
                isTracesActive
                  ? 'bg-dark-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Traces
                <!-- Badge for running traces -->
                <span
                  v-if="runningTracesCount > 0"
                  class="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xs font-bold bg-blue-500 text-white rounded-full"
                >
                  {{ runningTracesCount > 99 ? '99+' : runningTracesCount }}
                </span>
              </span>
            </RouterLink>

            <RouterLink
              to="/settings"
              :class="[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isSettingsActive
                  ? 'bg-dark-800 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
              ]"
            >
              <span class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </span>
            </RouterLink>
          </nav>
        </div>

        <!-- Status -->
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2 text-sm text-gray-400">
            <span :class="[connectionStatusClass, 'w-2 h-2 rounded-full animate-pulse-dot']"></span>
            <span>{{ isConnected ? 'Live' : 'Disconnected' }}</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
