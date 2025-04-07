// src/index.ts (corrected)
/**
 * db-change-notifier
 * Real-time database change notification library for PostgreSQL
 */

import { NotifierConfig, NotifierResponse, ChangeEvent, ChangeListener, DatabaseType, OperationType, LogLevel } from './types';
import { createNotifier } from './core';
import { validateConfig } from './config';
import { DBChangeError } from './errors';
import { setLogLevel } from './utils/logging';

/**
 * Creates a new change notifier instance
 * 
 * @param config Configuration for the notifier
 * @returns A Promise that resolves to the notifier response
 * @throws {DBChangeError} If configuration is invalid or setup fails
 */
export async function createChangeNotifier(config: NotifierConfig): Promise<NotifierResponse> {
  // Validate configuration
  console.log('Validating configuration...');
  validateConfig(config);
  
  // Set log level if provided
  if (config.logLevel) {
    setLogLevel(config.logLevel);
  }
  
  try {
    // Create and return the notifier
    return await createNotifier(config);
  } catch (error) {
    if (error instanceof DBChangeError) {
      throw error;
    }
    throw new DBChangeError('Failed to create change notifier', { cause: error });
  }
}

// Re-export types and enums for users of the package
// Use 'export type' for type-only exports
export type { NotifierConfig, NotifierResponse, ChangeEvent, ChangeListener } from './types';

// Enums can be re-exported normally since they generate runtime code
export { DatabaseType, OperationType, LogLevel } from './types';

// Error classes
export { DBChangeError } from './errors';

// Package version
export const version = '1.0.0';