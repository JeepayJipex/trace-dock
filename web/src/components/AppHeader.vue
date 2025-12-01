<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';

const isConnected = ref(false);

const connectionStatusClass = computed(() => {
  return isConnected.value
    ? 'bg-green-500'
    : 'bg-red-500';
});
</script>

<template>
  <header class="bg-dark-900 border-b border-dark-700 sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span class="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Trace Dock
          </span>
        </RouterLink>

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
