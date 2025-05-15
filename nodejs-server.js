/**
 * Courier System Socket Server
 * Student Name(s): [Your Name]
 * Student Number(s): [Your Student Number]
 */

//require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const readline = require('readline');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// CLI interface for server control
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create socket.io server with CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configure API client with authentication
const api = axios.create({
  baseURL: process.env.API_BASE_URL,
  auth: {
    username: process.env.WHEATLEY_USERNAME,
    password: process.env.WHEATLEY_PASSWORD
  },
  headers: {
    'Content-Type': 'application/json'
  }
});

// Socket connections storage
const connectedUsers = new Map(); // Maps socket ID to user data
const usernameToSocketId = new Map(); // Maps username to socket ID

// State tracking
let activeDrones = new Map(); // Maps drone ID to drone data
let activeOrders = new Map(); // Maps order ID to order data
let dustDevils = []; // Array of dust devil positions
let serverRunning = true;

// Default HQ coordinates
const HQ = {
  latitude: 25.7472,
  longitude: 28.2511
};

// Function to get port with validation
function getValidPort() {
  return new Promise((resolve, reject) => {
    rl.question('Enter port number (1024-49151): ', (port) => {
      const portNum = parseInt(port, 10);
      
      if (isNaN(portNum)) {
        console.log('Invalid port. Please enter a number.');
        return getValidPort().then(resolve);
      }
      
      if (portNum < 1024 || portNum > 49151) {
        console.log('Port must be between 1024 and 49151.');
        return getValidPort().then(resolve);
      }
      
      resolve(portNum);
    });
  });
}

// Calculate distance between two coordinates in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Handle drone crash scenario
async function handleDroneCrash(droneId) {
  try {
    const drone = activeDrones.get(droneId);
    if (!drone) return;
    
    console.log(`Handling crash of drone ${droneId}`);
    
    // Find all orders being delivered by this drone
    const affectedOrders = Array.from(activeOrders.values())
      .filter(order => order.state === 'Out_for_delivery');
    
    // Reset orders to "Storage" state
    for (const order of affectedOrders) {
      await api.put('/updateOrder', {
        order_id: order.order_id,
        state: 'Storage'
      });
      
      // Update local state
      order.state = 'Storage';
      
      // Notify customer about delivery postponement
      const customerSocketId = Array.from(connectedUsers.entries())
        .find(([sid, u]) => u.id === order.customer_id)?.[0];
        
      if (customerSocketId) {
        io.to(customerSocketId).emit('delivery_postponed', {
          order_id: order.order_id,
          message: 'Your delivery has been postponed due to a drone malfunction.'
        });
      }
      
      console.log(`Order ${order.order_id} reset to Storage state due to drone crash`);
    }
    
    // Reset drone state in database
    await api.put('/updateDrone', {
      drone_id: droneId,
      current_operator_id: null,
      is_available: true,
      latest_latitude: HQ.latitude,
      latest_longitude: HQ.longitude,
      altitude: 0,
      battery_level: 100
    });
    
    // Update local state
    drone.current_operator_id = null;
    drone.is_available = true;
    drone.latest_latitude = HQ.latitude;
    drone.latest_longitude = HQ.longitude;
    drone.altitude = 0;
    drone.battery_level = 100;
    
    // Broadcast updates
    io.emit('drone_update', drone);
    io.emit('system_message', { message: `Drone ${droneId} has been reset after a crash incident` });
    
    // Notify all clients about order updates
    io.emit('orders_update', Array.from(activeOrders.values()));
    
  } catch (error) {
    console.error(`Error handling drone crash for drone ${droneId}:`, error.message);
  }
}

// Poll the API for updates (orders and drones)
async function pollForUpdates() {
  try {
    // Get all drones
    const dronesResponse = await api.get('/getAllDrones');
    if (dronesResponse.data && dronesResponse.data.status === 'success') {
      const drones = dronesResponse.data.data;
      
      // Update our local state
      drones.forEach(drone => {
        activeDrones.set(drone.id, drone);
      });
      
      // Broadcast updated drone positions to all connected clients
      io.emit('drones_update', Array.from(activeDrones.values()));
    }
    
    // Get all orders
    const ordersResponse = await api.get('/getAllOrders');
    if (ordersResponse.data && ordersResponse.data.status === 'success') {
      const orders = ordersResponse.data.data;
      
      // Update our local state
      activeOrders.clear();
      orders.forEach(order => {
        activeOrders.set(order.order_id, order);
      });
      
      // Broadcast updated orders to all connected clients
      io.emit('orders_update', Array.from(activeOrders.values()));
    }
  } catch (error) {
    console.error('Error polling for updates:', error.message);
  }
  
  // Continue polling at intervals if server is running
  if (serverRunning) {
    setTimeout(pollForUpdates, 5000); // Poll every 5 seconds
  }
}

// Generate random dust devils around Hatfield
function generateDustDevils() {
  // Clear existing dust devils
  dustDevils = [];
  
  // Generate between 5 and 10 dust devils
  const count = Math.floor(Math.random() * 6) + 5;
  
  for (let i = 0; i < count; i++) {
    // Generate random position within approximately 5km of HQ
    // Convert ~0.05 degrees lat/lon which is roughly 5km
    const randomLat = HQ.latitude + (Math.random() * 0.1 - 0.05);
    const randomLon = HQ.longitude + (Math.random() * 0.1 - 0.05);
    
    // Add if within the 5km radius
    if (calculateDistance(HQ.latitude, HQ.longitude, randomLat, randomLon) <= 5) {
      dustDevils.push({
        id: Date.now() + i,
        latitude: parseFloat(randomLat.toFixed(6)),
        longitude: parseFloat(randomLon.toFixed(6)),
        radius: 10 // radius in meters
      });
    }
  }
  
  // Make sure all dust devils are at least 11 meters away from all drones
  activeDrones.forEach(drone => {
    dustDevils = dustDevils.filter(devil => {
      // Convert positions to more precise distance in meters
      const distanceInKm = calculateDistance(
        drone.latest_latitude, 
        drone.latest_longitude, 
        devil.latitude, 
        devil.longitude
      );
      const distanceInMeters = distanceInKm * 1000;
      return distanceInMeters >= 11;
    });
  });
  
  // Broadcast dust devils to all clients
  io.emit('dust_devils_update', dustDevils);
  
  // Schedule next dust devil generation in 1 minute if server is running
  if (serverRunning) {
    setTimeout(generateDustDevils, 60000);
  }
}

// Handle socket connections
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // Handle authentication and user login
  socket.on('login', async (data) => {
    try {
      // Authenticate user through API
      const response = await api.post('/login', {
        username: data.username,
        password: data.password
      });
      
      if (response.data && response.data.status === 'success') {
        const userData = response.data.data.user;
        
        // If user was already connected with another socket, disconnect that socket
        if (usernameToSocketId.has(userData.username)) {
          const oldSocketId = usernameToSocketId.get(userData.username);
          
          if (io.sockets.sockets.has(oldSocketId)) {
            io.sockets.sockets.get(oldSocketId).disconnect();
            console.log(`Disconnected previous session for ${userData.username}`);
          }
          
          connectedUsers.delete(oldSocketId);
        }
        
        // Store user data
        connectedUsers.set(socket.id, userData);
        usernameToSocketId.set(userData.username, socket.id);
        
        // Notify client of successful login
        socket.emit('login_success', {
          user: userData,
          token: response.data.data.token
        });
        
        // Join appropriate room based on user type
        socket.join(userData.type);
        
        console.log(`User logged in: ${userData.username} (${userData.type})`);
        
        // Send current state data to the new client
        socket.emit('drones_update', Array.from(activeDrones.values()));
        socket.emit('orders_update', Array.from(activeOrders.values()));
        socket.emit('dust_devils_update', dustDevils);
      } else {
        socket.emit('login_error', { message: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Login error:', error.message);
      socket.emit('login_error', { message: 'Login failed. Please try again.' });
    }
  });
  
  // Handle drone control from couriers
  socket.on('move_drone', async (data) => {
    try {
      const user = connectedUsers.get(socket.id);
      
      // Check if user is a courier
      if (!user || user.type !== 'Courier') {
        socket.emit('error', { message: 'Only couriers can control drones' });
        return;
      }
      
      // Check if drone exists
      if (!activeDrones.has(data.drone_id)) {
        socket.emit('error', { message: 'Drone not found' });
        return;
      }
      
      const drone = activeDrones.get(data.drone_id);
      
      // Check if drone is assigned to this courier or available
      if (drone.current_operator_id !== null && 
          drone.current_operator_id !== user.id) {
        socket.emit('error', { message: 'This drone is currently operated by someone else' });
        return;
      }
      
      // If drone doesn't have an operator, assign it
      if (drone.current_operator_id === null) {
        await api.put('/updateDrone', {
          drone_id: drone.id,
          current_operator_id: user.id,
          is_available: false
        });
        
        drone.current_operator_id = user.id;
        drone.is_available = false;
      }
      
      // Calculate new position based on direction
      let newLat = parseFloat(drone.latest_latitude);
      let newLon = parseFloat(drone.latest_longitude);
      let newAltitude = parseFloat(drone.altitude);
      
      // Apply move based on arrow key
      switch (data.direction) {
        case 'UP':
          newLon += 0.0001;
          break;
        case 'DOWN':
          newLon -= 0.0001;
          break;
        case 'RIGHT':
          newLat += 0.0001;
          break;
        case 'LEFT':
          newLat -= 0.0001;
          break;
      }
      
      // Round to 6 decimal places
      newLat = parseFloat(newLat.toFixed(6));
      newLon = parseFloat(newLon.toFixed(6));
      
      // Check if new position is within 5km radius of HQ
      const distanceFromHQ = calculateDistance(HQ.latitude, HQ.longitude, newLat, newLon);
      
      if (distanceFromHQ > 5) {
        socket.emit('error', { message: 'Drone cannot go beyond 5km radius from HQ' });
        return;
      }
      
      // Check if new position collides with a dust devil
      let collidesWithDustDevil = false;
      
      for (const devil of dustDevils) {
        const distanceInKm = calculateDistance(newLat, newLon, devil.latitude, devil.longitude);
        const distanceInMeters = distanceInKm * 1000;
        
        if (distanceInMeters <= devil.radius) {
          collidesWithDustDevil = true;
          // If collision with dust devil, increase altitude and move back to previous position
          newLat = parseFloat(drone.latest_latitude);
          newLon = parseFloat(drone.latest_longitude);
          newAltitude += 5;
          
          // Check if altitude is now above limit
          if (newAltitude > 30) {
            // Drone crashes due to high altitude
            socket.emit('drone_crashed', { message: 'Drone crashed due to high altitude (dust devil encounter)' });
            io.emit('system_message', { message: `Drone ${drone.id} crashed due to high altitude after dust devil encounter!` });
            
            // Reset the drone and any orders in progress
            await handleDroneCrash(drone.id);
            return;
          }
          
          socket.emit('dust_devil_encounter', { 
            message: 'Encountered a dust devil! Altitude increased by 5 meters.',
            newAltitude: newAltitude
          });
          
          break;
        }
      }
      
      // Update drone position in database
      await api.put('/updateDrone', {
        drone_id: drone.id,
        latest_latitude: newLat,
        latest_longitude: newLon,
        altitude: newAltitude
      });
      
      // Update local state
      drone.latest_latitude = newLat;
      drone.latest_longitude = newLon;
      drone.altitude = newAltitude;
      
      // Broadcast updated drone position to all clients
      io.emit('drone_position_update', {
        drone_id: drone.id,
        latest_latitude: newLat,
        latest_longitude: newLon,
        altitude: newAltitude
      });
      
      // Check if drone is at any delivery destinations
      for (const [orderId, order] of activeOrders.entries()) {
        if (order.state === 'Out_for_delivery') {
          const distanceToDestination = calculateDistance(
            newLat, 
            newLon, 
            parseFloat(order.destination_latitude), 
            parseFloat(order.destination_longitude)
          );
          
          // If within 10 meters (approximately 0.01 km)
          if (distanceToDestination <= 0.01) {
            socket.emit('at_delivery_location', { order_id: orderId });
          }
        }
      }
      
    } catch (error) {
      console.error('Drone control error:', error.message);
      socket.emit('error', { message: 'Failed to control drone' });
    }
  });
  
  // Handle load order onto drone request
  socket.on('load_order', async (data) => {
    try {
      const user = connectedUsers.get(socket.id);
      
      // Check if user is a courier
      if (!user || user.type !== 'Courier') {
        socket.emit('error', { message: 'Only couriers can load orders' });
        return;
      }
      
      // Check if order exists
      if (!activeOrders.has(data.order_id)) {
        socket.emit('error', { message: 'Order not found' });
        return;
      }
      
      // Check if drone exists
      if (!activeDrones.has(data.drone_id)) {
        socket.emit('error', { message: 'Drone not found' });
        return;
      }
      
      const order = activeOrders.get(data.order_id);
      const drone = activeDrones.get(data.drone_id);
      
      // Check if drone is available or assigned to this courier
      if (drone.current_operator_id !== null && 
          drone.current_operator_id !== user.id) {
        socket.emit('error', { message: 'This drone is currently operated by someone else' });
        return;
      }
      
      // Update order state to "Out_for_delivery"
      await api.put('/updateOrder', {
        order_id: data.order_id,
        state: 'Out_for_delivery'
      });
      
      // Update local state
      order.state = 'Out_for_delivery';
      
      // If drone doesn't have an operator, assign it
      if (drone.current_operator_id === null) {
        await api.put('/updateDrone', {
          drone_id: drone.id,
          current_operator_id: user.id,
          is_available: false
        });
        
        drone.current_operator_id = user.id;
        drone.is_available = false;
      }
      
      // Notify all clients about order update
      io.emit('order_update', {
        order_id: data.order_id,
        state: 'Out_for_delivery'
      });
      
      // Notify the customer that their order is on the way
      const customerSocketId = Array.from(connectedUsers.entries())
        .find(([sid, u]) => u.id === order.customer_id)?.[0];
        
      if (customerSocketId) {
        io.to(customerSocketId).emit('order_out_for_delivery', {
          order_id: data.order_id,
          tracking_num: order.tracking_num
        });
      }
      
      console.log(`Order ${data.order_id} loaded onto drone ${data.drone_id} by courier ${user.username}`);
      
    } catch (error) {
      console.error('Load order error:', error.message);
      socket.emit('error', { message: 'Failed to load order' });
    }
  });
  
  // Handle order delivery confirmation
  socket.on('deliver_order', async (data) => {
    try {
      const user = connectedUsers.get(socket.id);
      
      // Check if user is a courier
      if (!user || user.type !== 'Courier') {
        socket.emit('error', { message: 'Only couriers can confirm deliveries' });
        return;
      }
      
      // Check if order exists
      if (!activeOrders.has(data.order_id)) {
        socket.emit('error', { message: 'Order not found' });
        return;
      }
      
      const order = activeOrders.get(data.order_id);
      
      // Update order state to "Delivered"
      await api.put('/updateOrder', {
        order_id: data.order_id,
        state: 'Delivered'
      });
      
      // Update local state
      order.state = 'Delivered';
      activeOrders.delete(data.order_id);
      
      // Notify all clients about order update
      io.emit('order_update', {
        order_id: data.order_id,
        state: 'Delivered'
      });
      
      // Notify the customer that their order is delivered
      const customerSocketId = Array.from(connectedUsers.entries())
        .find(([sid, u]) => u.id === order.customer_id)?.[0];
        
      if (customerSocketId) {
        io.to(customerSocketId).emit('order_delivered', {
          order_id: data.order_id,
          tracking_num: order.tracking_num
        });
      }
      
      console.log(`Order ${data.order_id} delivered by courier ${user.username}`);
      
    } catch (error) {
      console.error('Deliver order error:', error.message);
      socket.emit('error', { message: 'Failed to confirm delivery' });
    }
  });
  
  // Handle return to HQ request
  socket.on('return_to_hq', async (data) => {
    try {
      const user = connectedUsers.get(socket.id);
      
      // Check if user is a courier
      if (!user || user.type !== 'Courier') {
        socket.emit('error', { message: 'Only couriers can return drones to HQ' });
        return;
      }
      
      // Check if drone exists
      if (!activeDrones.has(data.drone_id)) {
        socket.emit('error', { message: 'Drone not found' });
        return;
      }
      
      const drone = activeDrones.get(data.drone_id);
      
      // Check if drone is assigned to this courier
      if (drone.current_operator_id !== user.id) {
        socket.emit('error', { message: 'You are not operating this drone' });
        return;
      }
      
      // Reset drone to HQ status
      await api.put('/updateDrone', {
        drone_id: drone.id,
        current_operator_id: null,
        is_available: true,
        latest_latitude: HQ.latitude,
        latest_longitude: HQ.longitude,
        altitude: 0,
        battery_level: 100
      });
      
      // Update local state
      drone.current_operator_id = null;
      drone.is_available = true;
      drone.latest_latitude = HQ.latitude;
      drone.latest_longitude = HQ.longitude;
      drone.altitude = 0;
      drone.battery_level = 100;
      
      // Broadcast updated drone status to all clients
      io.emit('drone_update', drone);
      
      console.log(`Drone ${data.drone_id} returned to HQ by courier ${user.username}`);
      
    } catch (error) {
      console.error('Return to HQ error:', error.message);
      socket.emit('error', { message: 'Failed to return drone to HQ' });
    }
  });
  
  // Handle client requesting current orders being delivered
  socket.on('currently_delivering', async () => {
    try {
      const deliveringOrders = Array.from(activeOrders.values())
        .filter(order => order.state === 'Out_for_delivery');
      
      // For the simplified version, we'll just send the basic order information
      // In a real implementation, we would fetch additional details
      socket.emit('currently_delivering_response', deliveringOrders);
      
    } catch (error) {
      console.error('Currently delivering error:', error.message);
      socket.emit('error', { message: 'Failed to get orders being delivered' });
    }
  });
  
  // Handle drone status request
  socket.on('drone_status', (data) => {
    try {
      if (!data || !data.drone_id) {
        socket.emit('error', { message: 'Drone ID required' });
        return;
      }
      
      if (!activeDrones.has(data.drone_id)) {
        socket.emit('error', { message: 'Drone not found' });
        return;
      }
      
      const drone = activeDrones.get(data.drone_id);
      
      // Find operator name if exists
      let operatorName = "None";
      if (drone.current_operator_id) {
        const operator = Array.from(connectedUsers.values())
          .find(u => u.id === drone.current_operator_id);
        if (operator) {
          operatorName = operator.username;
        }
      }
      
      socket.emit('drone_status_response', {
        drone_id: drone.id,
        battery_level: drone.battery_level,
        altitude: drone.altitude,
        current_operator: operatorName,
        coords: {
          latitude: drone.latest_latitude,
          longitude: drone.latest_longitude
        },
        is_available: drone.is_available
      });
      
    } catch (error) {
      console.error('Drone status error:', error.message);
      socket.emit('error', { message: 'Failed to get drone status' });
    }
  });
  
  // Handle disconnections
  socket.on('disconnect', async () => {
    try {
      const user = connectedUsers.get(socket.id);
      
      if (user) {
        console.log(`User disconnected: ${user.username} (${user.type})`);
        
        // If user was a courier operating a drone, handle the disconnection
        if (user.type === 'Courier') {
          // Find any drones operated by this courier
          for (const [droneId, drone] of activeDrones.entries()) {
            if (drone.current_operator_id === user.id) {
              console.log(`Courier ${user.username} was operating drone ${droneId} at disconnect`);
              
              // Handle drone crash when courier disconnects mid-operation
              await handleDroneCrash(droneId);
            }
          }
        }
        
        // Clean up maps
        usernameToSocketId.delete(user.username);
        connectedUsers.delete(socket.id);
      }
    } catch (error) {
      console.error('Disconnect handling error:', error.message);
    }
  });
});

// Handle CLI commands
function setupCliCommands() {
  rl.on('line', (input) => {
    const command = input.trim().toUpperCase();
    
    switch (command) {
      case 'QUIT':
        console.log('Shutting down server...');
        serverRunning = false;
        
        // Notify all clients
        io.emit('server_shutdown', { message: 'Server is shutting down' });
        
        // Close all socket connections
        io.disconnectSockets();
        
        // Close server after a short delay
        setTimeout(() => {
          server.close(() => {
            console.log('Server shutdown complete');
            rl.close();
            process.exit(0);
          });
        }, 1000);
        break;
      
      case 'CURRENTLY_DELIVERING':
        const deliveringOrders = Array.from(activeOrders.values())
          .filter(order => order.state === 'Out_for_delivery');
        
        if (deliveringOrders.length === 0) {
          console.log('No orders are currently being delivered');
        } else {
          console.log('\nCurrently delivering the following orders:');
          console.log('----------------------------------------');
          
          deliveringOrders.forEach(order => {
            console.log(`Order ID: ${order.order_id}`);
            console.log(`Tracking Number: ${order.tracking_num}`);
            console.log(`Destination: [${order.destination_latitude}, ${order.destination_longitude}]`);
            
            // If we had product details, we would display them here
            console.log('----------------------------------------');
          });
        }
        break;
      
      case 'DRONE_STATUS':
        if (activeDrones.size === 0) {
          console.log('No drones available');
        } else {
          console.log('\nDrone Status:');
          console.log('----------------------------------------');
          
          activeDrones.forEach(drone => {
            console.log(`Drone ID: ${drone.id}`);
            console.log(`Available: ${drone.is_available ? 'Yes' : 'No'}`);
            console.log(`Current Operator ID: ${drone.current_operator_id || 'None'}`);
            console.log(`Position: [${drone.latest_latitude}, ${drone.latest_longitude}]`);
            console.log(`Altitude: ${drone.altitude} meters`);
            console.log(`Battery: ${drone.battery_level}%`);
            console.log('----------------------------------------');
          });
        }
        break;
      
      case 'HELP':
        console.log('\nAvailable commands:');
        console.log('QUIT - Shutdown the server');
        console.log('CURRENTLY_DELIVERING - Show orders currently being delivered');
        console.log('DRONE_STATUS - Show status of all drones');
        console.log('HELP - Show this help message');
        break;
      
      default:
        console.log('Unknown command. Type HELP for a list of commands.');
    }
  });
}

// Start the server
async function startServer() {
  try {
    // Get valid port number from user
    const port = await getValidPort();
    
    // Start listening on the specified port
    server.listen(port, () => {
      console.log(`Courier System server running on port ${port}`);
      console.log('Type HELP for a list of commands');
      
      // Start polling for updates
      pollForUpdates();
      
      // Start generating dust devils
      generateDustDevils();
      
      // Set up CLI commands
      setupCliCommands();
    });
  } catch (error) {
    console.error('Server startup error:', error.message);
    process.exit(1);
  }
}

// Initialize the server
startServer();
