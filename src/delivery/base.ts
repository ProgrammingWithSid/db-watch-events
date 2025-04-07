/**
 * Base delivery class for implementing delivery mechanisms
 */
import { v4 as uuidv4 } from 'uuid';
import { EventDelivery, ChangeEvent, DeliveryMethod } from '../types';
import { DeliveryError } from '../errors';
import { debug, error } from '../utils/logging';

/**
 * Abstract base class for delivery mechanisms
 */
export abstract class BaseDelivery implements EventDelivery {
  protected id: string;
  protected method: DeliveryMethod;
  protected initialized = false;

  /**
   * Create a new base delivery instance
   * 
   * @param method The delivery method type
   */
  constructor(method: DeliveryMethod) {
    this.id = uuidv4();
    this.method = method;
  }

  /**
   * Initialize the delivery mechanism
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      await this.initializeDelivery();
      this.initialized = true;
      
      debug('Initialized delivery mechanism', { 
        id: this.id, 
        method: this.method 
      });
    } catch (err) {
      error('Failed to initialize delivery mechanism', { 
        id: this.id, 
        method: this.method,
        error: err instanceof Error ? err.message : String(err)
      });
      
      throw new DeliveryError('Failed to initialize delivery mechanism', { cause: err });
    }
  }

  /**
   * Deliver a change event or batch of events
   * 
   * @param event The change event(s) to deliver
   */
  public async deliver(event: ChangeEvent | ChangeEvent[]): Promise<void> {
    if (!this.initialized) {
      throw new DeliveryError('Delivery mechanism not initialized');
    }
    
    try {
      await this.deliverEvent(event);
      
      debug('Delivered event(s)', { 
        id: this.id, 
        method: this.method,
        count: Array.isArray(event) ? event.length : 1
      });
    } catch (err) {
      error('Failed to deliver event(s)', { 
        id: this.id, 
        method: this.method,
        error: err instanceof Error ? err.message : String(err)
      });
      
      throw new DeliveryError('Failed to deliver event(s)', { cause: err });
    }
  }

  /**
   * Close the delivery mechanism
   */
  public async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    
    try {
      await this.closeDelivery();
      this.initialized = false;
      
      debug('Closed delivery mechanism', { 
        id: this.id, 
        method: this.method 
      });
    } catch (err) {
      error('Failed to close delivery mechanism', { 
        id: this.id, 
        method: this.method,
        error: err instanceof Error ? err.message : String(err)
      });
      
      throw new DeliveryError('Failed to close delivery mechanism', { cause: err });
    }
  }

  /**
   * Implementation-specific initialization
   */
  protected abstract initializeDelivery(): Promise<void>;

  /**
   * Implementation-specific event delivery
   * 
   * @param event The change event(s) to deliver
   */
  protected abstract deliverEvent(event: ChangeEvent | ChangeEvent[]): Promise<void>;

  /**
   * Implementation-specific cleanup
   */
  protected abstract closeDelivery(): Promise<void>;
}