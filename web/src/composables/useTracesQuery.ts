import { ref, computed, watch, onMounted } from 'vue';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query';
import { useUrlFilters } from './useUrlFilters';
import { getTraces, getTraceById, getTraceStats } from '@/api/traces';
import { getApps, getSessions } from '@/api/logs';
import type { TraceFilters, Trace } from '@/types';

export interface UseTracesQueryOptions {
  /** Initial filters */
  initialFilters?: TraceFilters;
  /** Page size */
  limit?: number;
  /** Enable URL sync for shareable links */
  syncToUrl?: boolean;
  /** Polling interval in ms (0 to disable) */
  pollingInterval?: number;
}

export function useTracesQuery(options: UseTracesQueryOptions = {}) {
  const {
    initialFilters = {},
    limit = 20,
    syncToUrl = true,
  } = options;

  const queryClient = useQueryClient();
  
  // State
  const filters = ref<TraceFilters>({ ...initialFilters });
  const offset = ref(0);
  const pollingEnabled = ref(false);
  const pollingInterval = ref(10000); // 10 seconds default
  
  // All loaded traces (for infinite scroll)
  const allTraces = ref<Trace[]>([]);

  // URL sync with custom serializers for numbers
  const urlFilters = syncToUrl 
    ? useUrlFilters(filters, {
        defaults: {},
        serializers: {
          minDuration: (v) => v !== undefined ? String(v) : undefined,
          maxDuration: (v) => v !== undefined ? String(v) : undefined,
        },
        deserializers: {
          minDuration: (v) => Number(v),
          maxDuration: (v) => Number(v),
        },
      })
    : null;

  // Query key
  const queryKey = computed(() => [
    'traces',
    {
      ...filters.value,
      limit,
      offset: offset.value,
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
    queryFn: () => getTraces({ ...filters.value, limit, offset: offset.value }),
    placeholderData: keepPreviousData,
    refetchInterval: computed(() => pollingEnabled.value ? pollingInterval.value : false),
    staleTime: 1000 * 10,
  });

  // Stats query
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['traceStats'],
    queryFn: getTraceStats,
    staleTime: 1000 * 30,
  });

  // Apps query for filter dropdown
  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: getApps,
    staleTime: 1000 * 60 * 5,
  });

  // Sessions query for filter dropdown
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['sessions', filters.value.appName],
    queryFn: () => getSessions(filters.value.appName),
    staleTime: 1000 * 60 * 5,
  });

  // Computed values
  const total = computed(() => data.value?.total ?? 0);
  const apps = computed(() => appsData.value?.apps ?? []);
  const sessions = computed(() => sessionsData.value?.sessions ?? []);
  const stats = computed(() => statsData.value);
  
  const hasMore = computed(() => {
    const currentCount = offset.value + (data.value?.traces.length ?? 0);
    return currentCount < total.value;
  });

  // Update allTraces when data changes
  watch(data, (newData) => {
    if (!newData) return;
    
    if (offset.value === 0) {
      allTraces.value = newData.traces;
    } else {
      allTraces.value = [...allTraces.value, ...newData.traces];
    }
  }, { immediate: true });

  // Methods
  function setFilters(newFilters: TraceFilters) {
    filters.value = newFilters;
    offset.value = 0;
    allTraces.value = [];
  }

  function updateFilter<K extends keyof TraceFilters>(key: K, value: TraceFilters[K]) {
    filters.value = { ...filters.value, [key]: value };
    offset.value = 0;
    allTraces.value = [];
  }

  function clearFilters() {
    filters.value = {};
    offset.value = 0;
    allTraces.value = [];
    if (urlFilters) {
      urlFilters.clearFilters();
    }
  }

  function loadMore() {
    if (isFetching.value || !hasMore.value) return;
    offset.value = allTraces.value.length;
  }

  function togglePolling() {
    pollingEnabled.value = !pollingEnabled.value;
  }

  function setPollingInterval(interval: number) {
    pollingInterval.value = interval;
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['traces'] });
    queryClient.invalidateQueries({ queryKey: ['traceStats'] });
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
    pollingEnabled,
    pollingInterval,
    
    // Data
    traces: allTraces,
    total,
    apps,
    sessions,
    stats,
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
    togglePolling,
    setPollingInterval,
    refetch,
    refetchStats,
    invalidate,
    
    // URL sync
    hasActiveFilters: urlFilters?.hasActiveFilters ?? computed(() => false),
  };
}

/**
 * Query for a single trace with details (spans and logs)
 */
export function useTraceQuery(id: () => string) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: computed(() => ['trace', id()]),
    queryFn: () => getTraceById(id()),
    enabled: computed(() => !!id()),
    staleTime: 1000 * 30,
  });

  return {
    trace: computed(() => data.value?.trace),
    spans: computed(() => data.value?.spans ?? []),
    logs: computed(() => data.value?.logs ?? []),
    isLoading,
    isError,
    error,
    refetch,
  };
}
