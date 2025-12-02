import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppColors } from './useAppColors';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('useAppColors', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getAppColor', () => {
    it('should return a color for an app name', () => {
      const { getAppColor } = useAppColors();
      const color = getAppColor('my-app');

      expect(color).toBeDefined();
      expect(color.name).toBeDefined();
      expect(color.bg).toBeDefined();
      expect(color.text).toBeDefined();
      expect(color.border).toBeDefined();
      expect(color.dot).toBeDefined();
    });

    it('should return consistent color for same app name', () => {
      const { getAppColor } = useAppColors();
      const color1 = getAppColor('test-app');
      const color2 = getAppColor('test-app');

      expect(color1.name).toBe(color2.name);
      expect(color1.bg).toBe(color2.bg);
    });

    it('should return different colors for different apps (usually)', () => {
      const { getAppColor } = useAppColors();
      const colors = new Set<string>();

      // Generate colors for multiple apps
      ['app-1', 'app-2', 'app-3', 'app-4', 'app-5'].forEach(app => {
        const color = getAppColor(app);
        colors.add(color.name);
      });

      // Should have multiple different colors (hash collisions possible but unlikely)
      expect(colors.size).toBeGreaterThan(1);
    });
  });

  describe('getAllAppColors', () => {
    it('should return empty map initially', () => {
      const { getAllAppColors, clearAppColors } = useAppColors();
      clearAppColors();
      const colors = getAllAppColors();

      expect(colors.size).toBe(0);
    });

    it('should contain assigned colors', () => {
      const { getAppColor, getAllAppColors, clearAppColors } = useAppColors();
      clearAppColors();

      getAppColor('app-1');
      getAppColor('app-2');

      const colors = getAllAppColors();
      expect(colors.size).toBe(2);
      expect(colors.has('app-1')).toBe(true);
      expect(colors.has('app-2')).toBe(true);
    });
  });

  describe('clearAppColors', () => {
    it('should clear all assigned colors', () => {
      const { getAppColor, getAllAppColors, clearAppColors } = useAppColors();

      getAppColor('app-1');
      getAppColor('app-2');
      expect(getAllAppColors().size).toBeGreaterThan(0);

      clearAppColors();
      expect(getAllAppColors().size).toBe(0);
    });

    it('should remove from localStorage', () => {
      const { getAppColor, clearAppColors } = useAppColors();

      getAppColor('test-app');
      clearAppColors();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('trace-dock-app-colors');
    });
  });

  describe('APP_COLORS', () => {
    it('should export available colors', () => {
      const { APP_COLORS } = useAppColors();

      expect(APP_COLORS).toBeDefined();
      expect(Array.isArray(APP_COLORS)).toBe(true);
      expect(APP_COLORS.length).toBeGreaterThan(0);
    });

    it('should have proper color structure', () => {
      const { APP_COLORS } = useAppColors();

      APP_COLORS.forEach(color => {
        expect(color.name).toBeDefined();
        expect(color.bg).toMatch(/^bg-/);
        expect(color.text).toMatch(/^text-/);
        expect(color.border).toMatch(/^border-/);
        expect(color.dot).toMatch(/^bg-/);
      });
    });
  });
});
