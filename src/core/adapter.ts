import { createPostgresAdapter } from '../adapter';
import { DatabaseAdapter, DatabaseConfig, DatabaseType, PostgresConnectionConfig } from '../types';

/**
 * Get a database adapter based on the database type
 *
 * @param config Database configuration
 * @returns Database adapter instance
 * @throws {DBChangeError} If database type is not supported
 */

export function getAdapter(config: DatabaseConfig): DatabaseAdapter {
  const { type, connection } = config;
  if (type === DatabaseType.POSTGRESQL) {
    return createPostgresAdapter(connection);
  }
  throw new Error(`Unsupported database type: ${type}`);
}

/**
 * Get a PostgreSQL adapter
 *
 * @param connection PostgreSQL connection configuration
 * @returns PostgreSQL adapter instance
 */
export function getPostgresAdapter(connection: PostgresConnectionConfig): DatabaseAdapter {
  return createPostgresAdapter(connection);
}
