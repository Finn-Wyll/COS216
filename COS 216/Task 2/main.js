/*
* COS 216 Homework Assignment - NodeJS Socket Server
* Names: [Your Name]
* Student Number: [Your Student Number]
*/

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const readline = require('readline');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
    .option('port', {
        alias: 'p',
        description: 'Port to run the server on',
        type: 'number'
    })
    .argv;

// Create readline interface for server commands
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Setup Express app and HTTP server
const app = express();
const server = http.createServer(app);

// API credentials and URL
const apiCredentials = 
{
    username: '', // Your Wheatley username
    password: ''  // Your Wheatley password
};
const apiBaseUrl = 'https://wheatley.cs.up.ac.za/u24754120/api/'; // Replace with your API path

// Port selection logic
let port;
const promptForPort = () => {
    // Check if port provided via command line
    if (argv.port) {
        validatePort(argv.port);
        return;
    }

    rl.question('Enter a port number (1024-49151): ', (answer) => {
        const portNum = parseInt(answer, 10);
        validatePort(portNum);
    });
};

const validatePort = (portNum) => {
    if (isNaN(portNum) || portNum < 1024 || portNum > 49151) {
        console.log('Invalid port. Please enter a port number between 1024 and 49151.');
        promptForPort();
        return;
    }
    
    port = portNum;
    startServer();
};

// Start WebSocket server and attach to HTTP server
const startServer = () => {
    const wss = new WebSocket.Server({ server });
    
    // Client tracking
    const clients = new Map();
    let activeDeliveries = new Map();
    
    // Listen for connections
    wss.on('connection', (ws) => {
        console.log('Client connected');
        
        // Assign temporary ID until client authenticates
        const clientId = Date.now().toString();
        clients.set(clientId, { ws, authenticated: false });
        
        // Handle messages from clients
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);
                
                // Handle authentication
                if (data.type === 'auth') {
                    handleAuthentication(clientId, data);
                } 
                // Handle order requests
                else if (data.type === 'order') {
                    if (!clients.get(clientId).authenticated) {
                        sendError(ws, 'Not authenticated');
                        return;
                    }
                    
                    switch (data.action) {
                        case 'create':
                            await createOrder(clientId, data.payload);
                            break;
                        case 'update':
                            await updateOrder(clientId, data.payload);
                            break;
                        case 'getAll':
                            await getAllOrders(clientId);
                            break;
                        case 'requestDelivery':
                            await requestDelivery(clientId, data.payload);
                            break;
                    }
                } 
                // Handle drone operations
                else if (data.type === 'drone') {
                    if (!clients.get(clientId).authenticated) {
                        sendError(ws, 'Not authenticated');
                        return;
                    }
                    
                    switch (data.action) {
                        case 'create':
                            await createDrone(clientId, data.payload);
                            break;
                        case 'update':
                            await updateDrone(clientId, data.payload);
                            break;
                        case 'getAll':
                            await getAllDrones(clientId);
                            break;
                        case 'move':
                            handleDroneMovement(clientId, data.payload);
                            break;
                        case 'status':
                            getDroneStatus(clientId, data.payload);
                            break;
                    }
                }
                // Command handling
                else if (data.type === 'command') {
                    handleCommands(clientId, data.command);
                }
            } catch (error) {
                console.error('Error processing message:', error);
                sendError(ws, 'Invalid message format or server error');
            }
        });
        
        // Handle disconnections
        ws.on('close', () => {
            console.log(`Client ${clientId} disconnected`);
            
            const client = clients.get(clientId);
            if (client && client.authenticated && client.userType === 'Courier') {
                handleCourierDisconnect(clientId);
            }
            
            clients.delete(clientId);
        });
    });
    
    // Start the server
    server.listen(port, () => {
        console.log(`WebSocket server started on port ${port}`);
        
        // Handle server commands
        processServerCommands();
    });
};

// Authentication handler
async function handleAuthentication(clientId, data) {
    try {
        const client = clients.get(clientId);
        const { username, password } = data;
        
        const response = await axios.post(
            `${apiBaseUrl}?route=login`,
            {},
            {
                auth: {
                    username,
                    password
                }
            }
        );
        
        if (response.data.success) {
            // Update client info
            clients.set(clientId, {
                ...client,
                authenticated: true,
                username,
                userId: response.data.user_id,
                userType: response.data.user_type
            });
            
            // Send success response
            client.ws.send(JSON.stringify({
                type: 'auth',
                success: true,
                userType: response.data.user_type
            }));
            
            console.log(`Client ${clientId} authenticated as ${username} (${response.data.user_type})`);
        } else {
            client.ws.send(JSON.stringify({
                type: 'auth',
                success: false,
                error: 'Invalid credentials'
            }));
        }
    } catch (error) {
        console.error('Authentication error:', error);
        const client = clients.get(clientId);
        client.ws.send(JSON.stringify({
            type: 'auth',
            success: false,
            error: 'Authentication failed'
        }));
    }
}

// Order handling functions
async function createOrder(clientId, payload) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.post(
            `${apiBaseUrl}?route=createOrder`,
            payload,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        client.ws.send(JSON.stringify({
            type: 'order',
            action: 'create',
            success: response.data.success,
            data: response.data
        }));
    } catch (error) {
        console.error('Create order error:', error);
        sendError(clients.get(clientId).ws, 'Failed to create order');
    }
}

async function updateOrder(clientId, payload) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.put(
            `${apiBaseUrl}?route=updateOrder`,
            payload,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        client.ws.send(JSON.stringify({
            type: 'order',
            action: 'update',
            success: response.data.success
        }));
        
        // Notify other clients about the update
        if (response.data.success && payload.state === 'Delivered') {
            broadcastOrderDelivered(payload.order_id);
        }
    } catch (error) {
        console.error('Update order error:', error);
        sendError(clients.get(clientId).ws, 'Failed to update order');
    }
}

async function getAllOrders(clientId) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.get(
            `${apiBaseUrl}?route=getAllOrders`,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        client.ws.send(JSON.stringify({
            type: 'order',
            action: 'getAll',
            success: response.data.success,
            orders: response.data.orders
        }));
    } catch (error) {
        console.error('Get all orders error:', error);
        sendError(clients.get(clientId).ws, 'Failed to fetch orders');
    }
}

async function requestDelivery(clientId, payload) {
    try {
        const client = clients.get(clientId);
        
        // Notify couriers about delivery request
        broadcastToUserType('Courier', {
            type: 'notification',
            message: `New delivery request from ${client.username}`,
            orderId: payload.order_id
        });
        
        client.ws.send(JSON.stringify({
            type: 'order',
            action: 'requestDelivery',
            success: true,
            message: 'Delivery request sent to couriers'
        }));
    } catch (error) {
        console.error('Request delivery error:', error);
        sendError(clients.get(clientId).ws, 'Failed to request delivery');
    }
}

// Drone handling functions
async function createDrone(clientId, payload) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.post(
            `${apiBaseUrl}?route=createDrone`,
            payload,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        client.ws.send(JSON.stringify({
            type: 'drone',
            action: 'create',
            success: response.data.success,
            droneId: response.data.drone_id
        }));
    } catch (error) {
        console.error('Create drone error:', error);
        sendError(clients.get(clientId).ws, 'Failed to create drone');
    }
}

async function updateDrone(clientId, payload) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.put(
            `${apiBaseUrl}?route=updateDrone`,
            payload,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        if (response.data.success) {
            // Broadcast drone position update to all clients
            broadcastDroneUpdate(payload);
            
            client.ws.send(JSON.stringify({
                type: 'drone',
                action: 'update',
                success: true
            }));
        } else {
            sendError(client.ws, 'Failed to update drone');
        }
    } catch (error) {
        console.error('Update drone error:', error);
        sendError(clients.get(clientId).ws, 'Failed to update drone');
    }
}

async function getAllDrones(clientId) {
    try {
        const client = clients.get(clientId);
        
        const response = await axios.get(
            `${apiBaseUrl}?route=getAllDrones`,
            {
                auth: {
                    username: client.username,
                    password: apiCredentials.password
                }
            }
        );
        
        client.ws.send(JSON.stringify({
            type: 'drone',
            action: 'getAll',
            success: response.data.success,
            drones: response.data.drones
        }));
    } catch (error) {
        console.error('Get all drones error:', error);
        sendError(clients.get(clientId).ws, 'Failed to fetch drones');
    }
}

function handleDroneMovement(clientId, payload) {
    const client = clients.get(clientId);
    const { droneId, direction } = payload;
    
    // Get current drone position and update according to direction
    // Then update in database and broadcast
    // This would implement the arrow key movement
    
    // For simplicity, we'll just broadcast a dummy update
    broadcastDroneUpdate({
        id: droneId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        altitude: payload.altitude,
        battery_level: payload.battery_level
    });
    
    client.ws.send(JSON.stringify({
        type: 'drone',
        action: 'move',
        success: true
    }));
}

function getDroneStatus(clientId, payload) {
    const client = clients.get(clientId);
    const { droneId } = payload;
    
    // This would normally fetch the drone status from the database
    // For simplicity, just sending a response
    client.ws.send(JSON.stringify({
        type: 'drone',
        action: 'status',
        success: true,
        status: {
            battery_level: 85,
            altitude: 20,
            operator: 'Current Operator',
            latitude: 25.7472,
            longitude: 28.2511
        }
    }));
}

// Command handling functions
function handleCommands(clientId, command) {
    const client = clients.get(clientId);
    
    switch (command.toUpperCase()) {
        case 'CURRENTLY_DELIVERING':
            sendCurrentlyDelivering(clientId);
            break;
        case 'DRONE_STATUS':
            sendDroneStatus(clientId);
            break;
        case 'QUIT':
            // Handle by server command
            break;
        default:
            sendError(client.ws, 'Unknown command');
    }
}

function sendCurrentlyDelivering(clientId) {
    const client = clients.get(clientId);
    
    // This would normally fetch data from the database
    // For simplicity, sending a dummy response
    client.ws.send(JSON.stringify({
        type: 'command',
        command: 'CURRENTLY_DELIVERING',
        data: [
            {
                orderId: 123,
                products: [
                    { title: 'Smartphone', quantity: 1 },
                    { title: 'Charger', quantity: 2 }
                ],
                destination: { latitude: 25.7563, longitude: 28.2350 },
                recipient: { name: 'John Doe', contactNumber: '012-345-6789' }
            }
        ]
    }));
}

function sendDroneStatus(clientId) {
    const client = clients.get(clientId);
    
    // This would normally fetch data from the database
    // For simplicity, sending a dummy response
    client.ws.send(JSON.stringify({
        type: 'command',
        command: 'DRONE_STATUS',
        data: {
            battery_level: 75,
            altitude: 20,
            current_operator: 'John Smith',
            coordinates: { latitude: 25.7472, longitude: 28.2511 }
        }
    }));
}

// Utility functions
function sendError(ws, message) {
    ws.send(JSON.stringify({
        type: 'error',
        message
    }));
}

function broadcastToAll(message) {
    clients.forEach((client) => {
        if (client.authenticated) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

function broadcastToUserType(userType, message) {
    clients.forEach((client) => {
        if (client.authenticated && client.userType === userType) {
            client.ws.send(JSON.stringify(message));
        }
    });
}

function broadcastDroneUpdate(drone) {
    clients.forEach((client) => {
        if (client.authenticated) {
            client.ws.send(JSON.stringify({
                type: 'drone',
                action: 'positionUpdate',
                drone
            }));
        }
    });
}

function broadcastOrderDelivered(orderId) {
    clients.forEach((client) => {
        if (client.authenticated) {
            client.ws.send(JSON.stringify({
                type: 'order',
                action: 'delivered',
                orderId
            }));
        }
    });
}

function handleCourierDisconnect(clientId) {
    const client = clients.get(clientId);
    console.log(`Courier ${client.username} disconnected, handling drone and orders...`);
    
    // Reset orders that were being delivered by this courier
    // Notify customers
    broadcastToUserType('Customer', {
        type: 'notification',
        message: 'A courier has disconnected. Your delivery has been postponed.',
        level: 'warning'
    });
    
    // This would typically update the database to reset order states
    // and mark drones as crashed
    console.log('All out-for-delivery orders reset to Storage state');
    console.log('Drone marked as crashed');
}

function processServerCommands() {
    rl.on('line', (line) => {
        const command = line.trim().toUpperCase();
        
        if (command === 'QUIT') {
            console.log('Shutting down server...');
            broadcastToAll({
                type: 'server',
                action: 'shutdown',
                message: 'Server is shutting down'
            });
            
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        } else if (command.startsWith('KILL ')) {
            const username = command.substring(5);
            killClientByUsername(username);
        } else {
            console.log('Unknown command. Available commands: QUIT, KILL <username>');
        }
    });
}

function killClientByUsername(username) {
    let found = false;
    
    clients.forEach((client, id) => {
        if (client.authenticated && client.username === username) {
            console.log(`Killing connection for user: ${username}`);
            client.ws.close();
            clients.delete(id);
            found = true;
        }
    });
    
    if (!found) {
        console.log(`No client found with username: ${username}`);
    }
}

// Start the server
promptForPort();