/**
 * Basic usage example for db-change-notifier
 */
import { 
    createChangeNotifier, 
    NotifierConfig, 
    DatabaseType, 
    OperationType
  } from '../../src';
import { ServerSentEventsDelivery } from '../delivery';
import { DeliveryMethod } from '../types';
  
  /**
   * Example showing how to set up db-change-notifier with PostgreSQL
   */
  
  async function postgresExample(): Promise<void> {
    try {


    const sseDelivery = new ServerSentEventsDelivery({
          path: '/db-events',
          heartbeatInterval: 30000
        });
        
        
        // Step 1: Create and initialize the change notifier with custom delivery
        const notifierResponse = await createChangeNotifier({
          database: {
            type: DatabaseType.POSTGRESQL,
            connection: {
              host: 'localhost',
              port: 5432,
              database: 'demo_db',
              user: 'postgres',
              password: 'postgres'
            }
          },
          tables: {
            include: ['users', 'orders'],
            schemas: ['public']
          },
          delivery: {
            method: DeliveryMethod.CUSTOM,
            options: {
              handler: async (event) => {
                // Forward the event to our SSE delivery
                await sseDelivery.deliver(event);
                console.log('Delivered event to SSE mechanism');
              }
            }
          },
          transformations: [
            {
              tablePattern: 'users',
              transform: (event) => {
                if (event.data.new && event.data.new.password) {
                  event.data.new.password = '***REDACTED***';
                }
                return event;
              }
            }
          ]
        });
  
      // Create the notifier
      console.log('Notifier created successfully:', notifierResponse);
      
      // For this example, we'll just wait a bit then exit
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('Example complete');
    } catch (error) {
      console.error('Error creating notifier:', error);
    }
  }