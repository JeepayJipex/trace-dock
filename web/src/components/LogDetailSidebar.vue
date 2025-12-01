<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { LogEntry } from '@/types';
import { format } from 'date-fns';

const props = defineProps<{
  log: LogEntry | null;
}>();

const emit = defineEmits<{
  close: [];
  navigate: ['prev' | 'next'];
}>();

const activeTab = ref<'overview' | 'metadata' | 'stack' | 'environment'>('overview');
const copied = ref(false);

// Reset tab when log changes
watch(() => props.log?.id, () => {
  activeTab.value = 'overview';
});

const levelConfig = computed(() => {
  if (!props.log) return null;
  const configs = {
    error: {
      icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-red-500/20',
      textClass: 'text-red-400',
      borderClass: 'border-red-500/30',
    },
    warn: {
      icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-orange-500/20',
      textClass: 'text-orange-400',
      borderClass: 'border-orange-500/30',
    },
    info: {
      icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-blue-500/20',
      textClass: 'text-blue-400',
      borderClass: 'border-blue-500/30',
    },
    debug: {
      icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-purple-500/20',
      textClass: 'text-purple-400',
      borderClass: 'border-purple-500/30',
    },
  };
  return configs[props.log.level] || configs.debug;
});

const tabs = computed(() => {
  if (!props.log) return [];
  const t: { id: string; label: string; count: number | null }[] = [
    { id: 'overview', label: 'Overview', count: null }
  ];
  
  if (props.log.metadata && Object.keys(props.log.metadata).length > 0) {
    t.push({ id: 'metadata', label: 'Metadata', count: Object.keys(props.log.metadata).length });
  }
  if (props.log.stackTrace) {
    t.push({ id: 'stack', label: 'Stack Trace', count: null });
  }
  t.push({ id: 'environment', label: 'Environment', count: null });
  
  return t;
});

function formatFullTime(timestamp: string): string {
  try {
    return format(new Date(timestamp), 'PPpp');
  } catch {
    return timestamp;
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

function copyLogAsJson() {
  if (props.log) {
    copyToClipboard(JSON.stringify(props.log, null, 2));
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-x-full opacity-0"
    enter-to-class="translate-x-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-x-0 opacity-100"
    leave-to-class="translate-x-full opacity-0"
  >
    <div 
      v-if="log" 
      class="fixed right-0 top-0 h-full w-full max-w-xl bg-dark-900 border-l border-dark-700 shadow-2xl z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex-shrink-0 border-b border-dark-700 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0">
            <!-- Level Icon -->
            <div 
              v-if="levelConfig"
              :class="['flex-shrink-0 p-2 rounded-lg', levelConfig.bgClass]"
            >
              <span v-html="levelConfig.icon" :class="levelConfig.textClass"></span>
            </div>
            
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span 
                  v-if="levelConfig"
                  :class="['text-sm font-medium uppercase', levelConfig.textClass]"
                >
                  {{ log.level }}
                </span>
                <span class="text-gray-500">•</span>
                <span class="text-purple-400 text-sm font-medium">{{ log.appName }}</span>
              </div>
              <p class="text-gray-400 text-xs mt-1">{{ formatFullTime(log.timestamp) }}</p>
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex items-center gap-2">
            <!-- Navigate -->
            <button
              @click="emit('navigate', 'prev')"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Previous log"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>
            <button
              @click="emit('navigate', 'next')"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Next log"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <!-- Copy -->
            <button
              @click="copyLogAsJson"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              :title="copied ? 'Copied!' : 'Copy as JSON'"
            >
              <svg v-if="!copied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <svg v-else class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            
            <!-- Close -->
            <button
              @click="emit('close')"
              class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
              title="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex-shrink-0 border-b border-dark-700 px-4">
        <div class="flex gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id as typeof activeTab"
            :class="[
              'px-4 py-3 text-sm font-medium transition-colors relative',
              activeTab === tab.id 
                ? 'text-white' 
                : 'text-gray-500 hover:text-gray-300'
            ]"
          >
            <span class="flex items-center gap-2">
              {{ tab.label }}
              <span 
                v-if="tab.count" 
                class="bg-dark-700 text-gray-400 text-xs px-1.5 py-0.5 rounded"
              >
                {{ tab.count }}
              </span>
            </span>
            <span 
              v-if="activeTab === tab.id"
              class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t"
            ></span>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Overview Tab -->
        <template v-if="activeTab === 'overview'">
          <!-- Message -->
          <div>
            <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Message</h3>
            <div class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
              <p class="text-white whitespace-pre-wrap font-mono text-sm leading-relaxed">{{ log.message }}</p>
            </div>
          </div>

          <!-- Quick Info -->
          <div>
            <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Details</h3>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-dark-800/50 rounded-lg p-3 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Session ID</p>
                <p class="text-gray-300 text-sm font-mono truncate" :title="log.sessionId">
                  {{ log.sessionId }}
                </p>
              </div>
              <div class="bg-dark-800/50 rounded-lg p-3 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Log ID</p>
                <p class="text-gray-300 text-sm font-mono truncate" :title="log.id">
                  {{ log.id }}
                </p>
              </div>
            </div>
          </div>

          <!-- Metadata Preview (if exists) -->
          <div v-if="log.metadata && Object.keys(log.metadata).length > 0">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider">Metadata Preview</h3>
              <button 
                @click="activeTab = 'metadata'"
                class="text-blue-400 text-xs hover:text-blue-300"
              >
                View all →
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(value, key) in Object.entries(log.metadata).slice(0, 6)"
                :key="key"
                class="bg-dark-700/50 text-gray-400 px-2.5 py-1 rounded text-xs font-mono"
              >
                {{ value[0] }}: {{ typeof value[1] === 'object' ? '{...}' : String(value[1]).slice(0, 20) }}
              </span>
              <span 
                v-if="Object.keys(log.metadata).length > 6"
                class="text-gray-500 text-xs px-2.5 py-1"
              >
                +{{ Object.keys(log.metadata).length - 6 }} more
              </span>
            </div>
          </div>

          <!-- Stack Trace Preview (if exists) -->
          <div v-if="log.stackTrace">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                Stack Trace
                <span class="w-2 h-2 rounded-full bg-red-500"></span>
              </h3>
              <button 
                @click="activeTab = 'stack'"
                class="text-blue-400 text-xs hover:text-blue-300"
              >
                View full →
              </button>
            </div>
            <pre class="text-red-300/80 text-xs font-mono bg-dark-950 rounded-lg p-3 border border-red-500/20 max-h-32 overflow-hidden">{{ log.stackTrace.split('\n').slice(0, 4).join('\n') }}{{ log.stackTrace.split('\n').length > 4 ? '\n...' : '' }}</pre>
          </div>
        </template>

        <!-- Metadata Tab -->
        <template v-if="activeTab === 'metadata' && log.metadata">
          <div class="space-y-4">
            <div 
              v-for="(value, key) in log.metadata" 
              :key="key"
              class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="text-gray-400 text-xs font-medium mb-2">{{ key }}</p>
                  <pre 
                    v-if="typeof value === 'object'" 
                    class="text-gray-200 text-sm font-mono overflow-x-auto"
                  >{{ JSON.stringify(value, null, 2) }}</pre>
                  <p v-else class="text-gray-200 text-sm font-mono break-all">{{ value }}</p>
                </div>
                <button 
                  @click="copyToClipboard(typeof value === 'object' ? JSON.stringify(value) : String(value))"
                  class="flex-shrink-0 p-1.5 rounded text-gray-500 hover:text-gray-300 hover:bg-dark-700 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Stack Trace Tab -->
        <template v-if="activeTab === 'stack' && log.stackTrace">
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wider">Full Stack Trace</h3>
              <button 
                @click="copyToClipboard(log.stackTrace!)"
                class="flex items-center gap-1.5 text-gray-400 hover:text-gray-300 text-xs"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>
            <div class="bg-dark-950 rounded-lg border border-red-500/20 overflow-hidden">
              <div 
                v-for="(line, index) in log.stackTrace.split('\n')" 
                :key="index"
                class="flex hover:bg-dark-800/50 transition-colors"
              >
                <span class="flex-shrink-0 w-10 text-right pr-3 py-1 text-gray-600 text-xs font-mono select-none border-r border-dark-700/50">
                  {{ index + 1 }}
                </span>
                <pre class="flex-1 pl-3 py-1 text-red-300/80 text-xs font-mono overflow-x-auto">{{ line }}</pre>
              </div>
            </div>
          </div>
        </template>

        <!-- Environment Tab -->
        <template v-if="activeTab === 'environment'">
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Type</p>
                <p class="text-gray-200 font-medium">{{ log.environment.type }}</p>
              </div>
              <div v-if="log.environment.platform" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Platform</p>
                <p class="text-gray-200 font-medium">{{ log.environment.platform }}</p>
              </div>
              <div v-if="log.environment.arch" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Architecture</p>
                <p class="text-gray-200 font-medium">{{ log.environment.arch }}</p>
              </div>
              <div v-if="log.environment.nodeVersion" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Node Version</p>
                <p class="text-gray-200 font-medium font-mono">{{ log.environment.nodeVersion }}</p>
              </div>
              <div v-if="log.environment.tauriVersion" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
                <p class="text-gray-500 text-xs mb-1">Tauri Version</p>
                <p class="text-gray-200 font-medium font-mono">{{ log.environment.tauriVersion }}</p>
              </div>
            </div>
            
            <div v-if="log.environment.userAgent" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
              <p class="text-gray-500 text-xs mb-2">User Agent</p>
              <p class="text-gray-300 text-sm font-mono break-all">{{ log.environment.userAgent }}</p>
            </div>
            
            <div v-if="log.environment.url" class="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
              <p class="text-gray-500 text-xs mb-2">URL</p>
              <p class="text-blue-400 text-sm font-mono break-all">{{ log.environment.url }}</p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>
  
  <!-- Backdrop -->
  <Transition
    enter-active-class="transition-opacity duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div 
      v-if="log" 
      class="fixed inset-0 bg-black/50 z-40"
      @click="emit('close')"
    ></div>
  </Transition>
</template>
