const http = require('http');
const express = require('express');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Store client sockets and their corresponding usernames
const clients = new Map();

// Store drones
let drones = [];

// Function to call the PHP API using the http module
function callAPI(endpoint, data) {
    return new Promise((resolve, reject) => {
        const url = new URL(`http://username:password@wheatley.cs.up.ac.za/uXXXXXXXX/${endpoint}`); // **IMPORTANT: Replace with your actual URL**
        const postData = JSON.stringify(data);

        const options = {
            hostname: url.hostname,
            port: 80, // Default HTTP port
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': `Basic ${Buffer.from(`${url.username}:${url.password}`).toString('base64')}`
            },
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(responseData));
                    } else {
                        reject(new Error(`HTTP error! status: ${res.statusCode}, body: ${responseData}`));
                    }
                } catch (error) {
                    reject(new Error(`Error parsing JSON response: ${error.message}, body: ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`HTTP request error: ${error.message}`));
        });

        req.write(postData);
        req.end();
    });
}

// Function to get a random port
function getRandomPort(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to check for reserved ports (Add your reserved ports)
function isReservedPort(port) {
    const reservedPorts = []; // Add reserved ports here
    return reservedPorts.includes(port);
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Handle login
    socket.on('login', async ({ email, password }) => {
        try {
            const response = await callAPI('Login', { type: 'Login', email, password });
            if (response.status === 'success') {
                clients.set(socket.id, { id: response.id, socket: socket, username: email }); // Store email as username
                socket.emit('loginSuccess', { userId: response.id });
            } else {
                socket.emit('loginFailed', response.data);
            }
        } catch (error) {
            socket.emit('error', 'Login failed due to server error');
        }
    });

    // Handle commands
    socket.on('command', async (command) => {
        try {
            let result;
            switch (command.type) {
                case 'CREATE_ORDER':
                    result = await callAPI('CreateOrder', {
                        type: 'CreateOrder',
                        customer_id: command.customer_id,
                        order_id: command.order_id,
                        destination_latitude: command.destination_latitude,
                        destination_longitude: command.destination_longitude,
                    });
                    socket.emit('orderCreated', result);
                    break;

                case 'GET_ALL_ORDERS':
                    const userId = clients.get(socket.id)?.id;
                    if (!userId) {
                        socket.emit('error', 'User not logged in');
                        return;
                    }
                    result = await callAPI('GetAllOrders', { type: 'GetAllOrders', customer_id: userId });
                    socket.emit('allOrders', result.data);
                    break;

                case 'UPDATE_ORDER':
                    result = await callAPI('UpdateOrder', {
                        type: 'UpdateOrder',
                        order_id: command.order_id,
                        latitude: command.latitude,
                        longitude: command.longitude,
                        state: command.state,
                    });
                    socket.emit('orderUpdated', result);
                    break;

                case 'CREATE_DRONE':
                    result = await callAPI('CreateDrone', {
                        type: 'CreateDrone',
                        current_operator_id: command.current_operator_id,
                        is_available: command.is_available,
                        latitude: command.latitude,
                        longitude: command.longitude,
                        altitude: command.altitude,
                        battery_level: command.battery_level,
                    });
                    drones.push(result); // Store the created drone locally
                    io.emit('droneCreated', result);
                    break;

                case 'UPDATE_DRONE':
                    result = await callAPI('UpdateDrone', {
                        type: 'UpdateDrone',
                        drone_id: command.drone_id,
                        current_operator_id: command.current_operator_id,
                        is_available: command.is_available,
                        latitude: command.latitude,
                        longitude: command.longitude,
                        altitude: command.altitude,
                        battery_level: command.battery_level,
                    });

                    // Update the drone in the local array
                    drones = drones.map(drone => drone.id === command.drone_id ? { ...drone, ...command } : drone);
                    io.emit('droneUpdated', result);
                    break;

                case 'GET_ALL_DRONES':
                    result = await callAPI('GetAllDrones', { type: 'GetAllDrones' });
                    drones = result.data; // Update local drones array
                    socket.emit('allDrones', result.data);
                    break;

                case 'CURRENTLY_DELIVERING':
                    //This entire block needs careful review against the PDF
                    const allOrdersResult = await callAPI('GetAllOrders', { type: 'GetAllOrders', customer_id: clients.get(socket.id)?.id });
                    const deliveringOrders = allOrdersResult.data.filter(order => order.state === 'OutForDelivery');

                    const detailedOrders = [];
                    for (const order of deliveringOrders) {
                        //The PDF asks for orderId, Product details, Destination, Recipient details
                        //The API does not directly provide Product details or Recipient details
                        //This requires further implementation based on how you want to handle it
                        //It might need a new API endpoint or local caching.
                        const products = await getProductsForOrder(order.order_id); // Placeholder
                        detailedOrders.push({ ...order, products });
                    }
                    socket.emit('currentlyDelivering', detailedOrders);
                    break;

                case 'KILL':
                    const usernameToKill = command.username;
                    const socketIdToKill = Array.from(clients.entries()).find(([, client]) => client.username === usernameToKill)?.[0];

                    if (socketIdToKill) {
                        const socketToKill = io.sockets.sockets.get(socketIdToKill);
                        if (socketToKill) {
                            socketToKill.disconnect(true);
                            clients.delete(socketIdToKill);
                            io.emit('message', `${usernameToKill} has been disconnected.`);
                        } else {
                            socket.emit('error', `No socket found for username: ${usernameToKill}`);
                        }
                    } else {
                        socket.emit('error', `No user found with username: ${usernameToKill}`);
                    }
                    break;

                case 'QUIT':
                    io.emit('serverOffline', 'Server is going offline.');
                    io.sockets.sockets.forEach(sock => sock.disconnect(true));
                    server.close(() => {
                        console.log('Server is now offline.');
                        process.exit(0);
                    });
                    break;

                case 'DRONE_STATUS':
                    const droneStatus = drones.find(d => d.id === command.drone_id);
                    if (droneStatus) {
                        socket.emit('droneStatus', droneStatus);
                    } else {
                        socket.emit('error', `Drone with ID ${command.drone_id} not found.`);
                    }
                    break;

                default:
                    socket.emit('error', 'Unknown command');
            }
        } catch (error) {
            console.error('Error processing command:', error);
            socket.emit('error', `Server error: ${error.message || 'Unknown error'}`);
        }
    });

    // Handle disconnects
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const client = clients.get(socket.id);
        clients.delete(socket.id);

        if (client) {
            handleCourierDisconnect(client.id);
        }
    });

    async function handleCourierDisconnect(courierId) {
        const drone = drones.find(d => d.current_operator_id === courierId);
        if (drone) {
            io.emit('courierDisconnected', { message: 'Courier disconnected. Deliveries postponed.' });

            try {
                // Find orders associated with the drone and reset them
                //The PDF says "All orders that were out for delivery should be reset to the "Storage" state."
                //It does not specify HOW to identify these orders.
                //This implementation assumes you need to fetch all orders and filter.
                const allOrdersResult = await callAPI('GetAllOrders', { type: 'GetAllOrders' });
                const ordersToReset = allOrdersResult.data.filter(order => order.state === 'OutForDelivery');

                for (const order of ordersToReset) {
                    await callAPI('UpdateOrder', { type: 'UpdateOrder', order_id: order.order_id, state: 'Storage' });
                }

                // Update drone availability
                await callAPI('UpdateDrone', { type: 'UpdateDrone', drone_id: drone.id, is_available: 0 }); // Or a "crashed" state
                drones = drones.map(d => (d.id === drone.id ? { ...d, is_available: 0 } : d));

            } catch (error) {
                console.error('Error handling courier disconnect:', error);
            }
        }
    }
});

// Placeholder function to get products for an order (You need to implement this)
async function getProductsForOrder(orderId) {
    // This is a placeholder. You'll need to implement the logic to fetch product details
    // Possibly from a separate API endpoint or your database directly.
    return [];
}

// Start the server
const PORT = parseInt(process.argv[2]) || getRandomPort(1024, 49151);

if (isReservedPort(PORT)) {
    console.error(`Error: Port ${PORT} is a reserved port.`);
    process.exit(1);
}

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});