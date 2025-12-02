<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { LogFilters, LogLevel } from '@/types';
import { getSearchSuggestions } from '@/api/logs';
import { useAppColors } from '@/composables/useAppColors';

const props = defineProps<{
  apps: string[];
  sessions: string[];
  modelValue: LogFilters;
}>();

const emit = defineEmits<{
  'update:modelValue': [filters: LogFilters];
  'add-to-search': [key: string, value: string];
}>();

// Local state
const searchInput = ref('');
const showFiltersDropdown = ref(false);
const showSuggestions = ref(false);
const suggestions = ref<{ type: string; value: string }[]>([]);
const selectedSuggestionIndex = ref(-1);
const searchInputRef = ref<HTMLInputElement | null>(null);
const dropdownRef = ref<HTMLDivElement | null>(null);
const { getAppColor } = useAppColors();

const levels: { value: LogLevel; label: string; color: string }[] = [
  { value: 'error', label: 'Error', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'warn', label: 'Warn', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { value: 'info', label: 'Info', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'debug', label: 'Debug', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

// Active filters as chips
const activeFilters = computed(() => {
  const filters: { key: string; label: string; value: string; color: string }[] = [];
  
  if (props.modelValue.level) {
    const levelConfig = levels.find(l => l.value === props.modelValue.level);
    filters.push({
      key: 'level',
      label: 'Level',
      value: props.modelValue.level,
      color: levelConfig?.color || 'bg-gray-500/20 text-gray-400',
    });
  }
  
  if (props.modelValue.appName) {
    const appColorConfig = getAppColor(props.modelValue.appName);
    filters.push({
      key: 'appName',
      label: 'App',
      value: props.modelValue.appName,
      color: `${appColorConfig.bg} ${appColorConfig.text} ${appColorConfig.border}`,
    });
  }
  
  if (props.modelValue.sessionId) {
    filters.push({
      key: 'sessionId',
      label: 'Session',
      value: props.modelValue.sessionId.slice(0, 8) + '...',
      color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    });
  }
  
  if (props.modelValue.startDate) {
    filters.push({
      key: 'startDate',
      label: 'From',
      value: new Date(props.modelValue.startDate).toLocaleDateString(),
      color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    });
  }
  
  if (props.modelValue.endDate) {
    filters.push({
      key: 'endDate',
      label: 'To',
      value: new Date(props.modelValue.endDate).toLocaleDateString(),
      color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    });
  }
  
  return filters;
});

const hasActiveFilters = computed(() => {
  return activeFilters.value.length > 0 || props.modelValue.search;
});

// Initialize search input from modelValue
watch(() => props.modelValue.search, (newSearch) => {
  if (newSearch !== searchInput.value) {
    searchInput.value = newSearch || '';
  }
}, { immediate: true });

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
let suggestionsTimeout: ReturnType<typeof setTimeout>;

function updateSearch(value: string) {
  searchInput.value = value;
  
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    emit('update:modelValue', { ...props.modelValue, search: value || undefined });
  }, 300);
  
  // Fetch suggestions
  clearTimeout(suggestionsTimeout);
  if (value.length >= 2) {
    suggestionsTimeout = setTimeout(async () => {
      try {
        const lastWord = value.split(/\s+/).pop() || '';
        const result = await getSearchSuggestions(lastWord);
        suggestions.value = result.suggestions;
        showSuggestions.value = suggestions.value.length > 0;
      } catch {
        suggestions.value = [];
      }
    }, 150);
  } else {
    suggestions.value = [];
    showSuggestions.value = false;
  }
}

function removeFilter(key: string) {
  const newFilters = { ...props.modelValue };
  delete newFilters[key as keyof LogFilters];
  emit('update:modelValue', newFilters);
}

function clearAllFilters() {
  searchInput.value = '';
  emit('update:modelValue', {});
}

function setLevel(level: LogLevel | '') {
  emit('update:modelValue', { 
    ...props.modelValue, 
    level: level || undefined 
  });
}

function setApp(appName: string) {
  emit('update:modelValue', { 
    ...props.modelValue, 
    appName: appName || undefined 
  });
}

function setSession(sessionId: string) {
  emit('update:modelValue', { 
    ...props.modelValue, 
    sessionId: sessionId || undefined 
  });
}

function setDateRange(start: string, end: string) {
  emit('update:modelValue', { 
    ...props.modelValue, 
    startDate: start ? new Date(start).toISOString() : undefined,
    endDate: end ? new Date(end).toISOString() : undefined,
  });
  showFiltersDropdown.value = false;
}

function applySuggestion(suggestion: { type: string; value: string }) {
  // Replace last word with suggestion
  const words = searchInput.value.split(/\s+/);
  words.pop();
  words.push(suggestion.value);
  const newValue = words.join(' ') + ' ';
  searchInput.value = newValue;
  updateSearch(newValue);
  showSuggestions.value = false;
  selectedSuggestionIndex.value = -1;
  searchInputRef.value?.focus();
}

function handleKeydown(event: KeyboardEvent) {
  if (!showSuggestions.value || suggestions.value.length === 0) return;
  
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedSuggestionIndex.value = Math.min(
      selectedSuggestionIndex.value + 1, 
      suggestions.value.length - 1
    );
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSuggestionIndex.value = Math.max(selectedSuggestionIndex.value - 1, -1);
  } else if (event.key === 'Enter' && selectedSuggestionIndex.value >= 0) {
    event.preventDefault();
    applySuggestion(suggestions.value[selectedSuggestionIndex.value]);
  } else if (event.key === 'Escape') {
    showSuggestions.value = false;
    selectedSuggestionIndex.value = -1;
  }
}

// Close dropdowns when clicking outside
function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showFiltersDropdown.value = false;
  }
  if (!searchInputRef.value?.contains(event.target as Node)) {
    showSuggestions.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

// Expose method to add filter from outside (clickable tags)
defineExpose({
  addFilter: (key: string, value: string) => {
    if (key === 'level') {
      setLevel(value as LogLevel);
    } else if (key === 'app' || key === 'appName') {
      setApp(value);
    } else if (key === 'session' || key === 'sessionId') {
      setSession(value);
    } else {
      // Add to search as key:value
      const newSearch = searchInput.value 
        ? `${searchInput.value} ${key}:${value}`
        : `${key}:${value}`;
      updateSearch(newSearch);
    }
  }
});
</script>

<template>
  <div class="space-y-3">
    <!-- Main Search Bar -->
    <div class="flex items-center gap-2">
      <!-- Search Input -->
      <div class="relative flex-1">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref="searchInputRef"
            :value="searchInput"
            @input="updateSearch(($event.target as HTMLInputElement).value)"
            @keydown="handleKeydown"
            @focus="showSuggestions = suggestions.length > 0"
            type="text"
            placeholder="Search logs... (try level:error app:myapp or any text)"
            class="w-full bg-dark-800/50 border border-dark-600/50 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
          />
        </div>
        
        <!-- Suggestions Dropdown -->
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div 
            v-if="showSuggestions && suggestions.length > 0" 
            class="absolute z-50 top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-xl overflow-hidden"
          >
            <div
              v-for="(suggestion, index) in suggestions"
              :key="suggestion.value"
              @click="applySuggestion(suggestion)"
              :class="[
                'px-3 py-2 cursor-pointer flex items-center gap-2 text-sm',
                index === selectedSuggestionIndex ? 'bg-dark-700' : 'hover:bg-dark-700/50'
              ]"
            >
              <span 
                :class="[
                  'text-xs px-1.5 py-0.5 rounded',
                  suggestion.type === 'level' ? 'bg-blue-500/20 text-blue-400' :
                  suggestion.type === 'app' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-gray-500/20 text-gray-400'
                ]"
              >
                {{ suggestion.type }}
              </span>
              <span class="text-gray-300 font-mono">{{ suggestion.value }}</span>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Filters Button -->
      <div ref="dropdownRef" class="relative">
        <button
          @click="showFiltersDropdown = !showFiltersDropdown"
          :class="[
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border',
            showFiltersDropdown || hasActiveFilters
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              : 'bg-dark-800/50 text-gray-400 border-dark-600/50 hover:bg-dark-700/50'
          ]"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filters</span>
          <span 
            v-if="activeFilters.length > 0" 
            class="bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
          >
            {{ activeFilters.length }}
          </span>
        </button>

        <!-- Filters Dropdown -->
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-100 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div 
            v-if="showFiltersDropdown" 
            class="absolute z-50 top-full right-0 mt-2 w-80 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl overflow-hidden"
          >
            <div class="p-4 space-y-4">
              <!-- Level -->
              <div>
                <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Level</label>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="level in levels"
                    :key="level.value"
                    @click="setLevel(modelValue.level === level.value ? '' : level.value)"
                    :class="[
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-all border',
                      modelValue.level === level.value 
                        ? level.color 
                        : 'bg-dark-700/50 text-gray-400 border-dark-600/50 hover:bg-dark-600/50'
                    ]"
                  >
                    {{ level.label }}
                  </button>
                </div>
              </div>

              <!-- App -->
              <div>
                <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Application</label>
                <select
                  :value="modelValue.appName || ''"
                  @change="setApp(($event.target as HTMLSelectElement).value)"
                  class="w-full bg-dark-700/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">All apps</option>
                  <option v-for="app in apps" :key="app" :value="app">{{ app }}</option>
                </select>
              </div>

              <!-- Session -->
              <div>
                <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Session</label>
                <select
                  :value="modelValue.sessionId || ''"
                  @change="setSession(($event.target as HTMLSelectElement).value)"
                  class="w-full bg-dark-700/50 border border-dark-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">All sessions</option>
                  <option v-for="session in sessions" :key="session" :value="session">
                    {{ session.slice(0, 8) }}...
                  </option>
                </select>
              </div>

              <!-- Date Range -->
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">From</label>
                  <input
                    type="datetime-local"
                    :value="modelValue.startDate ? modelValue.startDate.slice(0, 16) : ''"
                    @change="setDateRange(($event.target as HTMLInputElement).value, modelValue.endDate?.slice(0, 16) || '')"
                    class="w-full bg-dark-700/50 border border-dark-600/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">To</label>
                  <input
                    type="datetime-local"
                    :value="modelValue.endDate ? modelValue.endDate.slice(0, 16) : ''"
                    @change="setDateRange(modelValue.startDate?.slice(0, 16) || '', ($event.target as HTMLInputElement).value)"
                    class="w-full bg-dark-700/50 border border-dark-600/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="border-t border-dark-600 px-4 py-3 bg-dark-900/50">
              <button
                v-if="hasActiveFilters"
                @click="clearAllFilters"
                class="w-full text-sm text-gray-400 hover:text-white transition-colors"
              >
                Clear all filters
              </button>
              <p v-else class="text-xs text-gray-500 text-center">
                Use filters to narrow down your search
              </p>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Active Filters Chips -->
    <div v-if="activeFilters.length > 0 || modelValue.search" class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-gray-500">Active:</span>
      
      <!-- Search query chip -->
      <span 
        v-if="modelValue.search"
        class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-dark-700/50 text-gray-300 border border-dark-600/50"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="max-w-[150px] truncate">{{ modelValue.search }}</span>
        <button @click="updateSearch('')" class="hover:text-white">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
      
      <!-- Filter chips -->
      <span 
        v-for="filter in activeFilters" 
        :key="filter.key"
        :class="['inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border', filter.color]"
      >
        <span class="text-gray-500">{{ filter.label }}:</span>
        <span>{{ filter.value }}</span>
        <button @click="removeFilter(filter.key)" class="hover:opacity-70">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>
      
      <!-- Clear all button -->
      <button 
        v-if="activeFilters.length > 1 || (activeFilters.length === 1 && modelValue.search)"
        @click="clearAllFilters"
        class="text-xs text-gray-500 hover:text-white transition-colors"
      >
        Clear all
      </button>
    </div>

    <!-- Search Help -->
    <div v-if="!hasActiveFilters" class="text-xs text-gray-600">
      <span class="text-gray-500">Tips:</span>
      <code class="mx-1 px-1.5 py-0.5 rounded bg-dark-800/50 text-gray-400">level:error</code>
      <code class="mx-1 px-1.5 py-0.5 rounded bg-dark-800/50 text-gray-400">app:myapp</code>
      <code class="mx-1 px-1.5 py-0.5 rounded bg-dark-800/50 text-gray-400">userId:123</code>
      <span class="text-gray-600">or free text search</span>
    </div>
  </div>
</template>
