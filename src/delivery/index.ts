/**
 * Delivery mechanisms for change notifications
 */
import { CustomDeliveryOptions, DeliveryConfig, DeliveryMethod, EventDelivery, SSEOptions } from '../types';
import { ServerSentEventsDelivery } from './server-sent-events.js';
import { CustomDelivery } from './custom.js';
import { DeliveryError } from '../errors';

/**
 * Create a delivery mechanism based on configuration
 * 
 * @param config Delivery configuration
 * @returns Event delivery instance
 * @throws {DeliveryError} If delivery method is not supported
 */
export function createDeliveryMechanism(config: DeliveryConfig): EventDelivery {
  switch (config.method) {
    case DeliveryMethod.SERVER_SENT_EVENTS:
      return new ServerSentEventsDelivery(config.options as SSEOptions);
    
    case DeliveryMethod.CUSTOM:
      return new CustomDelivery(config.options as CustomDeliveryOptions);
    
    case DeliveryMethod.WEBSOCKET:
    case DeliveryMethod.HTTP_WEBHOOK:
      // For this implementation, only SSE and Custom are implemented
      // You would add the other implementations here
      throw new DeliveryError(`Delivery method ${config.method} not implemented yet`);
    
    default:
      throw new DeliveryError(`Unsupported delivery method: ${config.method}`);
  }
}

export { ServerSentEventsDelivery } from './server-sent-events.js';
export { CustomDelivery } from './custom.js';