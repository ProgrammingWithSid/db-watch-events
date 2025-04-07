/**
 * Configuration validation for db-change-notifier
 */
import { PostgresFieldTypes } from './enums';
import { ConfigurationError } from './errors';
import {
  NotifierConfig,
  DatabaseType,
  PostgresConnectionConfig,
  SSEOptions,
  WebSocketOptions,
  WebhookOptions,
  CustomDeliveryOptions,
  RetryStrategy,
  TransformationConfig,
  DeliveryConfig,
  DeliveryMethod,
} from './types';
import { info } from './utils/logging';

/**
 * Validate notifier configuration
 *
 * @param config Notifier configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 */
export function validateConfig(config: NotifierConfig): void {
  validateDatabaseSection(config);
  validateDeliverySection(config);
  validateBatchingSection(config);
  validateTransformationsSection(config);
}

/**
 * Validate database configuration section
 *
 * @param config Notifier configuration
 * @throws {ConfigurationError} If database configuration is invalid
 */
function validateDatabaseSection(config: NotifierConfig): void {
  if (!config.database) {
    throw new ConfigurationError('Database configuration is required');
  }

  if (!Object.values(DatabaseType).includes(config.database.type)) {
    throw new ConfigurationError(`Invalid database type: ${config.database.type}`);
  }

  validateDatabaseConfig(config.database.type, config.database.connection);
}

/**
 * Validate delivery configuration section
 *
 * @param config Notifier configuration
 * @throws {ConfigurationError} If delivery configuration is invalid
 */
function validateDeliverySection(config: NotifierConfig): void {
  if (!config.delivery) {
    throw new ConfigurationError('Delivery configuration is required');
  }

  const deliveryConfigs = Array.isArray(config.delivery) ? config.delivery : [config.delivery];

  if (deliveryConfigs.length === 0) {
    throw new ConfigurationError('At least one delivery method is required');
  }

  deliveryConfigs.forEach(validateSingleDeliveryConfig);
}

/**
 * Validate a single delivery configuration
 *
 * @param deliveryConfig Delivery configuration
 * @throws {ConfigurationError} If delivery configuration is invalid
 */
function validateSingleDeliveryConfig(deliveryConfig: DeliveryConfig): void {
  if (!Object.values(DeliveryMethod).includes(deliveryConfig.method)) {
    throw new ConfigurationError(`Invalid delivery method: ${deliveryConfig.method}`);
  }

  validateDeliveryConfig(deliveryConfig.method, deliveryConfig.options);
}

/**
 * Validate batching configuration section
 *
 * @param config Notifier configuration
 * @throws {ConfigurationError} If batching configuration is invalid
 */
function validateBatchingSection(config: NotifierConfig): void {
  if (!config.batchingEnabled) {
    return;
  }

  if (config.batchSize !== undefined && config.batchSize <= 0) {
    throw new ConfigurationError('Batch size must be greater than 0');
  }

  if (config.batchTimeWindowMs !== undefined && config.batchTimeWindowMs <= 0) {
    throw new ConfigurationError('Batch time window must be greater than 0');
  }
}

/**
 * Validate transformations configuration section
 *
 * @param config Notifier configuration
 * @throws {ConfigurationError} If transformations configuration is invalid
 */
function validateTransformationsSection(config: NotifierConfig): void {
  if (!config.transformations) {
    return;
  }

  config.transformations.forEach(validateSingleTransformation);
}

/**
 * Validate a single transformation configuration
 *
 * @param transformation Transformation configuration
 * @param index Index of the transformation in the array
 * @throws {ConfigurationError} If transformation configuration is invalid
 */
function validateSingleTransformation(transformation: TransformationConfig, index: number): void {
  if (!transformation.tablePattern) {
    throw new ConfigurationError(`Transformation at index ${index} is missing table pattern`);
  }

  if (typeof transformation.transform !== 'function') {
    throw new ConfigurationError(`Transformation at index ${index} is missing transform function`);
  }
}

/**
 * Validate database-specific configuration
 *
 * @param type Database type
 * @param connection Database connection configuration
 * @throws {ConfigurationError} If configuration is invalid
 */
function validateDatabaseConfig(
  type: DatabaseType,
  connection: PostgresConnectionConfig,
): void {
  if (!connection) {
    throw new ConfigurationError('Database connection configuration is required');
  }

  switch (type) {
    case DatabaseType.POSTGRESQL:
      validatePostgresConfig(connection as PostgresConnectionConfig);
      break;
    
    default:
      throw new ConfigurationError(`Unsupported database type: ${type}`);
  }
}

/**
 * Validate PostgreSQL configuration
 *
 * @param config PostgreSQL connection configuration
 * @throws {ConfigurationError} If configuration is invalid
 */
function validatePostgresConfig(config: PostgresConnectionConfig): void {
  const requiredFields: PostgresFieldTypes[] = [
    PostgresFieldTypes.Host,
    PostgresFieldTypes.Database,
    PostgresFieldTypes.User,
    PostgresFieldTypes.Password,
  ];

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new ConfigurationError(`PostgreSQL configuration missing required field: ${field}`);
    }
  }

  if (config.port !== undefined && (typeof config.port !== 'number' || config.port <= 0)) {
    throw new ConfigurationError('PostgreSQL port must be a positive number');
  }

  info('PostgreSQL configuration validated successfully');
}


/**
 * Validate delivery configuration
 *
 * @param method Delivery method
 * @param options Delivery options
 * @throws {ConfigurationError} If configuration is invalid
 */
function validateDeliveryConfig(
  method: DeliveryMethod,
  options: SSEOptions | WebSocketOptions | WebhookOptions | CustomDeliveryOptions,
): void {
  if (!options) {
    throw new ConfigurationError(`Delivery options are required for method: ${method}`);
  }

  switch (method) {
    case DeliveryMethod.SERVER_SENT_EVENTS:
      validateSSEOptions(options as SSEOptions);
      break;

    case DeliveryMethod.WEBSOCKET:
      validateWebSocketOptions(options as WebSocketOptions);
      break;

    case DeliveryMethod.HTTP_WEBHOOK:
      validateWebhookOptions(options as WebhookOptions);
      break;

    case DeliveryMethod.CUSTOM:
      validateCustomDeliveryOptions(options as CustomDeliveryOptions);
      break;
  }
}

/**
 * Validate SSE options
 *
 * @param options SSE options
 * @throws {ConfigurationError} If options are invalid
 */
function validateSSEOptions(options: SSEOptions): void {
  if (
    options.heartbeatInterval !== undefined &&
    (typeof options.heartbeatInterval !== 'number' || options.heartbeatInterval <= 0)
  ) {
    throw new ConfigurationError('SSE heartbeatInterval must be a positive number');
  }
}

/**
 * Validate WebSocket options
 *
 * @param options WebSocket options
 * @throws {ConfigurationError} If options are invalid
 */
function validateWebSocketOptions(options: WebSocketOptions): void {
  if (
    options.port !== undefined &&
    (typeof options.port !== 'number' || options.port <= 0 || options.port > 65535)
  ) {
    throw new ConfigurationError('WebSocket port must be a valid port number (1-65535)');
  }
}

/**
 * Validate webhook options
 *
 * @param options Webhook options
 * @throws {ConfigurationError} If options are invalid
 */
function validateWebhookOptions(options: WebhookOptions): void {
  if (!options.url) {
    throw new ConfigurationError('Webhook delivery requires url option');
  }

  if (typeof options.url !== 'string' || !isValidUrl(options.url)) {
    throw new ConfigurationError('Webhook url must be a valid URL');
  }

  // Validate retry strategy if provided
  if (options.retryStrategy) {
    validateRetryStrategy(options.retryStrategy);
  }
}

/**
 * Validate retry strategy configuration
 *
 * @param retryStrategy Retry strategy configuration
 * @throws {ConfigurationError} If retry strategy is invalid
 */
function validateRetryStrategy(retryStrategy: RetryStrategy): void {
  validateNumberParam(
    retryStrategy.maxRetries,
    'Webhook retryStrategy.maxRetries must be a non-negative number',
    (value) => value >= 0,
  );

  validateNumberParam(
    retryStrategy.initialDelayMs,
    'Webhook retryStrategy.initialDelayMs must be a positive number',
    (value) => value > 0,
  );

  validateNumberParam(
    retryStrategy.maxDelayMs,
    'Webhook retryStrategy.maxDelayMs must be a positive number',
    (value) => value > 0,
  );

  validateNumberParam(
    retryStrategy.backoffFactor,
    'Webhook retryStrategy.backoffFactor must be greater than 1',
    (value) => value > 1,
  );
}

/**
 * Validate a number parameter if it's defined
 *
 * @param value The value to validate
 * @param errorMessage Error message to throw if validation fails
 * @param validator Function to validate the value
 * @throws {ConfigurationError} If validation fails
 */
function validateNumberParam(
  value: number | undefined,
  errorMessage: string,
  validator: (value: number) => boolean,
): void {
  if (value !== undefined && (typeof value !== 'number' || !validator(value))) {
    throw new ConfigurationError(errorMessage);
  }
}

/**
 * Validate custom delivery options
 *
 * @param options Custom delivery options
 * @throws {ConfigurationError} If options are invalid
 */
function validateCustomDeliveryOptions(options: CustomDeliveryOptions): void {
  if (typeof options.handler !== 'function') {
    throw new ConfigurationError('Custom delivery requires a handler function');
  }
}

/**
 * Check if a string is a valid URL
 *
 * @param url URL string to validate
 * @returns True if the URL is valid
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (err) {
    return false;
  }
}