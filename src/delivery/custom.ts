/**
 * Custom delivery implementation
 */
import { BaseDelivery } from './base';
import { DeliveryMethod, CustomDeliveryOptions, ChangeEvent } from '../types';
import { debug } from '../utils/logging';

/**
 * Custom delivery mechanism that uses a user-provided handler function
 */
export class CustomDelivery extends BaseDelivery {
  private options: CustomDeliveryOptions;

  /**
   * Create a new custom delivery instance
   * 
   * @param options Custom delivery options
   */
  constructor(options: CustomDeliveryOptions) {
    super(DeliveryMethod.CUSTOM);
    this.options = options;
  }

  /**
   * Initialize the custom delivery
   */
  protected async initializeDelivery(): Promise<void> {
    // Nothing to initialize for custom delivery
    debug('Custom delivery initialized', { id: this.id });
  }

  /**
   * Deliver event(s) using the custom handler
   * 
   * @param event Change event(s) to deliver
   */
  protected async deliverEvent(event: ChangeEvent | ChangeEvent[]): Promise<void> {

    const events = Array.isArray(event) ? event : [event];
    // console.log("SSE delivering", events.length, "events to", this.clients.size, "clients");

    if (Array.isArray(event)) {
        for (const e of event) {
          await this.options.handler(e);
        }
      } else {
        await this.options.handler(event);
      }
      console.log("SSE delivery complete");

  }

  /**
   * Close the custom delivery
   */
  protected async closeDelivery(): Promise<void> {
    // Nothing to close for custom delivery
    debug('Custom delivery closed', { id: this.id });
  }
}