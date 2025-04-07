/**
 * Core notifier implementation
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  NotifierConfig, 
  NotifierResponse, 
  ChangeEvent, 
  DatabaseType,
  DatabaseAdapter,
  EventDelivery,
  DeliveryConfig,
  DeliveryMethod,
  NotifierStats,
  OperationType,
} from '../types';
import { DBChangeError } from '../errors';
import { getAdapter } from './adapter';
import { createDeliveryMechanism } from '../delivery';
import { debug, info, error, warn } from '../utils/logging';

/**
 * ChangeNotifier class that orchestrates the change notification process
 */
export class ChangeNotifier {
  private id: string;
  private config: NotifierConfig;
  private adapter: DatabaseAdapter | null = null;
  private deliveryMechanisms: EventDelivery[] = [];
  private isRunning = false;
  private stats: NotifierStats;
  private eventBuffer: ChangeEvent[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private changeEventHandler: ((event: ChangeEvent) => void) | null = null;

  /**
   * Create a new ChangeNotifier instance
   * 
   * @param config The notifier configuration
   */
  constructor(config: NotifierConfig) {
    this.id = uuidv4();
    this.config = config;
    this.stats = this.initializeStats();
    this.changeEventHandler = this.processEvent.bind(this);
  }

  /**
   * Initialize the notifier and start listening for changes
   * 
   * @returns A promise that resolves to a NotifierResponse
   */
  public async initialize(): Promise<NotifierResponse> {
    try {
      debug('Initializing change notifier', { id: this.id });
      
      // Create and initialize the database adapter
      this.adapter = await this.createAdapter();
      
      // Set up delivery mechanisms
      await this.setupDeliveryMechanisms();
    
      // Set up change notifications in the database
      await this.adapter.setupChangeNotifications(this.config.tables || {});
      
      // Register event handlers
      this.registerEventHandlers();
      
      // Start the adapter
      await this.adapter.start();
      
      this.isRunning = true;
      
      info('Change notifier initialized successfully', { id: this.id });
      
      return {
        id: this.id,
        status: 'success',
        message: 'Change notifier initialized successfully',
        details: {
          adapterInfo: this.adapter.getAdapterInfo(),
          deliveryMethods: this.config.delivery instanceof Array
            ? this.config.delivery.map(d => d.method)
            : [this.config.delivery.method]
        }
      };
    } catch (err) {
      error('Failed to initialize change notifier', { 
        id: this.id, 
        error: err instanceof Error ? err.message : String(err)
      });
      
      // Clean up any partially initialized resources
      await this.cleanup();
      
      throw new DBChangeError('Failed to initialize change notifier', { cause: err });
    }
  }

  /**
   * Stop the notifier and clean up resources
   * 
   * @returns A promise that resolves when the notifier is stopped
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      warn('Attempted to stop notifier that is not running', { id: this.id });
      return;
    }
    
    info('Stopping change notifier', { id: this.id });
    
    await this.cleanup();
    
    this.isRunning = false;
    
    info('Change notifier stopped', { id: this.id });
  }

  /**
   * Get the current notifier statistics
   * 
   * @returns The notifier statistics
   */
  public getStats(): NotifierStats {
    return { ...this.stats };
  }

  /**
   * Check if the notifier is currently running
   * 
   * @returns True if the notifier is running, false otherwise
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Create and initialize the database adapter
   * 
   * @returns A promise that resolves to the initialized database adapter
   */
  private async createAdapter(): Promise<DatabaseAdapter> {
    const { type } = this.config.database;
    
    debug('Creating database adapter', { type, id: this.id });
    
    const adapter = getAdapter(this.config.database);
    
    // Test connection to the database
    const connectionSuccessful = await adapter.testConnection();
    
    if (!connectionSuccessful) {
      throw new DBChangeError('Failed to connect to database');
    }
    
    return adapter;
  }

  /**
   * Set up delivery mechanisms based on configuration
   */
  private async setupDeliveryMechanisms(): Promise<void> {
    const deliveryConfigs = this.config.delivery instanceof Array
      ? this.config.delivery
      : [this.config.delivery];
    
    debug('Setting up delivery mechanisms', { 
      count: deliveryConfigs.length,
      methods: deliveryConfigs.map(d => d.method).join(', '),
      id: this.id
    });
    
    for (const deliveryConfig of deliveryConfigs) {
      const delivery = createDeliveryMechanism(deliveryConfig);
      await delivery.initialize();
      this.deliveryMechanisms.push(delivery);
    }
    
    debug('Delivery mechanisms set up successfully', { id: this.id });
  }

  /**
     * Register a change event handler
     * 
     * @param handler Function to call when a change event occurs
     */
    public onChangeEvent(handler: (event: ChangeEvent) => void): void {
        this.changeEventHandler = handler;
    }



  /**
   * Register event handlers for the adapter
   */
  private registerEventHandlers(): void {
    if (!this.adapter) {
      throw new DBChangeError('Cannot register event handlers: adapter not initialized');
    }
    
    // Register error handler
    this.adapter.onError((err) => {
        error('Database adapter error', { 
          id: this.id, 
          error: err.message 
        });
        
        // Update error stats
        this.recordError(err.message);
      });

      if (this.adapter.onChangeEvent) {
        this.adapter.onChangeEvent(this.processEvent.bind(this));
      }
  }

  /**
   * Process a change event
   * 
   * @param event The change event to process
   */
  private async processEvent(event: ChangeEvent): Promise<void> {
    // Update stats
    console.log("ChangeNotifier processing event:", event.id, event.operation, event.source.table);

    this.updateEventStats(event);
    
    // Apply transformations if configured
    const transformedEvent = this.applyTransformations(event);
    
    // If event was filtered out by transformations, don't deliver it
    if (!transformedEvent) {
      debug('Event filtered out by transformations', { 
        id: this.id,
        eventId: event.id
      });
      return;
    }
    
    // Handle batching if enabled
    if (this.config.batchingEnabled) {
        console.log("Buffering event for batch delivery");

      this.bufferEvent(transformedEvent);
    } else {
        console.log("Delivering event immediately");

      // Deliver the event immediately
      await this.deliverEvent(transformedEvent);
    }
  }

  /**
   * Apply configured transformations to an event
   * 
   * @param event The event to transform
   * @returns The transformed event, or null if the event should be filtered out
   */
  private applyTransformations(event: ChangeEvent): ChangeEvent | null {
    if (!this.config.transformations || this.config.transformations.length === 0) {
      return event;
    }
    
    let currentEvent = { ...event };
    
    for (const transformation of this.config.transformations) {
      const { tablePattern, transform } = transformation;
      
      // Check if this transformation applies to the current table
      const pattern = tablePattern instanceof RegExp
        ? tablePattern
        : new RegExp(tablePattern);
      
      if (pattern.test(event.source.table)) {
        // Apply the transformation
        const result = transform(currentEvent);
        
        // If transformation returns null, filter out the event
        if (result === null) {
          return null;
        }
        
        currentEvent = result;
      }
    }
    
    return currentEvent;
  }

  /**
   * Buffer an event for batched delivery
   * 
   * @param event The event to buffer
   */
  private bufferEvent(event: ChangeEvent): void {
    this.eventBuffer.push(event);
    
    // If we've reached the batch size, deliver immediately
    if (this.eventBuffer.length >= (this.config.batchSize || 100)) {
      void this.deliverBatch();
      return;
    }
    
    // Set a timeout to deliver the batch if not already set
    if (!this.batchTimeout && this.eventBuffer.length > 0) {
      this.batchTimeout = setTimeout(() => {
        void this.deliverBatch();
      }, this.config.batchTimeWindowMs || 1000);
    }
  }

  /**
   * Deliver batched events
   */
  private async deliverBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    if (this.eventBuffer.length === 0) {
      return;
    }
    
    const batchToDeliver = [...this.eventBuffer];
    this.eventBuffer = [];
    
    try {
      // Deliver to all configured delivery mechanisms
      await Promise.all(
        this.deliveryMechanisms.map(delivery => delivery.deliver(batchToDeliver))
      );
      
      this.stats.deliveryAttempts += 1;
      this.stats.deliverySuccesses += 1;
      
      debug('Successfully delivered batch of events', { 
        id: this.id,
        count: batchToDeliver.length
      });
    } catch (err) {
      this.stats.deliveryAttempts += 1;
      this.stats.deliveryFailures += 1;
      
      error('Failed to deliver batch of events', { 
        id: this.id,
        error: err instanceof Error ? err.message : String(err),
        count: batchToDeliver.length
      });
    }
  }

  /**
   * Deliver a single event
   * 
   * @param event The event to deliver
   */
  private async deliverEvent(event: ChangeEvent): Promise<void> {
    try {
      // Deliver to all configured delivery mechanisms
      await Promise.all(
        this.deliveryMechanisms.map(delivery => delivery.deliver(event))
      );
      
      this.stats.deliveryAttempts += 1;
      this.stats.deliverySuccesses += 1;
      
      debug('Successfully delivered event', { 
        id: this.id,
        eventId: event.id
      });
      console.log("Delivering event to", this.deliveryMechanisms.length, "delivery mechanisms");

    } catch (err) {
      this.stats.deliveryAttempts += 1;
      this.stats.deliveryFailures += 1;
      
      error('Failed to deliver event', { 
        id: this.id,
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  /**
   * Clean up resources used by the notifier
   */
  private async cleanup(): Promise<void> {
    // Deliver any remaining batched events
    if (this.eventBuffer.length > 0) {
      await this.deliverBatch();
    }
    
    // Clean up the adapter
    if (this.adapter) {
      try {
        await this.adapter.stop();
        await this.adapter.teardownChangeNotifications();
      } catch (err) {
        error('Error during adapter cleanup', { 
          id: this.id, 
          error: err instanceof Error ? err.message : String(err)
        });
      }
      this.adapter = null;
    }
    
    // Clean up delivery mechanisms
    for (const delivery of this.deliveryMechanisms) {
      try {
        await delivery.close();
      } catch (err) {
        error('Error during delivery mechanism cleanup', { 
          id: this.id, 
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    this.deliveryMechanisms = [];
    
    // Clear any pending batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Initialize the notifier statistics
   */
  private initializeStats(): NotifierStats {
    return {
      startTime: new Date(),
      eventsProcessed: 0,
      eventsByOperation: Object.values(OperationType).reduce(
        (acc, op) => ({ ...acc, [op]: 0 }),
        {} as Record<OperationType, number>
      ),
      eventsByTable: {},
      deliveryAttempts: 0,
      deliverySuccesses: 0,
      deliveryFailures: 0,
      errors: []
    };
  }

  /**
   * Update event statistics
   * 
   * @param event The event to record in statistics
   */
  private updateEventStats(event: ChangeEvent): void {
    this.stats.eventsProcessed += 1;
    this.stats.eventsByOperation[event.operation] = 
      (this.stats.eventsByOperation[event.operation] || 0) + 1;
    
    const tableKey = `${event.source.schema || ''}.${event.source.table}`;
    this.stats.eventsByTable[tableKey] = 
      (this.stats.eventsByTable[tableKey] || 0) + 1;
    
    this.stats.lastEventTime = new Date();
  }

  /**
   * Record an error in the statistics
   * 
   * @param errorMessage The error message to record
   */
  private recordError(errorMessage: string): void {
    const existingError = this.stats.errors.find(e => e.message === errorMessage);
    
    if (existingError) {
      existingError.count += 1;
      existingError.time = new Date();
    } else {
      this.stats.errors.push({
        time: new Date(),
        message: errorMessage,
        count: 1
      });
    }
    
    // Keep only the most recent errors (up to 100)
    if (this.stats.errors.length > 100) {
      this.stats.errors = this.stats.errors
        .sort((a, b) => b.time.getTime() - a.time.getTime())
        .slice(0, 100);
    }
  }
}

/**
 * Create a new change notifier
 * 
 * @param config The notifier configuration
 * @returns A promise that resolves to a notifier response
 */
export async function createNotifier(config: NotifierConfig): Promise<NotifierResponse> {
  const notifier = new ChangeNotifier(config);
  return await notifier.initialize();
}