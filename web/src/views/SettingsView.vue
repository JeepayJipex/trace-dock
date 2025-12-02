<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { getSettings, updateSettings, getStorageStats, runCleanup } from '../api/settings';
import type { RetentionSettings, StorageStats, CleanupResult } from '../types';
import { formatDistanceToNow } from 'date-fns';

// Settings state
const settings = ref<RetentionSettings | null>(null);
const storageStats = ref<StorageStats | null>(null);
const loading = ref(true);
const saving = ref(false);
const cleaning = ref(false);
const lastCleanupResult = ref<CleanupResult | null>(null);
const error = ref<string | null>(null);
const successMessage = ref<string | null>(null);

// Form state (editable copy)
const formSettings = ref<RetentionSettings>({
  logsRetentionDays: 7,
  tracesRetentionDays: 14,
  spansRetentionDays: 14,
  errorGroupsRetentionDays: 30,
  cleanupEnabled: true,
  cleanupIntervalHours: 1,
});

// Computed
const databaseSizeMB = computed(() => {
  if (!storageStats.value) return '0';
  return (storageStats.value.databaseSizeBytes / (1024 * 1024)).toFixed(2);
});

const oldestLogAge = computed(() => {
  if (!storageStats.value?.oldestLog) return 'N/A';
  return formatDistanceToNow(new Date(storageStats.value.oldestLog), { addSuffix: true });
});

const oldestTraceAge = computed(() => {
  if (!storageStats.value?.oldestTrace) return 'N/A';
  return formatDistanceToNow(new Date(storageStats.value.oldestTrace), { addSuffix: true });
});

const hasChanges = computed(() => {
  if (!settings.value) return false;
  return JSON.stringify(settings.value) !== JSON.stringify(formSettings.value);
});

// Functions
async function fetchData() {
  loading.value = true;
  error.value = null;
  
  try {
    const [settingsData, statsData] = await Promise.all([
      getSettings(),
      getStorageStats(),
    ]);
    
    settings.value = settingsData;
    storageStats.value = statsData;
    formSettings.value = { ...settingsData };
  } catch (err) {
    error.value = 'Failed to load settings';
    console.error(err);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  error.value = null;
  successMessage.value = null;
  
  try {
    const updated = await updateSettings(formSettings.value);
    settings.value = updated;
    formSettings.value = { ...updated };
    successMessage.value = 'Settings saved successfully';
    
    // Refresh stats
    storageStats.value = await getStorageStats();
    
    // Clear success message after 3 seconds
    setTimeout(() => {
      successMessage.value = null;
    }, 3000);
  } catch (err) {
    error.value = 'Failed to save settings';
    console.error(err);
  } finally {
    saving.value = false;
  }
}

async function triggerCleanup() {
  if (!confirm('Are you sure you want to run manual cleanup? This will delete old data based on current retention settings.')) {
    return;
  }
  
  cleaning.value = true;
  error.value = null;
  
  try {
    lastCleanupResult.value = await runCleanup();
    
    // Refresh stats
    storageStats.value = await getStorageStats();
    
    successMessage.value = `Cleanup completed: ${lastCleanupResult.value.logsDeleted} logs, ${lastCleanupResult.value.tracesDeleted} traces, ${lastCleanupResult.value.spansDeleted} spans, ${lastCleanupResult.value.errorGroupsDeleted} error groups deleted`;
    
    setTimeout(() => {
      successMessage.value = null;
    }, 5000);
  } catch (err) {
    error.value = 'Failed to run cleanup';
    console.error(err);
  } finally {
    cleaning.value = false;
  }
}

function resetForm() {
  if (settings.value) {
    formSettings.value = { ...settings.value };
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="min-h-screen bg-gray-900 p-6">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-white">Settings</h1>
        <p class="text-gray-400 mt-1">Configure data retention and cleanup settings</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
        <p class="text-red-400">{{ error }}</p>
        <button @click="fetchData" class="mt-2 text-red-300 hover:text-red-200 underline">
          Retry
        </button>
      </div>

      <template v-else>
        <!-- Success Message -->
        <div v-if="successMessage" class="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
          <p class="text-green-400">{{ successMessage }}</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Storage Statistics -->
          <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Storage Statistics
            </h2>
            
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Database Size</span>
                <span class="text-white font-mono">{{ databaseSizeMB }} MB</span>
              </div>
              
              <div class="border-t border-gray-700 pt-4 space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Total Logs</span>
                  <span class="text-white font-mono">{{ storageStats?.totalLogs.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Total Traces</span>
                  <span class="text-white font-mono">{{ storageStats?.totalTraces.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Total Spans</span>
                  <span class="text-white font-mono">{{ storageStats?.totalSpans.toLocaleString() }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Total Error Groups</span>
                  <span class="text-white font-mono">{{ storageStats?.totalErrorGroups.toLocaleString() }}</span>
                </div>
              </div>

              <div class="border-t border-gray-700 pt-4 space-y-3">
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Oldest Log</span>
                  <span class="text-gray-300 text-sm">{{ oldestLogAge }}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-gray-400">Oldest Trace</span>
                  <span class="text-gray-300 text-sm">{{ oldestTraceAge }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Manual Cleanup -->
          <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Manual Cleanup
            </h2>
            
            <p class="text-gray-400 text-sm mb-4">
              Manually trigger data cleanup based on current retention settings. 
              This is normally run automatically every {{ settings?.cleanupIntervalHours }} hour(s).
            </p>

            <button
              @click="triggerCleanup"
              :disabled="cleaning"
              class="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg v-if="cleaning" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ cleaning ? 'Running Cleanup...' : 'Run Cleanup Now' }}</span>
            </button>

            <!-- Last Cleanup Result -->
            <div v-if="lastCleanupResult" class="mt-4 p-3 bg-gray-900 rounded-lg text-sm">
              <div class="text-gray-400 mb-2">Last cleanup result:</div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex justify-between">
                  <span class="text-gray-500">Logs deleted:</span>
                  <span class="text-white">{{ lastCleanupResult.logsDeleted }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Traces deleted:</span>
                  <span class="text-white">{{ lastCleanupResult.tracesDeleted }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Spans deleted:</span>
                  <span class="text-white">{{ lastCleanupResult.spansDeleted }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Error groups deleted:</span>
                  <span class="text-white">{{ lastCleanupResult.errorGroupsDeleted }}</span>
                </div>
              </div>
              <div class="mt-2 text-gray-500 text-xs">
                Duration: {{ lastCleanupResult.durationMs }}ms
              </div>
            </div>
          </div>
        </div>

        <!-- Retention Settings Form -->
        <div class="mt-6 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Retention Settings
          </h2>
          
          <p class="text-gray-400 text-sm mb-6">
            Configure how long data is kept before automatic cleanup. Set to 0 to disable cleanup for that type.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Logs Retention -->
            <div>
              <label class="block text-gray-300 text-sm font-medium mb-2">
                Logs Retention (days)
              </label>
              <input
                v-model.number="formSettings.logsRetentionDays"
                type="number"
                min="0"
                max="365"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="text-gray-500 text-xs mt-1">Delete logs older than this many days</p>
            </div>

            <!-- Traces Retention -->
            <div>
              <label class="block text-gray-300 text-sm font-medium mb-2">
                Traces Retention (days)
              </label>
              <input
                v-model.number="formSettings.tracesRetentionDays"
                type="number"
                min="0"
                max="365"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="text-gray-500 text-xs mt-1">Delete traces older than this many days</p>
            </div>

            <!-- Spans Retention -->
            <div>
              <label class="block text-gray-300 text-sm font-medium mb-2">
                Spans Retention (days)
              </label>
              <input
                v-model.number="formSettings.spansRetentionDays"
                type="number"
                min="0"
                max="365"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="text-gray-500 text-xs mt-1">Delete spans older than this many days</p>
            </div>

            <!-- Error Groups Retention -->
            <div>
              <label class="block text-gray-300 text-sm font-medium mb-2">
                Error Groups Retention (days)
              </label>
              <input
                v-model.number="formSettings.errorGroupsRetentionDays"
                type="number"
                min="0"
                max="365"
                class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p class="text-gray-500 text-xs mt-1">Delete error groups with no recent occurrences</p>
            </div>
          </div>

          <!-- Cleanup Settings -->
          <div class="mt-6 pt-6 border-t border-gray-700">
            <h3 class="text-md font-medium text-white mb-4">Automatic Cleanup</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Cleanup Enabled -->
              <div>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    v-model="formSettings.cleanupEnabled"
                    type="checkbox"
                    class="w-5 h-5 text-blue-500 bg-gray-900 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <span class="text-gray-300">Enable automatic cleanup</span>
                </label>
                <p class="text-gray-500 text-xs mt-2 ml-8">When enabled, old data is deleted automatically</p>
              </div>

              <!-- Cleanup Interval -->
              <div>
                <label class="block text-gray-300 text-sm font-medium mb-2">
                  Cleanup Interval (hours)
                </label>
                <input
                  v-model.number="formSettings.cleanupIntervalHours"
                  type="number"
                  min="1"
                  max="168"
                  :disabled="!formSettings.cleanupEnabled"
                  class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p class="text-gray-500 text-xs mt-1">How often to run automatic cleanup (1-168 hours)</p>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="mt-6 pt-6 border-t border-gray-700 flex justify-end gap-3">
            <button
              @click="resetForm"
              :disabled="!hasChanges || saving"
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Reset
            </button>
            <button
              @click="saveSettings"
              :disabled="!hasChanges || saving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg v-if="saving" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ saving ? 'Saving...' : 'Save Settings' }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
