/**
 * Generates a unique ID using crypto API or fallback
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets the current ISO timestamp
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parses an error to extract stack trace
 */
export function parseStackTrace(error?: Error | unknown): string | undefined {
  if (!error) return undefined;
  
  if (error instanceof Error) {
    return error.stack;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/**
 * Creates a stack trace from current position
 */
export function createStackTrace(): string {
  const error = new Error();
  const stack = error.stack || '';
  
  // Remove the first few lines (Error, createStackTrace, and caller)
  const lines = stack.split('\n');
  return lines.slice(3).join('\n');
}

/**
 * Safe JSON stringify with circular reference handling
 */
export function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    return value;
  });
}
