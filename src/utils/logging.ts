/**
 * Logging utilities for db-change-notifier
 */
import { LogLevel } from '../types';

// Current log level
let currentLogLevel = LogLevel.INFO;

/**
 * Set the global log level
 *
 * @param level New log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current log level
 *
 * @returns Current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Check if a given log level is enabled
 *
 * @param level Log level to check
 * @returns True if the log level is enabled
 */
function isLevelEnabled(level: LogLevel): boolean {
  const levels = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
    [LogLevel.NONE]: 4,
  };

  return levels[level] >= levels[currentLogLevel];
}

/**
 * Format a log message with context
 *
 * @param message Log message
 * @param context Additional context
 * @returns Formatted log message
 */
function formatLog(message: string, context?: Record<string, unknown>): string {
  if (!context) {
    return message;
  }

  return `${message} ${JSON.stringify(context)}`;
}

/**
 * Log a debug message
 *
 * @param message Log message
 * @param context Additional context
 */
export function debug(message: string, context?: Record<string, unknown>): void {
  if (!isLevelEnabled(LogLevel.DEBUG)) {
    return;
  }

  console.debug(`[db-change-notifier] ${formatLog(message, context)}`);
}

/**
 * Log an info message
 *
 * @param message Log message
 * @param context Additional context
 */
export function info(message: string, context?: Record<string, unknown>): void {
  if (!isLevelEnabled(LogLevel.INFO)) {
    return;
  }

  console.info(`[db-change-notifier] ${formatLog(message, context)}`);
}

/**
 * Log a warning message
 *
 * @param message Log message
 * @param context Additional context
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  if (!isLevelEnabled(LogLevel.WARN)) {
    return;
  }

  console.warn(`[db-change-notifier] ${formatLog(message, context)}`);
}

/**
 * Log an error message
 *
 * @param message Log message
 * @param context Additional context
 */
export function error(message: string, context?: Record<string, unknown>): void {
  if (!isLevelEnabled(LogLevel.ERROR)) {
    return;
  }

  console.error(`[db-change-notifier] ${formatLog(message, context)}`);
}
