<script setup lang="ts">
import { computed } from 'vue';
import type { LogEntry } from '@/types';
import { useAppColors } from '@/composables/useAppColors';

const props = defineProps<{
  log: LogEntry;
}>();

const { getAppColor } = useAppColors();
const appColor = computed(() => getAppColor(props.log.appName));

function getLevelClass(level: string): string {
  const classes: Record<string, string> = {
    debug: 'log-level-debug',
    info: 'log-level-info',
    warn: 'log-level-warn',
    error: 'log-level-error',
  };
  return classes[level] || 'log-level-debug';
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

function formatStackTrace(stack: string): string[] {
  return stack.split('\n').filter(line => line.trim());
}
</script>

<template>
  <div class="bg-dark-900 border border-dark-700 rounded-lg overflow-hidden">
    <!-- Header -->
    <div class="bg-dark-800 p-4 border-b border-dark-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span
            :class="[getLevelClass(log.level), 'px-3 py-1 rounded text-sm font-medium uppercase']"
          >
            {{ log.level }}
          </span>
          <span class="text-gray-400 text-sm">{{ formatTime(log.timestamp) }}</span>
        </div>
        <span :class="[appColor.text, 'font-medium']">{{ log.appName }}</span>
      </div>
      <h2 class="text-xl font-semibold text-white mt-3">{{ log.message }}</h2>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-6">
      <!-- Session & Environment -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 class="text-sm font-medium text-gray-400 mb-2">Session ID</h3>
          <code class="bg-dark-800 text-blue-400 px-2 py-1 rounded text-sm">
            {{ log.sessionId }}
          </code>
        </div>
        <div>
          <h3 class="text-sm font-medium text-gray-400 mb-2">Environment</h3>
          <div class="bg-dark-800 rounded p-3">
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <dt class="text-gray-500">Type:</dt>
              <dd class="text-white">{{ log.environment.type }}</dd>
              <template v-if="log.environment.platform">
                <dt class="text-gray-500">Platform:</dt>
                <dd class="text-white">{{ log.environment.platform }}</dd>
              </template>
              <template v-if="log.environment.nodeVersion">
                <dt class="text-gray-500">Node:</dt>
                <dd class="text-white">{{ log.environment.nodeVersion }}</dd>
              </template>
              <template v-if="log.environment.userAgent">
                <dt class="text-gray-500 col-span-2">User Agent:</dt>
                <dd class="text-white col-span-2 text-xs break-all">{{ log.environment.userAgent }}</dd>
              </template>
            </dl>
          </div>
        </div>
      </div>

      <!-- Metadata -->
      <div v-if="log.metadata && Object.keys(log.metadata).length > 0">
        <h3 class="text-sm font-medium text-gray-400 mb-2">Metadata</h3>
        <div class="bg-dark-800 rounded p-4">
          <pre class="text-sm text-gray-300 overflow-x-auto">{{ JSON.stringify(log.metadata, null, 2) }}</pre>
        </div>
      </div>

      <!-- Context -->
      <div v-if="log.context && Object.keys(log.context).length > 0">
        <h3 class="text-sm font-medium text-gray-400 mb-2">Context</h3>
        <div class="bg-dark-800 rounded p-4">
          <pre class="text-sm text-gray-300 overflow-x-auto">{{ JSON.stringify(log.context, null, 2) }}</pre>
        </div>
      </div>

      <!-- Source Location -->
      <div v-if="log.sourceLocation">
        <h3 class="text-sm font-medium text-gray-400 mb-2">Source Location</h3>
        <div class="bg-dark-800 rounded p-4">
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <code class="text-cyan-400">{{ log.sourceLocation.file }}</code>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">Line:</span>
              <code class="text-white">{{ log.sourceLocation.line }}</code>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500">Column:</span>
              <code class="text-white">{{ log.sourceLocation.column }}</code>
            </div>
            <div v-if="log.sourceLocation.function" class="flex items-center gap-2">
              <span class="text-gray-500">Function:</span>
              <code class="text-yellow-400">{{ log.sourceLocation.function }}</code>
            </div>
          </div>
        </div>
      </div>

      <!-- Stack Trace -->
      <div v-if="log.stackTrace">
        <h3 class="text-sm font-medium text-gray-400 mb-2">Stack Trace</h3>
        <div class="bg-dark-800 rounded p-4 overflow-x-auto">
          <div class="stack-trace text-red-400">
            <span
              v-for="(line, index) in formatStackTrace(log.stackTrace)"
              :key="index"
              class="stack-trace-line"
            >
              {{ line }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
