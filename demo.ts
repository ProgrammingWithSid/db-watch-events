// demo.ts - Example setup and usage with PostgreSQL
import express from 'express';
import { 
  createChangeNotifier, 
  DatabaseType,  
  type NotifierResponse
} from './src';
import { ServerSentEventsDelivery } from './src/delivery/server-sent-events';
import { DeliveryMethod } from './src/types';

const app = express();
const PORT = 3000;

async function runDemo() {
  console.log('Starting PostgreSQL change notification demo...');
  
  try {
    // Create an SSE delivery to use in the Express server
    const sseDelivery = new ServerSentEventsDelivery({
      path: '/db-events',
      heartbeatInterval: 30000
    });
    
    // Store it for use in the Express routes
    app.locals.sseDelivery = sseDelivery;
    
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
    
    // Initialize the SSE delivery
    await sseDelivery.initialize();
    
    console.log('Notifier initialized successfully', notifierResponse);
    
    // Step 2: Set up Express server for SSE endpoint
    app.get('/db-events', (req, res) => {
      console.log('New SSE client connecting');
      
      // Register this client with the SSE delivery
      const clientId = sseDelivery.registerClient(res);
      console.log(`Client ${clientId} connected to SSE stream`);
      
      // Handle client disconnect
      req.on('close', () => {
        console.log(`Client ${clientId} disconnected from SSE stream`);
        sseDelivery.removeClient(clientId);
      });
    });
    
    // Step 3: Provide a basic UI for testing
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>DB Change Notifier Demo</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            #events { height: 400px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-top: 20px; }
            .event { margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #4285f4; }
            .event.insert { border-left-color: #0f9d58; }
            .event.update { border-left-color: #f4b400; }
            .event.delete { border-left-color: #db4437; }
            pre { margin: 0; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <h1>DB Change Notifier Demo</h1>
          <p>Open your PostgreSQL database and make some changes to the 'users' or 'orders' tables.</p>
          <div id="events"></div>
          
          <script>
            const eventsContainer = document.getElementById('events');
            
            // Connect to the SSE endpoint
            const eventSource = new EventSource('/db-events');
            
            // Handle connected event
            eventSource.addEventListener('connected', (event) => {
              try {
                const data = JSON.parse(event.data);
                addEvent(data, 'connected');
              } catch (err) {
                addEvent({ error: 'Error parsing connected event', data: event.data }, 'error');
              }
            });
            
            // Handle change events
            eventSource.addEventListener('change', (event) => {
              try {
                const data = JSON.parse(event.data);
                addEvent(data, 'change');
              } catch (err) {
                addEvent({ error: 'Error parsing change event', data: event.data }, 'error');
              }
            });
            
            // Handle default message events
            eventSource.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                addEvent(data, 'message');
              } catch (err) {
                addEvent({ error: 'Error parsing message', data: event.data }, 'error');
              }
            };
            
            // Handle errors
            eventSource.onerror = () => {
              addEvent({ error: 'Event source connection error. Reconnecting...' }, 'error');
            };
            
            // Add event to the UI
            function addEvent(data, eventType) {
              const eventEl = document.createElement('div');
              eventEl.className = 'event';
              
              if (data.operation) {
                eventEl.classList.add(data.operation.toLowerCase());
              }
              
              if (eventType) {
                const typeEl = document.createElement('div');
                typeEl.textContent = \`Event type: \${eventType}\`;
                typeEl.style.fontWeight = 'bold';
                eventEl.appendChild(typeEl);
              }
              
              const content = document.createElement('pre');
              content.textContent = JSON.stringify(data, null, 2);
              
              eventEl.appendChild(content);
              eventsContainer.prepend(eventEl);
            }
          </script>
        </body>
        </html>
      `);
    });
    
    // Step 4: Add a route to manually test notification functionality
    // app.get('/test-notification', (req, res) => {
    //   console.log('Sending test notification');
      
    //   // Create a test event
    //   const testEvent = {
    //     id: 'test-' + Date.now(),
    //     timestamp: new Date().toISOString(),
    //     operation: 'TEST',
    //     source: {
    //       table: 'test_table',
    //       schema: 'public'
    //     },
    //     data: {
    //       new: { id: 1, name: 'Test Record', value: Math.random() * 100 },
    //       old: null
    //     }
    //   };
      
    //   // Send it using our SSE delivery
    //   sseDelivery.deliver(testEvent).catch(err => {
    //     console.error('Error sending test notification:', err);
    //   });
      
    //   res.json({ message: 'Test notification sent', event: testEvent });
    // });
    
    // Step 5: Start the server
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log('Now make some changes to your PostgreSQL tables and watch the events flow!');
      console.log(`You can also test notifications at http://localhost:${PORT}/test-notification`);
    });
    
    // Step 6: Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      
      try {
        // Close the SSE delivery
        await sseDelivery.close();
        console.log('SSE delivery closed');
        
        // Add other cleanup if needed
      } catch (err) {
        console.error('Error during shutdown:', err);
      }
      
      process.exit(0);
    });
    
  } catch (err) {
    console.error('Error in demo:', err);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);