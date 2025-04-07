/**
 * Core type definitions for the db-change-notifier package.
 */

import { PostgresFieldTypes } from './enums';

/**
 * Database type supported by the notifier
 */
export enum DatabaseType {
    POSTGRESQL = 'postgresql',
    // MONGODB = 'mongodb',
}

/**
 * Type of database operation
 */
export enum OperationType {
    INSERT = 'insert',
    UPDATE = 'update',
    DELETE = 'delete',
    REPLACE = 'replace',
    DROP = 'drop',
    TRUNCATE = 'truncate',
    UNKNOWN = 'unknown',
}

/**
 * Delivery mechanism for change notifications
 */
export enum DeliveryMethod {
    SERVER_SENT_EVENTS = 'sse',
    WEBSOCKET = 'websocket',
    HTTP_WEBHOOK = 'webhook',
    CUSTOM = 'custom',
}

/**
 * Configuration for the database connection
 */
export interface DatabaseConfig {
    type: DatabaseType;
    connection: PostgresConnectionConfig;
}

/**
 * PostgreSQL connection configuration
 */

export interface PostgresConnectionConfig {
    host: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    ssl?:
        | boolean
        | {
              rejectUnauthorized?: boolean;
              ca?: string;
              key?: string;
              cert?: string;
              [key: string]: unknown;
          };
    connectionTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    max?: number;
}

/**
 * MongoDB connection configuration
 */
// export interface MongoConnectionConfig {
//     uri: string;
//     dbName?: string;
//     options?: {
//         useNewUrlParser?: boolean;
//         useUnifiedTopology?: boolean;
//         maxPoolSize?: number;
//         serverSelectionTimeoutMS?: number;
//         socketTimeoutMS?: number;
//         [key: string]: unknown;
//     };
// }

/**
 * Filter for which tables/collections to monitor
 */
export interface TableFilter {
    include?: string[]; // Tables/collections to include
    exclude?: string[]; // Tables/collections to exclude
    schemas?: string[]; // PostgreSQL schemas to monitor
}

/**
 * Delivery configuration for change notifications
 */
export interface DeliveryConfig {
    method: DeliveryMethod;
    options: SSEOptions | WebSocketOptions | WebhookOptions | CustomDeliveryOptions;
}

/**
 * Options for Server-Sent Events delivery
 */
export interface SSEOptions {
    path?: string;
    heartbeatInterval?: number;
}

/**
 * Options for WebSocket delivery
 */
export interface WebSocketOptions {
    path?: string;
    port?: number;
    server?: unknown; // User can provide their own server instance
}

/**
 * Options for webhook delivery
 */
export interface WebhookOptions {
    url: string;
    headers?: Record<string, string>;
    retryStrategy?: RetryStrategy;
    timeout?: number;
}

/**
 * Options for custom delivery mechanism
 */
export interface CustomDeliveryOptions {
    handler: (event: ChangeEvent) => Promise<void> | void;
}

/**
 * Retry strategy for delivery failures
 */
export interface RetryStrategy {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
}

/**
 * Main configuration for the notifier
 */
export interface NotifierConfig {
    database: DatabaseConfig;
    tables?: TableFilter;
    delivery: DeliveryConfig | DeliveryConfig[];
    batchingEnabled?: boolean;
    batchSize?: number;
    batchTimeWindowMs?: number;
    transformations?: TransformationConfig[];
    logLevel?: LogLevel;
}

/**
 * Transformation configuration for events
 */
export interface TransformationConfig {
    tablePattern: string | RegExp;
    transform: (event: ChangeEvent) => ChangeEvent | null;
}

/**
 * Log level enum
 */
export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    NONE = 'none',
}

/**
 * Base change event structure
 */
export interface ChangeEvent {
    id: string;
    timestamp: string;
    operation: OperationType;
    database: {
        type: DatabaseType;
        name: string;
    };
    source: {
        table: string;
        schema?: string; // PostgreSQL specific
    };
    data: {
        new?: Record<string, unknown> | null;
        old?: Record<string, unknown> | null;
    };
    metadata?: Record<string, unknown>;
}

/**
 * Response from creating a change notifier
 */
export interface NotifierResponse {
    id: string;
    status: 'success' | 'error';
    message?: string;
    details?: Record<string, unknown>;
}

/**
 * Change listener interface
 */
export interface ChangeListener {
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    onError(handler: (error: Error) => void): void;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter extends ChangeListener {
    setupChangeNotifications(tables: TableFilter): Promise<void>;
    teardownChangeNotifications(): Promise<void>;
    testConnection(): Promise<boolean>;
    getAdapterInfo(): { type: DatabaseType; version: string };
    onChangeEvent(handler: (event: ChangeEvent) => void): void;
}

/**
 * Event delivery interface
 */
export interface EventDelivery {
    initialize(): Promise<void>;
    deliver(event: ChangeEvent | ChangeEvent[]): Promise<void>;
    close(): Promise<void>;
}

/**
 * Stats for the notifier
 */
export interface NotifierStats {
    startTime: Date;
    eventsProcessed: number;
    eventsByOperation: Record<OperationType, number>;
    eventsByTable: Record<string, number>;
    deliveryAttempts: number;
    deliverySuccesses: number;
    deliveryFailures: number;
    lastEventTime?: Date;
    errors: Array<{
        time: Date;
        message: string;
        count: number;
    }>;
}
