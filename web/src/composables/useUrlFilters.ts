import { computed, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export interface UseUrlFiltersOptions<T extends Record<string, unknown>> {
  /** Default values for filters */
  defaults?: Partial<T>;
  /** Keys to exclude from URL sync */
  exclude?: (keyof T)[];
  /** Custom serializers for specific keys */
  serializers?: Partial<Record<keyof T, (value: unknown) => string | undefined>>;
  /** Custom deserializers for specific keys */
  deserializers?: Partial<Record<keyof T, (value: string) => unknown>>;
}

/**
 * Composable for syncing filters with URL query parameters
 * Enables shareable URLs with filter state
 */
export function useUrlFilters<T extends Record<string, unknown>>(
  filters: Ref<T>,
  options: UseUrlFiltersOptions<T> = {}
) {
  const route = useRoute();
  const router = useRouter();
  
  const defaults = (options.defaults || {}) as Partial<T>;
  const exclude = (options.exclude || []) as (keyof T)[];
  const serializers = (options.serializers || {}) as Partial<Record<keyof T, (value: unknown) => string | undefined>>;
  const deserializers = (options.deserializers || {}) as Partial<Record<keyof T, (value: string) => unknown>>;

  // Parse URL params into filters on init
  function parseUrlParams(): Partial<T> {
    const result: Partial<T> = {};
    const query = route.query;
    
    for (const [key, value] of Object.entries(query)) {
      if (exclude.includes(key as keyof T)) continue;
      if (value === null || value === undefined) continue;
      
      const stringValue = Array.isArray(value) ? value[0] : value;
      if (!stringValue) continue;
      
      // Use custom deserializer if available
      const deserializer = deserializers[key as keyof T];
      if (deserializer) {
        (result as Record<string, unknown>)[key] = deserializer(stringValue);
      } else {
        // Default: try to parse as number, otherwise keep as string
        const numValue = Number(stringValue);
        (result as Record<string, unknown>)[key] = !Number.isNaN(numValue) && stringValue === String(numValue) 
          ? numValue 
          : stringValue;
      }
    }
    
    return result;
  }

  // Serialize filters to URL params
  function serializeToUrl(newFilters: T) {
    const query: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(newFilters)) {
      if (exclude.includes(key as keyof T)) continue;
      if (value === null || value === undefined || value === '') continue;
      if (defaults[key as keyof T] === value) continue; // Don't include defaults
      
      // Use custom serializer if available
      const serializer = serializers[key as keyof T];
      if (serializer) {
        const serialized = serializer(value);
        if (serialized !== undefined) {
          query[key] = serialized;
        }
      } else {
        query[key] = String(value);
      }
    }
    
    return query;
  }

  // Update URL when filters change
  function syncToUrl() {
    const query = serializeToUrl(filters.value);
    
    // Only update if query actually changed
    const currentQuery = { ...route.query };
    
    // Remove excluded keys from comparison
    for (const key of exclude) {
      delete currentQuery[key as string];
    }
    
    const currentQueryStr = JSON.stringify(currentQuery);
    const newQueryStr = JSON.stringify(query);
    
    if (currentQueryStr !== newQueryStr) {
      router.replace({ query: { ...route.query, ...query } });
    }
  }

  // Initialize filters from URL
  function initFromUrl() {
    const urlFilters = parseUrlParams();
    if (Object.keys(urlFilters).length > 0) {
      filters.value = { ...filters.value, ...urlFilters } as T;
    }
  }

  // Computed to check if any filters are active
  const hasActiveFilters = computed(() => {
    for (const [key, value] of Object.entries(filters.value)) {
      if (exclude.includes(key as keyof T)) continue;
      if (value === null || value === undefined || value === '') continue;
      if ((defaults as Record<string, unknown>)[key] === value) continue;
      return true;
    }
    return false;
  });

  // Clear all filters
  function clearFilters() {
    const cleared = { ...defaults } as T;
    for (const key of Object.keys(filters.value)) {
      if (!(key in cleared)) {
        (cleared as Record<string, unknown>)[key] = undefined;
      }
    }
    filters.value = cleared;
    router.replace({ query: {} });
  }

  // Watch for filter changes and sync to URL
  watch(filters, syncToUrl, { deep: true });

  return {
    initFromUrl,
    syncToUrl,
    parseUrlParams,
    hasActiveFilters,
    clearFilters,
  };
}
