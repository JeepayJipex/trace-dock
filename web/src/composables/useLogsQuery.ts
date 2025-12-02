import { ref, computed, watch, onMounted, type MaybeRef } from 'vue';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query';
import { useUrlFilters } from './useUrlFilters';
import { getLogsFiltered } from '@/api/errors';
import { getApps, getSessions } from '@/api/logs';
import type { LogFilters, LogEntry } from '@/types';

export interface UseLogsQueryOptions {
  /** Initial filters */
  initialFilters?: LogFilters;
  /** Page size */
  limit?: number;
  /** Enable URL sync for shareable links */
  syncToUrl?: boolean;
  /** Polling interval in ms (0 to disable) */
  pollingInterval?: MaybeRef<number>;
  /** Whether to hide ignored errors */
  hideIgnoredErrors?: MaybeRef<boolean>;
}

export function useLogsQuery(options: UseLogsQueryOptions = {}) {
  const {
    initialFilters = {},
    limit = 50,
    syncToUrl = true,
  } = options;

  const queryClient = useQueryClient();
  
  // State
  const filters = ref<LogFilters>({ ...initialFilters });
  const offset = ref(0);
  const hideIgnoredErrors = ref(true);
  const pollingEnabled = ref(false);
  const pollingInterval = ref(5000); // 5 seconds default
  
  // All loaded logs (for infinite scroll)
  const allLogs = ref<LogEntry[]>([]);

  // URL sync
  const urlFilters = syncToUrl 
    ? useUrlFilters(filters, {
        defaults: {},
        exclude: [],
      })
    : null;

  // Query key
  const queryKey = computed(() => [
    'logs',
    {
      ...filters.value,
      limit,
      offset: offset.value,
      hideIgnoredErrors: hideIgnoredErrors.value,
    },
  ]);

  // Main query
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getLogsFiltered(
      filters.value,
      limit,
      offset.value,
      hideIgnoredErrors.value
    ),
    placeholderData: keepPreviousData,
    refetchInterval: computed(() => pollingEnabled.value ? pollingInterval.value : false),
    staleTime: 1000 * 10, // 10 seconds
  });

  // Apps query for filter dropdown
  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: getApps,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Sessions query for filter dropdown
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['sessions', filters.value.appName],
    queryFn: () => getSessions(filters.value.appName),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Computed values
  const total = computed(() => data.value?.total ?? 0);
  const ignoredCount = computed(() => data.value?.ignoredCount ?? 0);
  const apps = computed(() => appsData.value?.apps ?? []);
  const sessions = computed(() => sessionsData.value?.sessions ?? []);
  
  const hasMore = computed(() => {
    const currentCount = offset.value + (data.value?.logs.length ?? 0);
    return currentCount < total.value;
  });

  // Update allLogs when data changes
  watch(data, (newData) => {
    if (!newData) return;
    
    if (offset.value === 0) {
      // Reset: new search or filter
      allLogs.value = newData.logs;
    } else {
      // Append: load more
      allLogs.value = [...allLogs.value, ...newData.logs];
    }
  }, { immediate: true });

  // Methods
  function setFilters(newFilters: LogFilters) {
    filters.value = newFilters;
    offset.value = 0;
    allLogs.value = [];
  }

  function updateFilter<K extends keyof LogFilters>(key: K, value: LogFilters[K]) {
    filters.value = { ...filters.value, [key]: value };
    offset.value = 0;
    allLogs.value = [];
  }

  function clearFilters() {
    filters.value = {};
    offset.value = 0;
    allLogs.value = [];
    if (urlFilters) {
      urlFilters.clearFilters();
    }
  }

  function loadMore() {
    if (isFetching.value || !hasMore.value) return;
    offset.value = allLogs.value.length;
  }

  function toggleHideIgnored() {
    hideIgnoredErrors.value = !hideIgnoredErrors.value;
    offset.value = 0;
    allLogs.value = [];
  }

  function togglePolling() {
    pollingEnabled.value = !pollingEnabled.value;
  }

  function setPollingInterval(interval: number) {
    pollingInterval.value = interval;
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['logs'] });
  }

  // Add a new log (from WebSocket)
  function addLog(log: LogEntry) {
    allLogs.value = [log, ...allLogs.value].slice(0, 500);
  }

  // Initialize from URL on mount
  onMounted(() => {
    if (urlFilters) {
      urlFilters.initFromUrl();
    }
  });

  // Watch app filter to refetch sessions
  watch(() => filters.value.appName, () => {
    refetchSessions();
  });

  return {
    // State
    filters,
    offset,
    hideIgnoredErrors,
    pollingEnabled,
    pollingInterval,
    
    // Data
    logs: allLogs,
    total,
    ignoredCount,
    apps,
    sessions,
    hasMore,
    
    // Query state
    isLoading,
    isFetching,
    isError,
    error,
    
    // Methods
    setFilters,
    updateFilter,
    clearFilters,
    loadMore,
    toggleHideIgnored,
    togglePolling,
    setPollingInterval,
    refetch,
    invalidate,
    addLog,
    
    // URL sync
    hasActiveFilters: urlFilters?.hasActiveFilters ?? computed(() => false),
  };
}
