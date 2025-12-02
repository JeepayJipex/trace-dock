import { ref } from 'vue';

// Beautiful color palette for apps - each has bg, text, and border variants
const APP_COLORS = [
  { name: 'purple', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' },
  { name: 'blue', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  { name: 'cyan', bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-500' },
  { name: 'teal', bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' },
  { name: 'emerald', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  { name: 'green', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
  { name: 'lime', bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30', dot: 'bg-lime-500' },
  { name: 'yellow', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
  { name: 'amber', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  { name: 'orange', bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  { name: 'rose', bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', dot: 'bg-rose-500' },
  { name: 'pink', bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-500' },
  { name: 'fuchsia', bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', dot: 'bg-fuchsia-500' },
  { name: 'violet', bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30', dot: 'bg-violet-500' },
  { name: 'indigo', bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', dot: 'bg-indigo-500' },
  { name: 'sky', bg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/30', dot: 'bg-sky-500' },
] as const;

export type AppColor = typeof APP_COLORS[number];

const STORAGE_KEY = 'trace-dock-app-colors';

const appColorMap = ref<Map<string, AppColor>>(new Map());

function loadFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, string>;
      for (const [appName, colorName] of Object.entries(parsed)) {
        const color = APP_COLORS.find(c => c.name === colorName);
        if (color) {
          appColorMap.value.set(appName, color);
        }
      }
    }
  } catch {
    // Ignore localStorage errors
  }
}

function saveToStorage(): void {
  try {
    const data: Record<string, string> = {};
    for (const [appName, color] of appColorMap.value.entries()) {
      data[appName] = color.name;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return Math.abs(hash);
}

loadFromStorage();

/**
 * Composable for managing consistent app colors
 */
export function useAppColors() {
  /**
   * Get the color for an app name
   * Returns a consistent color based on the app name hash
   */
  function getAppColor(appName: string): AppColor {
    const existing = appColorMap.value.get(appName);
    if (existing) {
      return existing;
    }

    const hash = hashString(appName);
    const colorIndex = hash % APP_COLORS.length;
    const color = APP_COLORS[colorIndex];

    appColorMap.value.set(appName, color);
    saveToStorage();

    return color;
  }

  /**
   * Get all assigned colors
   */
  function getAllAppColors(): Map<string, AppColor> {
    return appColorMap.value;
  }

  /**
   * Clear all assigned colors
   */
  function clearAppColors(): void {
    appColorMap.value.clear();
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    getAppColor,
    getAllAppColors,
    clearAppColors,
    APP_COLORS,
  };
}
