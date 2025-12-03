import type { SourceLocation } from './types';

/**
 * Regex patterns to parse different stack trace formats
 */

// Chrome/Node.js format: "    at functionName (file:line:column)" or "    at file:line:column"
const CHROME_STACK_REGEX = /^\s*at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?$/;

// Firefox format: "functionName@file:line:column" or "file:line:column"
const FIREFOX_STACK_REGEX = /^(?:(.+)@)?(.+):(\d+):(\d+)$/;

/**
 * Number of stack frames to skip to get to the actual caller
 * This accounts for: Error, getSourceLocation, log method, and the Logger method (debug/info/warn/error)
 */
const DEFAULT_STACK_SKIP = 4;

/**
 * Parses a single stack frame line
 */
function parseStackFrame(line: string): SourceLocation | null {
  // Try Chrome/Node.js format first
  let match = line.match(CHROME_STACK_REGEX);
  if (match) {
    return {
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      function: match[1] || undefined,
    };
  }

  // Try Firefox format
  match = line.match(FIREFOX_STACK_REGEX);
  if (match) {
    return {
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      function: match[1] || undefined,
    };
  }

  return null;
}

/**
 * Gets the source location of the caller
 * @param skip Number of stack frames to skip (default: 4)
 * @returns SourceLocation object or undefined if unable to parse
 */
export function getSourceLocation(skip: number = DEFAULT_STACK_SKIP): SourceLocation | undefined {
  const error = new Error();
  const stack = error.stack;

  if (!stack) {
    return undefined;
  }

  const lines = stack.split('\n');
  
  // Find the first valid stack frame after skipping
  for (let i = skip; i < lines.length; i++) {
    const location = parseStackFrame(lines[i]);
    if (location) {
      return location;
    }
  }

  return undefined;
}

/**
 * Formats a source location for display
 */
export function formatSourceLocation(location: SourceLocation): string {
  const func = location.function ? `${location.function} ` : '';
  return `${func}(${location.file}:${location.line}:${location.column})`;
}
