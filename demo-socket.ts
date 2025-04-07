// demo.ts - Example setup with PostgreSQL and WebSockets
import express from 'express';
import http from 'http';
import { Server as WebSocketServer } from 'socket.io';
import { 
  createChangeNotifier, 
  DatabaseType,
  type NotifierResponse
} from './src';
import { DeliveryMethod } from './src/types';

const app = express();
const server = http.createServer(app);
const io = new WebSocketServer(server);
const PORT = 3000;

async function runDemo() {
  console.log('Starting PostgreSQL change notification demo with WebSockets...');
  
  try {
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
            // Forward the event to all connected WebSocket clients
            io.emit('db-change', event);
            console.log('Delivered event to WebSocket clients');
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
    
    console.log('Notifier initialized successfully', notifierResponse);
    
    // Step 2: Set up WebSocket connection handling
    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Send welcome message
      socket.emit('connected', { 
        message: 'Connected to db-change-notifier',
        clientId: socket.id
      });
      
      // Handle client disconnect
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
      
      // Handle client sending a test message
      socket.on('test-event', () => {
        const testEvent = {
          id: 'test-' + Date.now(),
          timestamp: new Date().toISOString(),
          operation: 'TEST',
          source: {
            table: 'test_table',
            schema: 'public'
          },
          data: {
            new: { id: 1, name: 'Test Record', value: Math.random() * 100 },
            old: null
          }
        };
        
        socket.emit('db-change', testEvent);
        console.log('Sent test event to client:', socket.id);
      });
    });
    
    // Step 3: Provide a basic UI for testing
    app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>DB Change Notifier Demo</title>
          <script src="/socket.io/socket.io.js"></script>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            #events { height: 400px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-top: 20px; }
            .event { margin-bottom: 10px; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #4285f4; }
            .event.insert { border-left-color: #0f9d58; }
            .event.update { border-left-color: #f4b400; }
            .event.delete { border-left-color: #db4437; }
            pre { margin: 0; white-space: pre-wrap; }
            button { padding: 8px 16px; margin-top: 10px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #3b78e7; }
          </style>
        </head>
        <body>
          <h1>DB Change Notifier Demo (WebSocket)</h1>
          <p>Open your PostgreSQL database and make changes to the 'users' or 'orders' tables.</p>
          <button id="test-button">Send Test Event</button>
          <div id="connection-status">Connecting...</div>
          <div id="events"></div>
          
          <script>
            const socket = io();
            const eventsContainer = document.getElementById('events');
            const connectionStatus = document.getElementById('connection-status');
            const testButton = document.getElementById('test-button');
            
            // Handle connection
            socket.on('connect', () => {
              connectionStatus.textContent = 'Connected';
              connectionStatus.style.color = 'green';
            });
            
            // Handle disconnection
            socket.on('disconnect', () => {
              connectionStatus.textContent = 'Disconnected. Reconnecting...';
              connectionStatus.style.color = 'red';
            });
            
            // Handle welcome message
            socket.on('connected', (data) => {
              addEvent(data, 'system');
            });
            
            // Handle database changes
            socket.on('db-change', (data) => {
              addEvent(data, 'db-change');
            });
            
            // Handle test button click
            testButton.addEventListener('click', () => {
              socket.emit('test-event');
            });
            
            // Add event to the UI
            function addEvent(data, eventType) {
              const eventEl = document.createElement('div');
              eventEl.className = 'event';
              
              if (data.operation) {
                eventEl.classList.add(data.operation.toLowerCase());
              }
              
              const headerEl = document.createElement('div');
              headerEl.textContent = \`Event type: \${eventType}\`;
              headerEl.style.fontWeight = 'bold';
              eventEl.appendChild(headerEl);
              
              if (data.timestamp) {
                const timeEl = document.createElement('div');
                timeEl.textContent = new Date(data.timestamp).toLocaleTimeString();
                timeEl.style.color = '#666';
                timeEl.style.fontSize = '0.8em';
                eventEl.appendChild(timeEl);
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
    
    // Step 4: Start the server
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      console.log('Now make some changes to your PostgreSQL tables and watch the events flow!');
    });
    
    // Step 5: Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      
      // Close the server
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
    
  } catch (err) {
    console.error('Error in demo:', err);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);