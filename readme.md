# db-change-notifier 📊

[![npm version](https://img.shields.io/npm/v/db-change-notifier.svg)](https://www.npmjs.com/package/db-change-notifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)

**Real-time database change notifications with zero polling.**

db-change-notifier enables your applications to receive instant notifications when data changes in your database. It uses native database capabilities to detect changes and deliver them in real-time, eliminating the need for polling.

## 🌟 Key Features

- **Multi-Database Support**: Works with PostgreSQL and MongoDB
- **Flexible Delivery Methods**: SSE, WebSockets, or custom handlers
- **Transform Pipeline**: Filter or modify events before delivery
- **Configurable Batching**: Handle high-volume changes efficiently
- **Type-Safe API**: Written in TypeScript with comprehensive definitions
- **Zero Polling**: Uses efficient native notification mechanisms

## 📦 Installation

```bash
npm install db-change-notifier
```

## Quick Start
```bash
import { createChangeNotifier, DatabaseType, DeliveryMethod } from 'db-change-notifier';
import express from 'express';

const app = express();
const port = 3000;

async function main() {
  // Create a change notifier
  const notifier = await createChangeNotifier({
    database: {
      type: DatabaseType.POSTGRESQL,
      connection: {
        host: 'localhost',
        port: 5432,
        database: 'your_database',
        user: 'postgres',
        password: 'your_password'
      }
    },
    tables: {
      include: ['users', 'orders'] // Only monitor these tables
    },
    delivery: {
      method: DeliveryMethod.SERVER_SENT_EVENTS,
      options: {
        path: '/db-events' // Endpoint for SSE connections
      }
    }
  });
  
  // Serve a simple client
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DB Change Notifier Demo</title>
        <style>
          #events { height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; }
        </style>
      </head>
      <body>
        <h1>Database Changes</h1>
        <div id="events"></div>
        
        <script>
          const eventSource = new EventSource('/db-events');
          const eventsDiv = document.getElementById('events');
          
          eventSource.onmessage = (event) => {
            const change = JSON.parse(event.data);
            const item = document.createElement('div');
            item.textContent = JSON.stringify(change);
            eventsDiv.prepend(item);
          };
        </script>
      </body>
      </html>
    `);
  });
  
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

main().catch(console.error);
```

## ⚙️ Configuration Options
```bash
// PostgreSQL
{
  database: {
    type: DatabaseType.POSTGRESQL,
    connection: {
      host: 'localhost',
      port: 5432,
      database: 'your_database',
      user: 'postgres',
      password: 'your_password'
    }
  }
}
```

## Table/Collection Filtering
```bash
{
  tables: {
    include: ['users', 'orders'], // Only these tables
    exclude: ['logs', 'sessions'], // Exclude these tables
    schemas: ['public'] // PostgreSQL schemas
  }
}
```

## Delivery Methods
```bash
// Server-Sent Events (SSE)
{
  delivery: {
    method: DeliveryMethod.SERVER_SENT_EVENTS,
    options: {
      path: '/db-events',
      heartbeatInterval: 30000 // 30 seconds
    }
  }
}

// WebSockets
{
  delivery: {
    method: DeliveryMethod.WEBSOCKET,
    options: {
      path: '/ws',
      port: 3001
    }
  }
}

// Custom delivery
{
  delivery: {
    method: DeliveryMethod.CUSTOM,
    options: {
      handler: async (event) => {
        // Your custom handling logic
        console.log('Change event:', event);
      }
    }
  }
}
```

## Event Transformations


```bash
{
  transformations: [
    {
      tablePattern: 'users',
      transform: (event) => {
        // Redact sensitive data
        if (event.data.new && event.data.new.password) {
          event.data.new.password = '***REDACTED***';
        }
        return event;
      }
    }
  ]
}
```

## Batching Configuration
```bash
{
  batchingEnabled: true,
  batchSize: 50, // Send after 50 events
  batchTimeWindowMs: 1000 // Or after 1 second
}
```

## 📡 Event Structure
```bash
{
  id: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: '2025-04-07T14:57:02.455666Z',
  operation: 'update', // 'insert', 'update', 'delete'
  database: {
    type: 'postgresql',
    name: 'my_database'
  },
  source: {
    table: 'users',
    schema: 'public'
  },
  data: {
    new: { id: 1, username: 'john_doe', email: 'new@example.com' },
    old: { id: 1, username: 'john_doe', email: 'old@example.com' }
  }
}
```

## 💻 Client-Side Code
```bash
// Using Server-Sent Events
const eventSource = new EventSource('/db-events');

eventSource.addEventListener('change', (event) => {
  const data = JSON.parse(event.data);
  console.log('Change detected:', data);
  updateUI(data);
});

// Using WebSockets
const socket = new WebSocket('ws://localhost:3001');

socket.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  console.log('Change detected:', data);
});
```
## 📜 License
MIT

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
