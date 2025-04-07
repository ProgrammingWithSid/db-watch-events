/**
 * Custom error classes for db-change-notifier
 */

interface ErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Base error class for all db-change-notifier errors
 */
export class DBChangeError extends Error {
  public cause?: unknown;
  public context?: Record<string, unknown>;

  /**
   * Create a new DBChangeError
   *
   * @param message Error message
   * @param options Additional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = 'DBChangeError';
    this.cause = options?.cause;
    this.context = options?.context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for configuration issues
 */
export class ConfigurationError extends DBChangeError {
  /**
   * Create a new ConfigurationError
   *
   * @param message Error message
   * @param options Additional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error for connection issues
 */
export class ConnectionError extends DBChangeError {
  /**
   * Create a new ConnectionError
   *
   * @param message Error message
   * @param options Additional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConnectionError';
  }
}

/**
 * Error for delivery issues
 */
export class DeliveryError extends DBChangeError {
  /**
   * Create a new DeliveryError
   *
   * @param message Error message
   * @param options Additional error options
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DeliveryError';
  }
}
