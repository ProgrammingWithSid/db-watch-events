/**
 * Server-Sent Events delivery implementation
 */
import { EventEmitter } from 'events';
import { BaseDelivery } from './base';
import { DeliveryMethod, SSEOptions, ChangeEvent } from '../types';
import { debug, info } from '../utils/logging';

/**
 * Client connection for SSE
 */
interface SSEClientConnection {
  id: string;
  res: any; // Express response or similar
  lastEventId?: string;
}

/**
 * Server-Sent Events delivery mechanism
 */
export class ServerSentEventsDelivery extends BaseDelivery {
  private options: SSEOptions;
  private clients: Map<string, SSEClientConnection> = new Map();
  private events: EventEmitter = new EventEmitter();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * Create a new SSE delivery instance
   * 
   * @param options SSE options
   */
  constructor(options: SSEOptions) {
    super(DeliveryMethod.SERVER_SENT_EVENTS);
    this.options = {
      path: '/events',
      heartbeatInterval: 30000,
      ...options
    };
  }

  /**
   * Initialize the SSE delivery
   */
  protected async initializeDelivery(): Promise<void> {
    // Set up heartbeat interval
    if (this.options.heartbeatInterval && this.options.heartbeatInterval > 0) {
      this.heartbeatInterval = setInterval(() => {
        this.sendHeartbeat();
      }, this.options.heartbeatInterval);
    }
    
    info('SSE delivery initialized', { id: this.id, path: this.options.path });
  }

  /**
   * Deliver event(s) to connected clients
   * 
   * @param event Change event(s) to deliver
   */
  protected async deliverEvent(event: ChangeEvent | ChangeEvent[]): Promise<void> {
    const events = Array.isArray(event) ? event : [event];
    
    // Emit events for any listeners
    for (const eventData of events) {
      this.events.emit('change', eventData);
    }
    
    // Send to all connected clients
    for (const [clientId, client] of this.clients.entries()) {
      try {
        for (const eventData of events) {
          this.sendEventToClient(client, eventData);
        }
      } catch (err) {
        // If sending fails, remove the client
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Close the SSE delivery
   */
  protected async closeDelivery(): Promise<void> {
    // Clear heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        // End response for each client
        client.res.end();
      } catch (err) {
        // Ignore errors when closing
      }
    }
    
    // Clear client list
    this.clients.clear();
    
    // Remove all event listeners
    this.events.removeAllListeners();
    
    info('SSE delivery closed', { id: this.id });
  }

  /**
   * Register a new client connection
   * 
   * @param res Response object (Express or similar)
   * @param lastEventId Last event ID if reconnecting
   * @returns Client ID
   */
  public registerClient(res: any, lastEventId?: string): string {
    const clientId = `sse-client-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    
    // Set up response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });
    
    // Send initial connection message
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ clientId })}\n\n`);
    
    // Store client
    this.clients.set(clientId, { id: clientId, res, lastEventId });
    
    debug('SSE client connected', { id: this.id, clientId, clientCount: this.clients.size });
    
    return clientId;
  }

  /**
   * Remove a client connection
   * 
   * @param clientId Client ID to remove
   */
  public removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      try {
        const client = this.clients.get(clientId)!;
        client.res.end();
      } catch (err) {
        // Ignore errors when ending
      }
      
      this.clients.delete(clientId);
      debug('SSE client disconnected', { id: this.id, clientId, clientCount: this.clients.size });
    }
  }

  /**
   * Send a heartbeat to keep connections alive
   */
  private sendHeartbeat(): void {
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.res.write(':heartbeat\n\n');
      } catch (err) {
        // If sending fails, remove the client
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Send an event to a specific client
   * 
   * @param client Client connection
   * @param event Change event to send
   */
  private sendEventToClient(client: SSEClientConnection, event: ChangeEvent): void {
    try {
      client.res.write(`id: ${event.id}\n`);
      client.res.write(`event: change\n`);
      client.res.write(`data: ${JSON.stringify(event)}\n\n`);
      
      // Update last event ID
      client.lastEventId = event.id;
    } catch (err) {
      throw err; // Propagate error to caller
    }
  }
}