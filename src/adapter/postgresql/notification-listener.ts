/**
 * PostgreSQL notification listener implementation
 */
import { Client, Notification } from 'pg';

import { PostgresConnectionConfig } from '../../types';
import { debug, info, error } from '../../utils/logging';

export interface NotificationListenerConfig {
    connectionConfig: PostgresConnectionConfig;
    channel: string;
    onNotification: (payload: string) => void;
    onError: (error: Error) => void;
}

// Define the return type as an interface for clarity
interface NotificationListener {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isConnected: () => boolean;
}

/**
 * Create a PostgreSQL notification listener
 *
 * @param config Notification listener configuration
 * @returns Object with connect and disconnect methods
 */
export function createNotificationListener(
    config: NotificationListenerConfig,
): NotificationListener {
    const { connectionConfig, channel, onNotification, onError } = config;

    let client: Client | null = null;
    let connected = false;
    let connectionAttempts = 0;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    /**
     * Connect to PostgreSQL and start listening for notifications
     */
    async function connect(): Promise<void> {
        if (connected) {
            return;
        }

        try {
            connectionAttempts++;

            client = new Client(connectionConfig);

            // Set up notification handler
            client.on('notification', (msg: Notification) => {
                if (msg.channel === channel && msg.payload) {
                    onNotification(msg.payload);
                }
            });

            // Set up error handler
            client.on('error', (err: Error) => {
                error('PostgreSQL notification listener error', { channel, error: err.message });
                onError(err);

                // Try to reconnect on error
                handleDisconnect();
            });

            // Connect to database
            await client.connect();

            // Listen for notifications on the channel
            await client.query(`LISTEN ${channel}`);

            connected = true;
            connectionAttempts = 0;

            info('PostgreSQL notification listener connected', { channel });
        } catch (err) {
            error('Failed to connect PostgreSQL notification listener', {
                channel,
                error: err instanceof Error ? err.message : String(err),
                attempts: connectionAttempts,
            });

            // Clean up on connection failure
            if (client) {
                try {
                    await client.end();
                } catch (endErr) {
                    // Ignore error on cleanup
                }
                client = null;
            }

            connected = false;

            // Try to reconnect after delay with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);
            handleReconnect(delay);

            throw err;
        }
    }

    /**
     * Check if the listener is currently connected
     */
    function isConnected(): boolean {
        return connected;
    }

    /**
     * Disconnect from PostgreSQL and stop listening for notifications
     */
    async function disconnect(): Promise<void> {
        // Clear any pending reconnect timeout
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (!connected || !client) {
            return;
        }

        try {
            // Stop listening for notifications
            await client.query(`UNLISTEN ${channel}`);

            // Close the connection
            await client.end();

            connected = false;
            client = null;

            info('PostgreSQL notification listener disconnected', { channel });
        } catch (err) {
            error('Failed to disconnect PostgreSQL notification listener', {
                channel,
                error: err instanceof Error ? err.message : String(err),
            });

            // Force disconnect on error
            if (client) {
                try {
                    client.end();
                } catch (endErr) {
                    // Ignore error on cleanup
                }
                client = null;
            }

            connected = false;

            throw err;
        }
    }

    /**
     * Handle reconnect with delay
     */
    function handleReconnect(delay: number): void {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
            // Use a non-async function for setTimeout
            reconnectTimeout = null;

            if (!connected) {
                debug('Attempting to reconnect PostgreSQL notification listener', {
                    channel,
                    attempt: connectionAttempts,
                });

                // Call connect but don't await it directly
                void connect().catch(() => {
                    // Error already logged in connect
                });
            }
        }, delay);
    }
    /**
     * Handle disconnection and attempt to reconnect
     */
    function handleDisconnect(): void {
        if (!connected) {
            return;
        }

        connected = false;

        if (client) {
            try {
                client.end();
            } catch (err) {
                // Ignore error on cleanup
            }
            client = null;
        }

        connectionAttempts++;
        const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 30000);

        info('PostgreSQL notification listener disconnected, will retry', {
            channel,
            reconnectIn: `${delay}ms`,
            attempt: connectionAttempts,
        });

        handleReconnect(delay);
    }

    return {
        connect,
        disconnect,
        isConnected,
    };
}
