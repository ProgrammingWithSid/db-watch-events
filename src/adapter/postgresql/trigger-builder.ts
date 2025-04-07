/**
 * PostgreSQL trigger builder
 * Utility for generating SQL statements to create triggers
 */

export interface TriggerOptions {
    triggerName: string;
    schemaName: string;
    tableName: string;
    functionName: string;
    operations: Array<'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE'>;
    condition?: string;
    timing?: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
    forEachRow?: boolean;
  }
  
  /**
   * Build SQL to create a trigger for change notifications
   * 
   * @param options Trigger options
   * @returns SQL string to create the trigger
   */
  export function buildTriggerSQL(options: TriggerOptions): string {
    const {
      triggerName,
      schemaName,
      tableName,
      functionName,
      operations,
      condition,
      timing = 'AFTER',
      forEachRow = true
    } = options;
  
    // Validate required fields
    if (!triggerName || !schemaName || !tableName || !functionName || !operations.length) {
      throw new Error('Missing required trigger options');
    }
  
    // Build the operations string
    const operationsStr = operations.join(' OR ');
  
    // Build the trigger SQL
    let sql = `
      DROP TRIGGER IF EXISTS ${triggerName} ON "${schemaName}"."${tableName}";
      
      CREATE TRIGGER ${triggerName}
      ${timing} ${operationsStr}
      ON "${schemaName}"."${tableName}"
      ${forEachRow ? 'FOR EACH ROW' : 'FOR EACH STATEMENT'}
    `;
  
    // Add condition if provided
    if (condition) {
      sql += `\n    WHEN (${condition})`;
    }
  
    // Add the function execution
    sql += `\n    EXECUTE FUNCTION ${functionName}();`;
  
    return sql;
  }
  
  /**
   * Build SQL to drop a trigger
   * 
   * @param triggerName Name of the trigger to drop
   * @param schemaName Schema containing the table
   * @param tableName Table containing the trigger
   * @returns SQL string to drop the trigger
   */
  export function buildDropTriggerSQL(
    triggerName: string,
    schemaName: string,
    tableName: string
  ): string {
    return `DROP TRIGGER IF EXISTS ${triggerName} ON "${schemaName}"."${tableName}";`;
  }
  
  /**
   * Build SQL to create the notification function
   * 
   * @param functionName Name of the function to create
   * @param channel Notification channel to use
   * @returns SQL string to create the notification function
   */
  export function buildNotificationFunctionSQL(
    functionName: string,
    channel: string
  ): string {
    return `
      CREATE OR REPLACE FUNCTION ${functionName}()
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
        PERFORM pg_notify('${channel}', payload::text);
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `;
  }