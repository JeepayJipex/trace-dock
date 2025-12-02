import { ref, computed, watch, onMounted } from 'vue';
import { useQuery, useQueryClient, useMutation, keepPreviousData } from '@tanstack/vue-query';
import { useUrlFilters } from './useUrlFilters';
import { 
  getErrorGroups, 
  getErrorGroupStats, 
  updateErrorGroupStatus,
  getErrorGroup,
  getErrorGroupOccurrences,
} from '@/api/errors';
import { getApps } from '@/api/logs';
import type { ErrorGroupFilters, ErrorGroup, ErrorGroupStatus } from '@/types';

export interface UseErrorGroupsQueryOptions {
  /** Initial filters */
  initialFilters?: ErrorGroupFilters;
  /** Page size */
  limit?: number;
  /** Enable URL sync for shareable links */
  syncToUrl?: boolean;
  /** Polling interval in ms (0 to disable) */
  pollingInterval?: number;
}

export function useErrorGroupsQuery(options: UseErrorGroupsQueryOptions = {}) {
  const {
    initialFilters = {},
    limit = 20,
    syncToUrl = true,
  } = options;

  const queryClient = useQueryClient();
  
  // State
  const filters = ref<ErrorGroupFilters>({ 
    sortBy: 'last_seen',
    sortOrder: 'desc',
    ...initialFilters,
  });
  const offset = ref(0);
  const pollingEnabled = ref(false);
  const pollingInterval = ref(10000); // 10 seconds default
  
  // All loaded error groups (for infinite scroll)
  const allErrorGroups = ref<ErrorGroup[]>([]);

  // URL sync
  const urlFilters = syncToUrl 
    ? useUrlFilters(filters, {
        defaults: { sortBy: 'last_seen', sortOrder: 'desc' },
      })
    : null;

  // Query key
  const queryKey = computed(() => [
    'errorGroups',
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
    queryFn: () => getErrorGroups(filters.value, limit, offset.value),
    placeholderData: keepPreviousData,
    refetchInterval: computed(() => pollingEnabled.value ? pollingInterval.value : false),
    staleTime: 1000 * 10,
  });

  // Stats query
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['errorGroupStats'],
    queryFn: getErrorGroupStats,
    staleTime: 1000 * 30,
  });

  // Apps query for filter dropdown
  const { data: appsData } = useQuery({
    queryKey: ['apps'],
    queryFn: getApps,
    staleTime: 1000 * 60 * 5,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ErrorGroupStatus }) => 
      updateErrorGroupStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['errorGroups'] });
      queryClient.invalidateQueries({ queryKey: ['errorGroupStats'] });
    },
  });

  // Computed values
  const total = computed(() => data.value?.total ?? 0);
  const apps = computed(() => appsData.value?.apps ?? []);
  const stats = computed(() => statsData.value);
  
  const hasMore = computed(() => {
    const currentCount = offset.value + (data.value?.errorGroups.length ?? 0);
    return currentCount < total.value;
  });

  // Update allErrorGroups when data changes
  watch(data, (newData) => {
    if (!newData) return;
    
    if (offset.value === 0) {
      allErrorGroups.value = newData.errorGroups;
    } else {
      allErrorGroups.value = [...allErrorGroups.value, ...newData.errorGroups];
    }
  }, { immediate: true });

  // Methods
  function setFilters(newFilters: ErrorGroupFilters) {
    filters.value = { ...filters.value, ...newFilters };
    offset.value = 0;
    allErrorGroups.value = [];
  }

  function updateFilter<K extends keyof ErrorGroupFilters>(key: K, value: ErrorGroupFilters[K]) {
    filters.value = { ...filters.value, [key]: value };
    offset.value = 0;
    allErrorGroups.value = [];
  }

  function clearFilters() {
    filters.value = { sortBy: 'last_seen', sortOrder: 'desc' };
    offset.value = 0;
    allErrorGroups.value = [];
    if (urlFilters) {
      urlFilters.clearFilters();
    }
  }

  function loadMore() {
    if (isFetching.value || !hasMore.value) return;
    offset.value = allErrorGroups.value.length;
  }

  function togglePolling() {
    pollingEnabled.value = !pollingEnabled.value;
  }

  function setPollingInterval(interval: number) {
    pollingInterval.value = interval;
  }

  async function updateStatus(id: string, status: ErrorGroupStatus) {
    await updateStatusMutation.mutateAsync({ id, status });
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['errorGroups'] });
    queryClient.invalidateQueries({ queryKey: ['errorGroupStats'] });
  }

  // Initialize from URL on mount
  onMounted(() => {
    if (urlFilters) {
      urlFilters.initFromUrl();
    }
  });

  return {
    // State
    filters,
    offset,
    pollingEnabled,
    pollingInterval,
    
    // Data
    errorGroups: allErrorGroups,
    total,
    apps,
    stats,
    hasMore,
    
    // Query state
    isLoading,
    isFetching,
    isError,
    error,
    isUpdatingStatus: computed(() => updateStatusMutation.isPending.value),
    
    // Methods
    setFilters,
    updateFilter,
    clearFilters,
    loadMore,
    togglePolling,
    setPollingInterval,
    updateStatus,
    refetch,
    refetchStats,
    invalidate,
    
    // URL sync
    hasActiveFilters: urlFilters?.hasActiveFilters ?? computed(() => false),
  };
}

/**
 * Query for a single error group detail
 */
export function useErrorGroupQuery(id: () => string) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: computed(() => ['errorGroup', id()]),
    queryFn: () => getErrorGroup(id()),
    enabled: computed(() => !!id()),
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: ErrorGroupStatus) => updateErrorGroupStatus(id(), status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['errorGroup', id()] });
      queryClient.invalidateQueries({ queryKey: ['errorGroups'] });
      queryClient.invalidateQueries({ queryKey: ['errorGroupStats'] });
    },
  });

  return {
    errorGroup: data,
    isLoading,
    isError,
    error,
    refetch,
    updateStatus: (status: ErrorGroupStatus) => updateStatusMutation.mutateAsync(status),
    isUpdatingStatus: computed(() => updateStatusMutation.isPending.value),
  };
}

/**
 * Query for error group occurrences (logs)
 */
export function useErrorGroupOccurrencesQuery(id: () => string, options: { limit?: number } = {}) {
  const { limit = 50 } = options;
  const offset = ref(0);
  const allLogs = ref<unknown[]>([]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: computed(() => ['errorGroupOccurrences', id(), offset.value]),
    queryFn: () => getErrorGroupOccurrences(id(), limit, offset.value),
    enabled: computed(() => !!id()),
    placeholderData: keepPreviousData,
  });

  const total = computed(() => data.value?.total ?? 0);
  const hasMore = computed(() => {
    const currentCount = offset.value + (data.value?.logs.length ?? 0);
    return currentCount < total.value;
  });

  // Update allLogs when data changes
  watch(data, (newData) => {
    if (!newData) return;
    
    if (offset.value === 0) {
      allLogs.value = newData.logs;
    } else {
      allLogs.value = [...allLogs.value, ...newData.logs];
    }
  });

  function loadMore() {
    if (isFetching.value || !hasMore.value) return;
    offset.value = allLogs.value.length;
  }

  function reset() {
    offset.value = 0;
    allLogs.value = [];
  }

  return {
    logs: allLogs,
    total,
    hasMore,
    isLoading,
    isFetching,
    isError,
    error,
    loadMore,
    reset,
    refetch,
  };
}
