import { describe, it, expect } from 'vitest';
import { getSourceLocation, formatSourceLocation } from './source-location';
import type { SourceLocation } from './types';

describe('source-location', () => {
  describe('getSourceLocation', () => {
    it('should return a source location object', () => {
      const location = getSourceLocation(1);
      
      expect(location).toBeDefined();
      expect(location?.file).toBeDefined();
      expect(location?.line).toBeGreaterThan(0);
      expect(location?.column).toBeGreaterThan(0);
    });

    it('should have file, line and column properties', () => {
      const location = getSourceLocation(1);
      
      expect(location).toMatchObject({
        file: expect.any(String),
        line: expect.any(Number),
        column: expect.any(Number),
      });
    });

    it('should return undefined for invalid skip values', () => {
      const location = getSourceLocation(1000);
      expect(location).toBeUndefined();
    });
  });

  describe('formatSourceLocation', () => {
    it('should format location without function name', () => {
      const location: SourceLocation = {
        file: '/path/to/file.ts',
        line: 42,
        column: 10,
      };
      
      const formatted = formatSourceLocation(location);
      expect(formatted).toBe('(/path/to/file.ts:42:10)');
    });

    it('should format location with function name', () => {
      const location: SourceLocation = {
        file: '/path/to/file.ts',
        line: 42,
        column: 10,
        function: 'myFunction',
      };
      
      const formatted = formatSourceLocation(location);
      expect(formatted).toBe('myFunction (/path/to/file.ts:42:10)');
    });
  });
});
