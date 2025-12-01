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
