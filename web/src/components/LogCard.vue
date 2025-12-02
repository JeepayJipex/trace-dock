<script setup lang="ts">
import { ref, computed } from 'vue';
import type { LogEntry } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';
import { useAppColors } from '@/composables/useAppColors';

const props = defineProps<{
  log: LogEntry;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  select: [log: LogEntry];
  filter: [key: string, value: string];
}>();

const isExpanded = ref(false);
const { getAppColor } = useAppColors();

const appColor = computed(() => getAppColor(props.log.appName));

const levelConfig = computed(() => {
  const configs = {
    error: {
      icon: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-red-500/10',
      borderClass: 'border-red-500/30',
      textClass: 'text-red-400',
      badgeClass: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
      dotClass: 'bg-red-500',
    },
    warn: {
      icon: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-orange-500/10',
      borderClass: 'border-orange-500/30',
      textClass: 'text-orange-400',
      badgeClass: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
      dotClass: 'bg-orange-500',
    },
    info: {
      icon: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-blue-500/10',
      borderClass: 'border-blue-500/30',
      textClass: 'text-blue-400',
      badgeClass: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
      dotClass: 'bg-blue-500',
    },
    debug: {
      icon: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`,
      bgClass: 'bg-purple-500/10',
      borderClass: 'border-purple-500/30',
      textClass: 'text-purple-400',
      badgeClass: 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30',
      dotClass: 'bg-purple-500',
    },
  };
  return configs[props.log.level] || configs.debug;
});

const hasDetails = computed(() => {
  return props.log.stackTrace || 
    (props.log.metadata && Object.keys(props.log.metadata).length > 0) ||
    (props.log.context && Object.keys(props.log.context).length > 0);
});

const truncatedMessage = computed(() => {
  const firstLine = props.log.message.split('\n')[0];
  return firstLine.length > 120 ? firstLine.slice(0, 120) + '...' : firstLine;
});

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

function toggleExpand(event: MouseEvent) {
  event.stopPropagation();
  isExpanded.value = !isExpanded.value;
}

function handleClick() {
  emit('select', props.log);
}

function handleFilterClick(event: MouseEvent, key: string, value: string) {
  event.stopPropagation();
  emit('filter', key, value);
}
</script>

<template>
  <div
    :class="[
      'group rounded-lg border transition-all duration-200 cursor-pointer',
      isSelected 
        ? `${levelConfig.bgClass} ${levelConfig.borderClass}` 
        : 'bg-dark-900/50 border-dark-700/50 hover:border-dark-600',
    ]"
    @click="handleClick"
  >
    <!-- Summary Row (always visible) -->
    <div class="px-4 py-3">
      <div class="flex items-start gap-3">
        <!-- Level indicator -->
        <div class="flex-shrink-0 pt-0.5">
          <div :class="['w-2 h-2 rounded-full', levelConfig.dotClass]"></div>
        </div>

        <!-- Main content -->
        <div class="flex-1 min-w-0">
          <!-- Line 1: Level badge, Message, Timestamp -->
          <div class="flex items-center gap-3 flex-wrap">
            <button
              @click="(e) => handleFilterClick(e, 'level', log.level)"
              :class="[
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium uppercase transition-colors',
                levelConfig.badgeClass
              ]"
              title="Click to filter by level"
            >
              <span v-html="levelConfig.icon" :class="levelConfig.textClass"></span>
              {{ log.level }}
            </button>
            
            <span class="text-white font-medium truncate flex-1">
              {{ truncatedMessage }}
            </span>
            
            <span 
              class="flex-shrink-0 text-gray-500 text-xs tabular-nums"
              :title="formatFullTime(log.timestamp)"
            >
              {{ formatTime(log.timestamp) }}
            </span>
          </div>

          <!-- Line 2: App, Session, Environment, Tags -->
          <div class="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
            <button 
              @click="(e) => handleFilterClick(e, 'appName', log.appName)"
              :class="[appColor.text, 'font-medium hover:underline transition-colors']"
              title="Click to filter by app"
            >
              {{ log.appName }}
            </button>
            <span class="text-dark-500">•</span>
            <button 
              @click="(e) => handleFilterClick(e, 'sessionId', log.sessionId)"
              class="text-gray-500 hover:text-gray-300 hover:underline transition-colors font-mono"
              title="Click to filter by session"
            >
              {{ log.sessionId.slice(0, 8) }}
            </button>
            <span class="text-dark-500">•</span>
            <span class="text-gray-600">{{ log.environment.type }}</span>
            
            <!-- Trace ID indicator -->
            <template v-if="log.traceId">
              <span class="text-dark-500">•</span>
              <button 
                @click="(e) => handleFilterClick(e, 'traceId', log.traceId!)"
                class="text-emerald-400 hover:text-emerald-300 hover:underline transition-colors font-mono flex items-center gap-1"
                title="Click to filter by trace"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {{ log.traceId.slice(0, 8) }}
              </button>
            </template>
            
            <!-- Span ID indicator -->
            <template v-if="log.spanId">
              <span class="text-dark-500">•</span>
              <button 
                @click="(e) => handleFilterClick(e, 'spanId', log.spanId!)"
                class="text-amber-400 hover:text-amber-300 hover:underline transition-colors font-mono flex items-center gap-1"
                title="Click to filter by span"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                </svg>
                {{ log.spanId.slice(0, 8) }}
              </button>
            </template>
            
            <!-- Stack trace indicator -->
            <span v-if="log.stackTrace" class="text-red-400 flex items-center gap-1 ml-2">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" />
              </svg>
              Stack
            </span>
            
            <!-- Metadata preview tags (clickable) -->
            <template v-if="log.metadata && Object.keys(log.metadata).length > 0">
              <span class="text-dark-500">•</span>
              <button
                v-for="(value, key) in Object.entries(log.metadata).slice(0, 3)"
                :key="key"
                @click="(e) => handleFilterClick(e, String(value[0]), String(value[1]))"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-dark-700/50 text-gray-400 hover:bg-dark-600/50 hover:text-gray-300 transition-colors font-mono"
                :title="`Click to search ${value[0]}:${value[1]}`"
              >
                <span class="text-gray-500">{{ value[0] }}:</span>
                <span class="max-w-[80px] truncate">{{ typeof value[1] === 'object' ? '{...}' : String(value[1]) }}</span>
              </button>
              <span 
                v-if="Object.keys(log.metadata).length > 3" 
                class="text-gray-600"
              >
                +{{ Object.keys(log.metadata).length - 3 }}
              </span>
            </template>
          </div>
        </div>

        <!-- Expand button -->
        <button
          v-if="hasDetails"
          @click="toggleExpand"
          class="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-dark-700/50 transition-colors"
          :title="isExpanded ? 'Collapse' : 'Expand'"
        >
          <svg 
            class="w-4 h-4 transition-transform duration-200" 
            :class="{ 'rotate-180': isExpanded }"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Expanded Details -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-[500px]"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 max-h-[500px]"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="isExpanded" class="overflow-hidden">
        <div class="px-4 pb-4 pt-2 border-t border-dark-700/50 space-y-4">
          <!-- Full Message (if truncated) -->
          <div v-if="log.message.length > 120 || log.message.includes('\n')">
            <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Message</h4>
            <p class="text-gray-300 text-sm whitespace-pre-wrap font-mono bg-dark-800/50 rounded-lg p-3">
              {{ log.message }}
            </p>
          </div>

          <!-- Metadata (clickable values) -->
          <div v-if="log.metadata && Object.keys(log.metadata).length > 0">
            <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Metadata</h4>
            <div class="bg-dark-800/50 rounded-lg p-3 space-y-1">
              <div 
                v-for="(value, key) in log.metadata" 
                :key="key"
                class="flex items-start gap-2 text-sm font-mono"
              >
                <span class="text-gray-500 flex-shrink-0">{{ key }}:</span>
                <button
                  v-if="typeof value !== 'object'"
                  @click="(e) => handleFilterClick(e, String(key), String(value))"
                  class="text-gray-300 hover:text-blue-400 hover:underline transition-colors text-left break-all"
                  :title="`Click to search ${key}:${value}`"
                >
                  {{ value }}
                </button>
                <pre v-else class="text-gray-300 overflow-x-auto">{{ JSON.stringify(value, null, 2) }}</pre>
              </div>
            </div>
          </div>

          <!-- Stack Trace -->
          <div v-if="log.stackTrace">
            <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>Stack Trace</span>
              <span class="text-red-400">•</span>
            </h4>
            <pre class="text-red-300/80 text-xs font-mono bg-dark-950 rounded-lg p-3 overflow-x-auto border border-red-500/20">{{ log.stackTrace }}</pre>
          </div>

          <!-- Context -->
          <div v-if="log.context && Object.keys(log.context).length > 0">
            <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Context</h4>
            <pre class="text-gray-300 text-sm font-mono bg-dark-800/50 rounded-lg p-3 overflow-x-auto">{{ JSON.stringify(log.context, null, 2) }}</pre>
          </div>

          <!-- Environment Details -->
          <div>
            <h4 class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Environment</h4>
            <div class="flex flex-wrap gap-2">
              <span class="bg-dark-700/50 text-gray-400 px-2 py-1 rounded text-xs">
                Type: {{ log.environment.type }}
              </span>
              <span v-if="log.environment.platform" class="bg-dark-700/50 text-gray-400 px-2 py-1 rounded text-xs">
                Platform: {{ log.environment.platform }}
              </span>
              <span v-if="log.environment.nodeVersion" class="bg-dark-700/50 text-gray-400 px-2 py-1 rounded text-xs">
                Node: {{ log.environment.nodeVersion }}
              </span>
              <span v-if="log.environment.userAgent" class="bg-dark-700/50 text-gray-400 px-2 py-1 rounded text-xs truncate max-w-xs">
                {{ log.environment.userAgent }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
