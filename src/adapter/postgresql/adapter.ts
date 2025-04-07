/**
 * PostgreSQL adapter implementation
 */
import { Client, Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { 
  DatabaseAdapter, 
  DatabaseType, 
  PostgresConnectionConfig,
  OperationType,
  TableFilter,
  ChangeEvent
} from '../../types';
import { DBChangeError } from '../../errors';
import { buildTriggerSQL } from './trigger-builder';
import { createNotificationListener } from './notification-listener';
import { debug, info, error, warn } from '../../utils/logging';

/**
 * PostgreSQL adapter for database change notifications
 */
export class PostgresAdapter implements DatabaseAdapter {
  private id: string;
  private config: PostgresConnectionConfig;
  private pool: Pool;
  private pgNotifyChannel = 'db_change_notifications';
  private isListening = false;
  private notificationListener: ReturnType<typeof createNotificationListener> | null = null;
  private errorHandlers: Array<(error: Error) => void> = [];
  private initialized = false;
  private triggers: { name: string; table: string; schema: string }[] = [];

  /**
   * Create a new PostgreSQL adapter
   * 
   * @param config PostgreSQL connection configuration
   */
  constructor(config: PostgresConnectionConfig) {
    this.id = uuidv4();
    this.config = config;
    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.handleError(err);
    });
  }

  /**
   * Start listening for database changes
   */
  public async start(): Promise<void> {
    if (this.isListening) {
      warn('PostgreSQL adapter already listening for changes', { id: this.id });
      return;
    }

    try {
        console.log("ABOUT TO CREATE NOTIFICATION LISTENER", {
            channel: this.pgNotifyChannel,
            connection: { ...this.config, password: "REDACTED" }
          });
      // Create notification listener
      this.notificationListener = createNotificationListener({
        connectionConfig: this.config,
        channel: this.pgNotifyChannel,
        onNotification: (payload) => {
            console.log("NOTIFICATION RECEIVED:", payload);
            this.handleNotification(payload);
          },
          onError: (err) => {
            console.error("NOTIFICATION LISTENER ERROR:", err);
            this.handleError(err);
          }
      });

      console.log("ATTEMPTING TO CONNECT NOTIFICATION LISTENER");
      await this.notificationListener.connect();
      console.log("NOTIFICATION LISTENER CONNECTED SUCCESSFULLY");
      this.isListening = true;
      
      info('PostgreSQL adapter started listening for changes', { id: this.id });
    } catch (err) {
        console.error("FAILED TO CONNECT NOTIFICATION LISTENER", err);
      error('Failed to start PostgreSQL adapter', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      throw new DBChangeError('Failed to start PostgreSQL adapter', { cause: err });
    }
  }

  /**
   * Stop listening for database changes
   */
  public async stop(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    try {
      if (this.notificationListener) {
        await this.notificationListener.disconnect();
        this.notificationListener = null;
      }

      this.isListening = false;
      info('PostgreSQL adapter stopped listening for changes', { id: this.id });
    } catch (err) {
      error('Error stopping PostgreSQL adapter', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      throw new DBChangeError('Failed to stop PostgreSQL adapter', { cause: err });
    }
  }

  /**
   * Check if the adapter is currently listening for changes
   */
  public isRunning(): boolean {
    return this.isListening;
  }

  /**
   * Register an error handler
   * 
   * @param handler Function to call when an error occurs
   */
  public onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Set up change notifications for the specified tables
   * 
   * @param tableFilter Filter specifying which tables to monitor
   */
  public async setupChangeNotifications(tableFilter: TableFilter): Promise<void> {
    if (this.initialized) {
      warn('Change notifications already set up', { id: this.id });
      return;
    }

    debug('Setting up change notifications', { id: this.id, filter: tableFilter });

    const client = await this.pool.connect();
    try {
      // Begin transaction
      await client.query('BEGIN');

      // Create notification function if it doesn't exist
      await client.query(`
        CREATE OR REPLACE FUNCTION notify_db_changes()
        RETURNS trigger AS $$
        DECLARE
          payload jsonb;
          operation text;
        BEGIN
          -- Determine operation type
          IF TG_OP = 'INSERT' THEN
            operation := 'insert';
            payload := jsonb_build_object(
              'operation', operation,
              'schema', TG_TABLE_SCHEMA,
              'table', TG_TABLE_NAME,
              'data', jsonb_build_object('new', row_to_json(NEW)::jsonb)
            );
          ELSIF TG_OP = 'UPDATE' THEN
            operation := 'update';
            payload := jsonb_build_object(
              'operation', operation,
              'schema', TG_TABLE_SCHEMA,
              'table', TG_TABLE_NAME,
              'data', jsonb_build_object(
                'new', row_to_json(NEW)::jsonb,
                'old', row_to_json(OLD)::jsonb
              )
            );
          ELSIF TG_OP = 'DELETE' THEN
            operation := 'delete';
            payload := jsonb_build_object(
              'operation', operation,
              'schema', TG_TABLE_SCHEMA,
              'table', TG_TABLE_NAME,
              'data', jsonb_build_object('old', row_to_json(OLD)::jsonb)
            );
          ELSE
            operation := 'unknown';
            payload := jsonb_build_object(
              'operation', operation,
              'schema', TG_TABLE_SCHEMA,
              'table', TG_TABLE_NAME
            );
          END IF;

          -- Add metadata
          payload := payload || jsonb_build_object(
            'id', gen_random_uuid(),
            'timestamp', extract(epoch from clock_timestamp())
          );

          -- Send notification
          PERFORM pg_notify('db_change_notifications', payload::text);
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
      `);

      // Get table list based on filter
      const tables = await this.getTableList(client, tableFilter);

      // Create triggers for each table
      for (const table of tables) {
        const { schema, name } = table;
        const triggerName = `db_change_notify_${schema}_${name}`;

        // Create trigger for this table
        const triggerSQL = buildTriggerSQL({
          triggerName,
          schemaName: schema,
          tableName: name,
          functionName: 'notify_db_changes',
          operations: ['INSERT', 'UPDATE', 'DELETE']
        });

        await client.query(triggerSQL);

        // Store trigger info for later cleanup
        this.triggers.push({
          name: triggerName,
          table: name,
          schema: schema
        });

        debug('Created trigger', { id: this.id, trigger: triggerName, table: `${schema}.${name}` });
      }

      // Commit transaction
      await client.query('COMMIT');
      this.initialized = true;

      info('Set up change notifications', { 
        id: this.id, 
        tableCount: tables.length 
      });
    } catch (err) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      error('Failed to set up change notifications', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      throw new DBChangeError('Failed to set up change notifications', { cause: err });
    } finally {
      client.release();
    }
  }

  /**
   * Teardown change notifications
   */
  public async teardownChangeNotifications(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    debug('Tearing down change notifications', { id: this.id });

    const client = await this.pool.connect();
    try {
      // Begin transaction
      await client.query('BEGIN');

      // Drop all triggers
      for (const trigger of this.triggers) {
        await client.query(`
          DROP TRIGGER IF EXISTS ${trigger.name} ON "${trigger.schema}"."${trigger.table}";
        `);
        debug('Dropped trigger', { id: this.id, trigger: trigger.name });
      }

      // Commit transaction
      await client.query('COMMIT');
      this.initialized = false;
      this.triggers = [];

      info('Torn down change notifications', { id: this.id });
    } catch (err) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      error('Failed to tear down change notifications', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      throw new DBChangeError('Failed to tear down change notifications', { cause: err });
    } finally {
      client.release();
    }
  }

  /**
   * Test connection to the database
   */
  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      error('Database connection test failed', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      return false;
    }
  }

  /**
   * Get adapter information
   */
  public getAdapterInfo(): { type: DatabaseType; version: string } {
    return {
      type: DatabaseType.POSTGRESQL,
      version: '1.0.0'
    };
  }

  /**
   * Handle notification from PostgreSQL
   * 
   * @param payload Notification payload
   */
  private handleNotification(payload: string): void {
    try {
        console.log("Processing notification...");
      const data = JSON.parse(payload);
      
      // Convert to standard change event format
      const event: ChangeEvent = {
        id: data.id || uuidv4(),
        timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString(),
        operation: this.mapOperationType(data.operation),
        database: {
          type: DatabaseType.POSTGRESQL,
          name: this.config.database
        },
        source: {
          table: data.table,
          schema: data.schema
        },
        data: {
          new: data.data?.new || null,
          old: data.data?.old || null
        }
      };
      console.log("Created change event:", event.id, event.operation, event.source.table);

      // Emit the event
      this.emitChangeEvent(event);
    } catch (err) {
      error('Error processing PostgreSQL notification', { 
        id: this.id, 
        payload, 
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Map PostgreSQL operation type to standard operation type
   * 
   * @param pgOperation PostgreSQL operation type
   * @returns Standardized operation type
   */
  private mapOperationType(pgOperation: string): OperationType {
    switch (pgOperation.toLowerCase()) {
      case 'insert':
        return OperationType.INSERT;
      case 'update':
        return OperationType.UPDATE;
      case 'delete':
        return OperationType.DELETE;
      case 'truncate':
        return OperationType.TRUNCATE;
      default:
        return OperationType.UNKNOWN;
    }
  }

  /**
     * Register a change event handler
     * 
     * @param handler Function to call when a change event occurs
     */
    public onChangeEvent(handler: (event: ChangeEvent) => void): void {
        this.changeEventHandler = handler;
    }

  private changeEventHandler: ((event: ChangeEvent) => void) | null = null;


  /**
   * Emit a change event
   * 
   * @param event The change event to emit
   */
  private emitChangeEvent(event: ChangeEvent): void {
    // Log the event
    debug('Change event', { id: this.id, event });
    
    // Call the registered event handler if it exists
    if (this.changeEventHandler) {
        console.log("Calling change event handler");
      this.changeEventHandler(event);
    } else {
      console.warn('No change event handler registered to process events');
    }
  }

  /**
   * Handle error from PostgreSQL
   * 
   * @param err Error object
   */
  private handleError(err: Error): void {
    error('PostgreSQL adapter error', { id: this.id, error: err.message });
    // Notify all registered error handlers
    for (const handler of this.errorHandlers) {
      try {
        handler(err);
      } catch (handlerError) {
        error('Error in error handler', { 
          id: this.id, 
          error: handlerError instanceof Error ? handlerError.message : String(handlerError)
        });
      }
    }
  }

  /**
   * Get list of tables based on filter
   * 
   * @param client Database client
   * @param filter Table filter
   * @returns Array of schema and table names
   */
  private async getTableList(
    client: PoolClient, 
    filter: TableFilter
  ): Promise<Array<{ schema: string; name: string }>> {
    // Default to public schema if not specified
    const schemas = filter.schemas || ['public'];
    
    // Build query to get all tables in the specified schemas
    let query = `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
      AND table_schema = ANY($1::text[])
    `;

    const params: any[] = [schemas];

    // Add include filter if specified
    if (filter.include && filter.include.length > 0) {
      query += ` AND table_name = ANY($2::text[])`;
      params.push(filter.include);
    }

    // Add exclude filter if specified
    if (filter.exclude && filter.exclude.length > 0) {
      query += ` AND table_name != ALL(${params.length + 1}::text[])`;
      params.push(filter.exclude);
    }

    const result = await client.query(query, params);
    
    return result.rows.map(row => ({
      schema: row.table_schema,
      name: row.table_name
    }));
  }
}

/**
 * Create a new PostgreSQL adapter
 * 
 * @param config PostgreSQL connection configuration
 * @returns PostgreSQL adapter instance
 */
export function createPostgresAdapter(config: PostgresConnectionConfig): DatabaseAdapter {
  return new PostgresAdapter(config);
}