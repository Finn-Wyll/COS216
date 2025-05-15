// server.js
const http = require('http');
const https = require('https');
const socketIO = require('socket.io');

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(404);
    res.end('This is a WebSocket server, not an HTTP server');
});

// Get port from command line arguments
let port = 3000; // Default port
const args = process.argv.slice(2);
if (args.length > 0) {
    const requestedPort = parseInt(args[0]);
    
    // Check if port is in allowed range (1024-49151)
    if (requestedPort >= 1024 && requestedPort <= 49151) {
        port = port = requestedPort;
    } else {
        console.log('Invalid port. Port must be between 1024 and 49151.');
        console.log('Using default port 3000 instead.');
    }
}

// Initialize Socket.IO
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Wheatley credentials - replace with your own
const WHEATLEY_USERNAME = 'u24754120';
const WHEATLEY_PASSWORD = 'your_password';
const API_PATH = '/u24754120/COS216/HA/api.php';

// Store active connections, orders, drones, and deliveries
const clients = new Map(); // socketId -> {username, type}
let orders = [];
let drones = [];
let currentlyDelivering = [];
let apiKey = ''; // Will be set after first login

// API Function
async function callAPI(data) {
    return new Promise((resolve, reject) => {
        // Convert data to JSON string
        const postData = JSON.stringify(data);
        
        // Request options
        const options = {
            hostname: 'wheatley.cs.up.ac.za',
            path: API_PATH,
            method: 'POST',
            auth: `${WHEATLEY_USERNAME}:${WHEATLEY_PASSWORD}`,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        // Create request
        const req = https.request(options, (res) => {
            let responseData = '';
            
            // Collect response data
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            // Process complete response
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    resolve(parsedData);
                } catch (error) {
                    console.error('Error parsing API response:', error);
                    reject(error);
                }
            });
        });
        
        // Handle errors
        req.on('error', (error) => {
            console.error('API Request Error:', error);
            reject(error);
        });
        
        // Send the data
        req.write(postData);
        req.end();
    });
}

// API Wrapper Functions
async function getAllOrders(apiKey) {
    return await callAPI({
        type: 'GetAllOrders',
        apikey: apiKey
    });
}

async function getAllDrones(apiKey) {
    return await callAPI({
        type: 'GetAllDrones',
        apikey: apiKey
    });
}

async function updateOrder(apiKey, orderId, data) {
    return await callAPI({
        type: 'UpdateOrder',
        apikey: apiKey,
        order_id: orderId,
        ...data
    });
}

async function updateDrone(apiKey, droneId, data) {
    return await callAPI({
        type: 'UpdateDrone',
        apikey: apiKey,
        drone_id: droneId,
        ...data
    });
}

// Poll API for updates
async function pollAPI() {
    if (!apiKey) return;
    
    try {
        // Get all orders
        const ordersResponse = await getAllOrders(apiKey);
        if (ordersResponse.status === 'success') {
            orders = ordersResponse.data?.orders || [];
        }
        
        // Get all drones
        const dronesResponse = await getAllDrones(apiKey);
        if (dronesResponse.status === 'success') {
            drones = dronesResponse.data?.drones || [];
        }
        
        // Broadcast updates to clients
        broadcastDroneStatus();
        broadcastCurrentDeliveries();
    } catch (error) {
        console.error('Error polling API:', error);
    }
}

// Utility functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Broadcasting functions
function broadcastDroneStatus() {
    io.emit('drone_status', { drones });
}

function broadcastCurrentDeliveries() {
    io.emit('current_deliveries', { 
        deliveries: orders.filter(o => o.state === 'Out_for_delivery') 
    });
}

// Handle drone crash
async function handleDroneCrash(crashedDrones) {
    for (const drone of crashedDrones) {
        // Find affected orders
        const affectedDeliveries = currentlyDelivering.filter(d => d.drone_id === drone.id);
        
        for (const delivery of affectedDeliveries) {
            // Update order state
            await updateOrder(apiKey, delivery.order_id, {
                state: 'Storage'
            });
            
            // Notify customers
            const order = orders.find(o => o.order_id === delivery.order_id);
            if (order) {
                const customerSocket = Array.from(clients.entries())
                    .find(([_, client]) => client.username === order.customer_id);
                
                if (customerSocket) {
                    io.to(customerSocket[0]).emit('notification', {
                        message: 'Your delivery has been postponed due to drone operator disconnection.'
                    });
                }
            }
        }
        
        // Update drone status
        await updateDrone(apiKey, drone.id, {
            is_available: false,
            current_operator_id: null,
            battery_level: 0
        });
        
        // Remove affected deliveries
        currentlyDelivering = currentlyDelivering.filter(d => d.drone_id !== drone.id);
    }
    
    // Notify all clients
    io.emit('notification', {
        message: 'A drone operator has disconnected unexpectedly. Affected deliveries have been postponed.'
    });
    
    // Refresh data
    await pollAPI();
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    clients.set(socket.id, { username: null, type: null });
    
    // Login handler
    socket.on('login', async (data) => {
        try {
            const loginResponse = await callAPI({
                type: 'Login',
                email: data.email,
                password: data.password
            });
            
            if (loginResponse.status === 'success') {
                // Store client info
                clients.set(socket.id, { 
                    username: data.email,
                    type: data.user_type || 'customer'
                });
                
                // Store API key if first login
                if (!apiKey) {
                    apiKey = loginResponse.data.apikey;
                    // Start polling once we have API key
                    setInterval(pollAPI, 5000); // Poll every 5 seconds
                }
                
                // Send success response
                socket.emit('login_response', {
                    status: 'success',
                    data: {
                        apikey: loginResponse.data.apikey,
                        user_type: clients.get(socket.id).type
                    }
                });
                
                // Fetch initial data
                await pollAPI();
            } else {
                socket.emit('login_response', {
                    status: 'error',
                    message: loginResponse.data || 'Login failed'
                });
            }
        } catch (error) {
            console.error('Login error:', error);
            socket.emit('login_response', {
                status: 'error',
                message: 'Login failed: Server error'
            });
        }
    });
    
    // Command handler
    socket.on('command', async (data) => {
        const command = data.command.toUpperCase();
        
        switch (command) {
            case 'CURRENTLY_DELIVERING':
                const delivering = orders.filter(o => o.state === 'Out_for_delivery');
                socket.emit('command_response', {
                    command: 'CURRENTLY_DELIVERING',
                    data: delivering
                });
                break;
                
            case 'KILL':
                if (!data.target) return;
                
                // Find target socket
                let targetSocketId = null;
                for (const [id, client] of clients.entries()) {
                    if (client.username === data.target) {
                        targetSocketId = id;
                        break;
                    }
                }
                
                if (targetSocketId) {
                    const targetClient = clients.get(targetSocketId);
                    
                    // Check if target is an operator
                    if (targetClient.type === 'courier') {
                        const operatedDrones = drones.filter(d => 
                            d.current_operator_id === targetClient.username
                        );
                        
                        if (operatedDrones.length > 0) {
                            await handleDroneCrash(operatedDrones);
                        }
                    }
                    
                    // Disconnect the target
                    io.sockets.sockets.get(targetSocketId).disconnect(true);
                    clients.delete(targetSocketId);
                    
                    socket.emit('command_response', {
                        command: 'KILL',
                        status: 'success',
                        message: `Connection for ${data.target} has been closed.`
                    });
                } else {
                    socket.emit('command_response', {
                        command: 'KILL',
                        status: 'error',
                        message: `User ${data.target} not found.`
                    });
                }
                break;
                
            case 'QUIT':
                // Broadcast server shutdown message
                io.emit('server_shutdown', {
                    message: 'Server is shutting down. All connections will be closed.'
                });
                
                // Close all connections
                for (const [id, _] of clients.entries()) {
                    const clientSocket = io.sockets.sockets.get(id);
                    if (clientSocket) {
                        clientSocket.disconnect(true);
                    }
                }
                
                // Shutdown server after delay
                setTimeout(() => {
                    console.log('Server shutting down...');
                    process.exit(0);
                }, 2000);
                break;
                
            case 'DRONE_STATUS':
                if (data.drone_id) {
                    const drone = drones.find(d => d.id === data.drone_id);
                    if (drone) {
                        socket.emit('command_response', {
                            command: 'DRONE_STATUS',
                            data: drone
                        });
                    } else {
                        socket.emit('command_response', {
                            command: 'DRONE_STATUS',
                            status: 'error',
                            message: 'Drone not found'
                        });
                    }
                } else {
                    socket.emit('command_response', {
                        command: 'DRONE_STATUS',
                        data: drones
                    });
                }
                break;
        }
    });
    
    // Drone movement handler
    socket.on('move_drone', async (data) => {
        const drone = drones.find(d => d.id === data.drone_id);
        if (!drone) return;
        
        let lat = parseFloat(drone.latest_latitude);
        let lng = parseFloat(drone.latest_longitude);
        let alt = parseFloat(drone.altitude);
        
        // Process direction
        switch (data.direction) {
            case 'UP':
                lng += 0.0001;
                break;
            case 'DOWN':
                lng -= 0.0001;
                break;
            case 'RIGHT':
                lat += 0.0001;
                break;
            case 'LEFT':
                lat -= 0.0001;
                break;
        }
        
        // Check if in dust devil
        if (data.in_dust_devil) {
            // Move back
            switch (data.direction) {
                case 'UP':
                    lng -= 0.0001;
                    break;
                case 'DOWN':
                    lng += 0.0001;
                    break;
                case 'RIGHT':
                    lat -= 0.0001;
                    break;
                case 'LEFT':
                    lat += 0.0001;
                    break;
            }
            
            // Increase altitude
            alt += 5;
            
            // Notify user
            socket.emit('notification', {
                message: 'Drone entered a dust devil! Altitude increased.'
            });
            
            // Check if altitude too high
            if (alt > 30) {
                // Drone has crashed
                await updateDrone(apiKey, drone.id, {
                    is_available: false,
                    battery_level: 0,
                    altitude: 0,
                    current_operator_id: null
                });
                
                // Handle any deliveries
                const operatedDrones = [drone];
                await handleDroneCrash(operatedDrones);
                
                socket.emit('notification', {
                    message: 'Drone has crashed! Altitude exceeded 30 meters.'
                });
                
                await pollAPI();
                return;
            }
        }
        
        // Check if within 5km of HQ
        const HQ_LAT = 25.7472;
        const HQ_LNG = 28.2511;
        
        const distance = calculateDistance(HQ_LAT, HQ_LNG, lat, lng);
        
        if (distance <= 5) {
            // Update drone position
            await updateDrone(apiKey, drone.id, {
                latest_latitude: lat.toFixed(4),
                latest_longitude: lng.toFixed(4),
                altitude: alt
            });
            
            // Check if drone reached HQ
            if (Math.abs(lat - HQ_LAT) < 0.0001 && Math.abs(lng - HQ_LNG) < 0.0001) {
                // Reset drone
                await updateDrone(apiKey, drone.id, {
                    battery_level: 100,
                    is_available: true,
                    current_operator_id: null,
                    altitude: 0
                });
                
                socket.emit('notification', {
                    message: 'Drone has returned to HQ and been reset.'
                });
            }
            
            // Check if at delivery location
            const delivering = currentlyDelivering.filter(d => d.drone_id === drone.id);
            for (const delivery of delivering) {
                const order = orders.find(o => o.order_id === delivery.order_id);
                if (!order) continue;
                
                const orderLat = parseFloat(order.destination_latitude);
                const orderLng = parseFloat(order.destination_longitude);
                
                if (Math.abs(lat - orderLat) < 0.0001 && Math.abs(lng - orderLng) < 0.0001) {
                    socket.emit('delivery_possible', {
                        order_id: order.order_id
                    });
                }
            }
            
            await pollAPI();
        } else {
            socket.emit('notification', {
                message: 'Drone cannot go beyond 5km radius from HQ'
            });
        }
    });
    
    // Order delivery handler
    socket.on('deliver_order', async (data) => {
        const order = orders.find(o => o.order_id === data.order_id);
        if (!order) return;
        
        // Update order state
        await updateOrder(apiKey, order.order_id, {
            state: 'Delivered'
        });
        
        // Remove from currently delivering
        currentlyDelivering = currentlyDelivering.filter(d => d.order_id !== data.order_id);
        
        // Notify customer
        const customerSocket = Array.from(clients.entries())
            .find(([_, client]) => client.username === order.customer_id);
        
        if (customerSocket) {
            io.to(customerSocket[0]).emit('notification', {
                message: `Your order ${order.order_id} has been delivered!`
            });
        }
        
        // Notify operator
        socket.emit('notification', {
            message: `Order ${order.order_id} delivered successfully!`
        });
        
        await pollAPI();
    });
    
    // Load order handler
    socket.on('load_order', async (data) => {
        const order = orders.find(o => o.order_id === data.order_id);
        const drone = drones.find(d => d.id === data.drone_id);
        
        if (!order || !drone) return;
        
        // Update order state
        await updateOrder(apiKey, order.order_id, {
            state: 'Out_for_delivery'
        });
        
        // Add to currently delivering
        currentlyDelivering.push({
            order_id: order.order_id,
            drone_id: drone.id
        });
        
        // Update drone
        await updateDrone(apiKey, drone.id, {
            current_operator_id: clients.get(socket.id).username,
            is_available: false
        });
        
        // Notify customer
        const customerSocket = Array.from(clients.entries())
            .find(([_, client]) => client.username === order.customer_id);
        
        if (customerSocket) {
            io.to(customerSocket[0]).emit('notification', {
                message: `Your order ${order.order_id} is now out for delivery!`
            });
        }
        
        // Notify operator
        socket.emit('notification', {
            message: `Order ${order.order_id} loaded onto drone ${drone.id}`
        });
        
        await pollAPI();
    });
    
    // Disconnect handler
    socket.on('disconnect', async () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        const client = clients.get(socket.id);
        if (client && client.type === 'courier') {
            // Check if courier was operating a drone
            const operatedDrones = drones.filter(d => 
                d.current_operator_id === client.username
            );
            
            if (operatedDrones.length > 0) {
                await handleDroneCrash(operatedDrones);
            }
        }
        
        clients.delete(socket.id);
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Socket.IO server running on port ${port}`);
});