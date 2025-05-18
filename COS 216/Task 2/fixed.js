/**
 * COS 216 Homework Assignment
 * Multi-User NodeJS Server
 * 
 * [Your Name]
 * [Your Student Number]
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const readline = require('readline');
const process = require('process');
const { json } = require('stream/consumers');


// Create readline interface for server commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Configuration - Replace with your Wheatley credentials
// IMPORTANT: Remove credentials before submission
const WHEATLEY_USERNAME = "u24754120"; 
const WHEATLEY_PASSWORD = "Wyllf2006";
const API_BASE_URL = `https://wheatley.cs.up.ac.za/u24754120/api.php`;

// Initialize Express
var app = express();

const server = http.createServer(app);

// Initialize WebSocket server
let wss = null;

// Store connected clients with username mapping
const clients = new Map();

// Store currently delivering orders
const deliveringOrders = new Map();

// Store active drone information
const activeDrones = new Map();

// Function to ask for port at runtime
function askForPort() {
  rl.question('Enter port number to listen on (1024-49151): ', (port) => {
    const portNum = parseInt(port);
    
    // Validate port number
    if (isNaN(portNum) || portNum < 1024 || portNum > 49151) {
      console.log('Invalid port number. Please enter a number between 1024 and 49151.');
      askForPort();
      return;
    }
    
    // Start the server
    startServer(portNum);
  });
}

// Function to start server with given port
function startServer(port) {
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    setupWebSocketServer();
    setupServerCommands();
  });
}

// Create axios instance with authentication headers
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': 'Basic ' + btoa(`${WHEATLEY_USERNAME}:${WHEATLEY_PASSWORD}`),
    'Content-Type': 'application/json'
  }
});

// Setup WebSocket server
function setupWebSocketServer() {
  wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    // Generate temporary ID until authenticated
    const tempId = Math.random().toString(36).substring(2, 10);
    clients.set(ws, { id: tempId, authenticated: false });
    
    console.log(`New connection established (temporary ID: ${tempId})`);
    
    // Handle incoming messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        
        // Handle login
        if (data.type === 'LOGIN') {
          await handleLogin(ws, data);
        } 
        // All other commands require authentication
        else if (!clients.get(ws).authenticated) {
          sendMessage(ws, { type: 'ERROR', message: 'Please login first' });
        }
        // Handle customer order request
        else if (data.type === 'REQUEST_DELIVERY') {
          await handleRequestDelivery(ws, data);
        }
        // Handle courier selecting orders to deliver
        else if (data.type === 'SELECT_ORDERS') {
          await handleSelectOrders(ws, data);
        }
        // Handle drone movement
        else if (data.type === 'MOVE_DRONE') {
          await handleDroneMovement(ws, data);
        }
        // Handle marking order as delivered
        else if (data.type === 'MARK_DELIVERED') {
          await handleMarkDelivered(ws, data);
        }
        // Get all orders
        else if (data.type === 'GET_ORDERS') {
          await handleGetOrders(ws);
        }
        // Get all drones
        else if (data.type === 'GET_DRONES') {
          await handleGetDrones(ws);
        }
      } catch (error) {
        console.error('Error processing message:', error);
        sendMessage(ws, { type: 'ERROR', message: 'Invalid message format' });
      }
    });
    
    // Handle client disconnection
    ws.on('close', () => {
      const clientInfo = clients.get(ws);
      if (clientInfo) {
        console.log(`Client disconnected: ${clientInfo.username || clientInfo.id}`);
        
        // Handle if a courier operating a drone disconnects
        if (clientInfo.userType === 'Courier' && clientInfo.operatingDroneId) {
          handleCourierDisconnect(clientInfo);
        }
        
        clients.delete(ws);
      }
    });
    
    // Send welcome message
    sendMessage(ws, { 
      type: 'CONNECTED', 
      message: 'Connected to Drone Courier System. Please login.' 
    });
  });
}

// Handle login request
async function handleLogin(ws, data) {
  try {
    // Call the login API with exact format matching the API documentation
const response = await apiClient.post('', { "type": "Login",
 "email":data.email,
 "password":data.password
  });



    
    if (response.data.status === 'success') {
      // Get user information
      const userId = response.data.id;
      
      // We need to determine user type (Customer or Courier)
      // For this example, we'll use the type passed by the client for simplicity
      const userType = response.data.userType ; 
      
      // Update client info
      clients.set(ws, {
        id: userId,
        username: data.email,
        authenticated: true,
        userType: userType
      });
      
      console.log(`User logged in: ${data.email} (${userType})`);
      
      sendMessage(ws, { 
        type: 'LOGIN_SUCCESS', 
        userId: userId,
        userType: userType,
        message: 'Login successful' 
      });
    } else {
      sendMessage(ws, { type: 'LOGIN_FAILED', message: 'Invalid credentials' });
    }
  } catch (error) {
   
    console.error('Login error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'LOGIN_FAILED', message: 'Login failed' });
  }
}

// Handle customer requesting delivery
async function handleRequestDelivery(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Customer') {
    sendMessage(ws, { type: 'ERROR', message: 'Only customers can request deliveries' });
    return;
  }
  
  try {
    // First check if the order exists and belongs to the customer
    const ordersResponse = await apiClient.post('', {
      type: 'GetAllOrders',
      customer_id: clientInfo.id
    });
    
    if (ordersResponse.data.status !== 'success') {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to verify order' });
      return;
    }
    
    const orders = ordersResponse.data.data;
    const order = orders.find(o => o.order_id === data.orderId);
    
    if (!order) {
      // If order doesn't exist, create a new one
      const createResponse = await apiClient.post('', {
        type: 'CreateOrder',
        customer_id: clientInfo.id,
        destination_latitude: data.latitude,
        destination_longitude: data.longitude,
        requested: 1  // Set requested flag to 1
      });
      
      if (createResponse.data.status === 'success') {
        // Notify all couriers about new order
        broadcastToCouriers({
          type: 'NEW_ORDER',
          orderId: createResponse.data.data.order_id,
          trackingNumber: createResponse.data.data.tracking_num,
          customerId: clientInfo.id,
          customerEmail: clientInfo.username,
          requested: 1
        });
        
        sendMessage(ws, { 
          type: 'ORDER_CREATED', 
          orderId: createResponse.data.data.order_id,
          trackingNumber: createResponse.data.data.tracking_num,
          message: 'Order created successfully. Waiting for courier.',
          requested: 1
        });
      } else {
        sendMessage(ws, { type: 'ERROR', message: 'Failed to create order' });
      }
    } else {
      // Order exists, update it to set requested flag to 1
      const updateResponse = await apiClient.post('', {
        type: 'UpdateOrder',
        order_id: order.order_id,
        latitude: order.destination_latitude,
        longitude: order.destination_longitude,
        state: order.state,
        requested: 1  // Set requested flag to 1
      });
      
      if (updateResponse.data.status === 'success') {
        // Notify all couriers about updated order
        broadcastToCouriers({
          type: 'ORDER_UPDATE',
          orderId: order.order_id,
          trackingNumber: order.tracking_num,
          customerId: clientInfo.id,
          customerEmail: clientInfo.username,
          requested: 1
        });
        
        sendMessage(ws, { 
          type: 'ORDER_UPDATE', 
          orderId: order.order_id,
          message: 'Delivery requested successfully. Waiting for courier.',
          requested: 1
        });
      } else {
        sendMessage(ws, { type: 'ERROR', message: 'Failed to update order' });
      }
    }
  } catch (error) {
    console.error('Request delivery error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to process delivery request' });
  }
}

// Handle courier selecting orders to deliver
async function handleSelectOrders(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Courier') {
    sendMessage(ws, { type: 'ERROR', message: 'Only couriers can select orders for delivery' });
    return;
  }
  
  try {
    // Check if drone is available
    const dronesResponse = await apiClient.post('', {
      type: 'GetAllDrones'
    });
    
    if (dronesResponse.data.status !== 'success') {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get drones' });
      return;
    }
    
    const drones = dronesResponse.data.data;
    const drone = drones.find(d => d.id === data.droneId);
    
    if (!drone || !parseInt(drone.is_available)) {
      sendMessage(ws, { type: 'ERROR', message: 'Selected drone is not available' });
      return;
    }
    
    // Update drone status
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: data.droneId,
      current_operator_id: clientInfo.id,
      is_available: 0,
      latitude: drone.latest_latitude,
      longitude: drone.latest_longitude,
      altitude: drone.altitude,
      battery_level: drone.battery_level
    });
    
    // Update orders to "Out for delivery"
    for (const orderId of data.orderIds) {
      await apiClient.post('', {
        type: 'UpdateOrder',
        order_id: orderId,
        latitude: drone.latest_latitude,
        longitude: drone.latest_longitude,
        state: 'OutForDelivery'
      });
      
      // Add to delivering orders map
      deliveringOrders.set(orderId, {
        droneId: data.droneId,
        courierId: clientInfo.id,
        courierEmail: clientInfo.username
      });
    }
    
    // Mark courier as operating this drone
    clientInfo.operatingDroneId = data.droneId;
    clients.set(ws, clientInfo);
    
    // Store active drone information
    activeDrones.set(data.droneId, {
      id: data.droneId,
      courierId: clientInfo.id,
      courierEmail: clientInfo.username,
      orders: data.orderIds,
      latitude: parseFloat(drone.latest_latitude),
      longitude: parseFloat(drone.latest_longitude),
      altitude: parseFloat(drone.altitude),
      batteryLevel: parseFloat(drone.battery_level)
    });
    
    // Notify customers about their order being out for delivery
    for (const orderId of data.orderIds) {
      const orderResponse = await apiClient.post('', {
        type: 'GetAllOrders',
        customer_id: clientInfo.id
      });
      
      if (orderResponse.data.status === 'success') {
        const orders = orderResponse.data.data;
        const order = orders.find(o => o.order_id === orderId);
        
        if (order) {
          // Find customer
          for (const [socket, client] of clients.entries()) {
            if (client.id === order.customer_id) {
              sendMessage(socket, {
                type: 'ORDER_UPDATE',
                orderId: orderId,
                status: 'OutForDelivery',
                message: 'Your order is now out for delivery!',
                droneId: data.droneId
              });
            }
          }
        }
      }
    }
    
    sendMessage(ws, {
      type: 'ORDERS_SELECTED',
      droneId: data.droneId,
      orderIds: data.orderIds,
      message: 'Orders are now being delivered'
    });
    
    // Broadcast new drone position to all clients
    broadcastDronePosition(data.droneId);
  } catch (error) {
    console.error('Select orders error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to select orders for delivery' });
  }
}

// Handle drone movement
async function handleDroneMovement(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Courier' || !clientInfo.operatingDroneId) {
    sendMessage(ws, { type: 'ERROR', message: 'You are not operating a drone' });
    return;
  }
  
  const droneId = clientInfo.operatingDroneId;
  const drone = activeDrones.get(droneId);
  
  if (!drone) {
    sendMessage(ws, { type: 'ERROR', message: 'Drone not found' });
    return;
  }
  
  // Calculate new position based on direction
  let newLatitude = drone.latitude;
  let newLongitude = drone.longitude;
  
  switch (data.direction) {
    case 'UP':
      newLongitude += 0.0001;
      break;
    case 'DOWN':
      newLongitude -= 0.0001;
      break;
    case 'RIGHT':
      newLatitude += 0.0001;
      break;
    case 'LEFT':
      newLatitude -= 0.0001;
      break;
  }
  
  // Check for dust devils (if provided by client)
  if (data.dustDevils && data.dustDevils.length > 0) {
    const isInDustDevil = data.dustDevils.some(devil => {
      const distance = calculateDistance(
        newLatitude, newLongitude,
        devil.latitude, devil.longitude
      );
      return distance <= 0.0001; // Approximate 10 meters in decimal degrees
    });
    
    if (isInDustDevil) {
      // Step back to previous position
      switch (data.direction) {
        case 'UP':
          newLongitude -= 0.0001; // Undo the movement
          newLongitude -= 0.0001; // Take one step back
          break;
        case 'DOWN':
          newLongitude += 0.0001; // Undo the movement
          newLongitude += 0.0001; // Take one step back
          break;
        case 'RIGHT':
          newLatitude -= 0.0001; // Undo the movement
          newLatitude -= 0.0001; // Take one step back
          break;
        case 'LEFT':
          newLatitude += 0.0001; // Undo the movement
          newLatitude += 0.0001; // Take one step back
          break;
      }
      
      // Increase altitude by 5 meters
      drone.altitude += 5;
      
      // Check if altitude is above 30 meters (drone will crash)
      if (drone.altitude > 30) {
        await handleDroneCrash(droneId, 'Altitude exceeded safe limit due to dust devil');
        return;
      }
      
      sendMessage(ws, {
        type: 'DUST_DEVIL_WARNING',
        message: 'Drone encountered a dust devil! Altitude increased to ' + drone.altitude + 'm'
      });
    }
  }
  
  // Check if drone is within 5km range of HQ
  const distanceFromHQ = calculateDistance(
    newLatitude, newLongitude,
    25.7472, 28.2511 // HQ coordinates
  );
  
  if (distanceFromHQ > 5) {
    sendMessage(ws, {
      type: 'RANGE_WARNING',
      message: 'Cannot move further: Drone would exceed 5km range from HQ'
    });
    return;
  }
  
  // Update drone position
  drone.latitude = newLatitude;
  drone.longitude = newLongitude;
  
  // Decrease battery level slightly with each move
  drone.batteryLevel -= 0.1;
  if (drone.batteryLevel <= 0) {
    await handleDroneCrash(droneId, 'Battery depleted');
    return;
  }
  
  // Update drone in active drones map
  activeDrones.set(droneId, drone);
  
  try {
    // Update drone position in database
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: droneId,
      current_operator_id: clientInfo.id,
      is_available: 0,
      latitude: newLatitude,
      longitude: newLongitude,
      altitude: drone.altitude,
      battery_level: drone.batteryLevel
    });
    
    // Update orders that are being delivered by this drone
    for (const orderId of drone.orders) {
      await apiClient.post('', {
        type: 'UpdateOrder',
        order_id: orderId,
        latitude: newLatitude,
        longitude: newLongitude,
        state: 'OutForDelivery'
      });
    }
    
    // Broadcast new drone position to all clients
    broadcastDronePosition(droneId);
    
    sendMessage(ws, {
      type: 'DRONE_MOVED',
      latitude: newLatitude,
      longitude: newLongitude,
      altitude: drone.altitude,
      batteryLevel: drone.batteryLevel
    });
    
    // Check if drone is at HQ
    const atHQ = calculateDistance(
      newLatitude, newLongitude,
      25.7472, 28.2511 // HQ coordinates
    ) < 0.0001;
    
    if (atHQ) {
      // Reset drone when it returns to HQ
      await resetDroneAtHQ(droneId, clientInfo.id);
    }
  } catch (error) {
    console.error('Drone movement error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to update drone position' });
  }
}

// Handle marking an order as delivered
async function handleMarkDelivered(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Courier' || !clientInfo.operatingDroneId) {
    sendMessage(ws, { type: 'ERROR', message: 'You are not operating a drone' });
    return;
  }
  
  const droneId = clientInfo.operatingDroneId;
  const drone = activeDrones.get(droneId);
  
  if (!drone) {
    sendMessage(ws, { type: 'ERROR', message: 'Drone not found' });
    return;
  }
  
  try {
    // Get order details
    const ordersResponse = await apiClient.post('', {
      type: 'GetAllOrders',
      customer_id: clientInfo.id
    });
    
    if (ordersResponse.data.status !== 'success') {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get order details' });
      return;
    }
    
    const orders = ordersResponse.data.data;
    const order = orders.find(o => o.order_id === data.orderId);
    
    if (!order) {
      sendMessage(ws, { type: 'ERROR', message: 'Order not found' });
      return;
    }
    
    // Check if drone is at the delivery location
    const distanceToDestination = calculateDistance(
      drone.latitude, drone.longitude,
      parseFloat(order.destination_latitude), parseFloat(order.destination_longitude)
    );
    
    if (distanceToDestination > 0.0001) { // Approximately 10 meters
      sendMessage(ws, {
        type: 'ERROR',
        message: 'Drone is not at the delivery location'
      });
      return;
    }
    
    // Mark order as delivered
    await apiClient.post('', {
      type: 'UpdateOrder',
      order_id: data.orderId,
      latitude: order.destination_latitude,
      longitude: order.destination_longitude,
      state: 'Delivered'
    });
    
    // Update drone orders list
    drone.orders = drone.orders.filter(id => id !== data.orderId);
    activeDrones.set(droneId, drone);
    
    // Remove from delivering orders
    deliveringOrders.delete(data.orderId);
    
    // Notify customer
    for (const [socket, client] of clients.entries()) {
      if (client.id === order.customer_id) {
        sendMessage(socket, {
          type: 'ORDER_DELIVERED',
          orderId: data.orderId,
          message: 'Your order has been delivered!'
        });
      }
    }
    
    sendMessage(ws, {
      type: 'DELIVERY_CONFIRMED',
      orderId: data.orderId,
      remainingOrders: drone.orders,
      message: 'Order marked as delivered'
    });
    
    // If no more orders, prompt return to HQ
    if (drone.orders.length === 0) {
      sendMessage(ws, {
        type: 'RETURN_TO_HQ',
        message: 'All orders delivered. Please return to HQ.'
      });
    }
  } catch (error) {
    console.error('Mark delivered error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to mark order as delivered' });
  }
}

// Handle get all orders
async function handleGetOrders(ws) {
  const clientInfo = clients.get(ws);
  
  try {
    const response = await apiClient.post('', {
      type: 'GetAllOrders',
      customer_id: clientInfo.id
    });
    
    if (response.data.status === 'success') {
      sendMessage(ws, {
        type: 'ORDERS_LIST',
        orders: response.data.data
      });
    } else {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get orders' });
    }
  } catch (error) {
    console.error('Get orders error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to get orders' });
  }
}

// Handle get all drones
async function handleGetDrones(ws) {
  try {
    const response = await apiClient.post('', {
      type: 'GetAllDrones'
    });
    
    if (response.data.status === 'success') {
      sendMessage(ws, {
        type: 'DRONES_LIST',
        drones: response.data.data
      });
    } else {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get drones' });
    }
  } catch (error) {
    console.error('Get drones error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to get drones' });
  }
}

// Handle courier disconnect while operating a drone
async function handleCourierDisconnect(clientInfo) {
  const droneId = clientInfo.operatingDroneId;
  
  if (!droneId) return;
  
  try {
    const drone = activeDrones.get(droneId);
    
    if (drone) {
      console.log(`Courier ${clientInfo.username} disconnected while operating drone ${droneId}`);
      
      // Notify all customers with orders being delivered by this drone
      for (const orderId of drone.orders) {
        // Get order details to find customer
        const ordersResponse = await apiClient.post('', {
          type: 'GetAllOrders',
          customer_id: clientInfo.id
        });
        
        if (ordersResponse.data.status === 'success') {
          const orders = ordersResponse.data.data;
          const order = orders.find(o => o.order_id === orderId);
          
          if (order) {
            // Find customer
            for (const [socket, client] of clients.entries()) {
              if (client.id === order.customer_id) {
                sendMessage(socket, {
                  type: 'DELIVERY_POSTPONED',
                  orderId: orderId,
                  message: 'Your delivery has been postponed due to courier connection issues'
                });
              }
            }
            
            // Reset order to Storage state
            await apiClient.post('', {
              type: 'UpdateOrder',
              order_id: orderId,
              latitude: order.destination_latitude,
              longitude: order.destination_longitude,
              state: 'Storage'
            });
          }
        }
        
        // Remove from delivering orders
        deliveringOrders.delete(orderId);
      }
      
      // Update drone to crashed state
      await apiClient.post('', {
        type: 'UpdateDrone',
        drone_id: droneId,
        current_operator_id: null,
        is_available: 0, // Not available because it crashed
        latitude: drone.latitude,
        longitude: drone.longitude,
        altitude: 0, // Crashed
        battery_level: 0 // Crashed
      });
      
      // Remove from active drones
      activeDrones.delete(droneId);
      
      // Broadcast to all users that drone has crashed
      broadcastToAll({
        type: 'DRONE_CRASHED',
        droneId: droneId,
        message: 'Drone has crashed due to operator disconnection'
      });
    }
  } catch (error) {
    console.error('Handle courier disconnect error:', error.response?.data || error.message);
  }
}

// Handle drone crash
async function handleDroneCrash(droneId, reason) {
  try {
    const drone = activeDrones.get(droneId);
    
    if (!drone) return;
    
    console.log(`Drone ${droneId} crashed: ${reason}`);
    
    // Update drone to crashed state
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: droneId,
      current_operator_id: null,
      is_available: 0, // Not available because it crashed
      latitude: drone.latitude,
      longitude: drone.longitude,
      altitude: 0, // Crashed
      battery_level: 0 // Crashed
    });
    
    // Notify the courier
    for (const [socket, client] of clients.entries()) {
      if (client.id === drone.courierId) {
        sendMessage(socket, {
          type: 'DRONE_CRASHED',
          droneId: droneId,
          message: `Drone crashed: ${reason}`
        });
        
        // Update client info
        client.operatingDroneId = null;
        clients.set(socket, client);
      }
    }
    
    // Notify all customers with orders being delivered by this drone
    for (const orderId of drone.orders) {
      // Get order details
      const ordersResponse = await apiClient.post('', {
        type: 'GetAllOrders',
        customer_id: drone.courierId
      });
      
      if (ordersResponse.data.status === 'success') {
        const orders = ordersResponse.data.data;
        const order = orders.find(o => o.order_id === orderId);
        
        if (order) {
          // Find customer
          for (const [socket, client] of clients.entries()) {
            if (client.id === order.customer_id) {
              sendMessage(socket, {
                type: 'DELIVERY_POSTPONED',
                orderId: orderId,
                message: `Your delivery has been postponed due to drone crash: ${reason}`
              });
            }
          }
          
          // Reset order to Storage state
          await apiClient.post('', {
            type: 'UpdateOrder',
            order_id: orderId,
            latitude: order.destination_latitude,
            longitude: order.destination_longitude,
            state: 'Storage'
          });
        }
      }
      
      // Remove from delivering orders
      deliveringOrders.delete(orderId);
    }
    
    // Remove from active drones
    activeDrones.delete(droneId);
    
    // Broadcast to all users that drone has crashed
    broadcastToAll({
      type: 'DRONE_CRASHED',
      droneId: droneId,
      message: `Drone has crashed: ${reason}`
    });
  } catch (error) {
    console.error('Handle drone crash error:', error.response?.data || error.message);
  }
}

// Reset drone when it returns to HQ
async function resetDroneAtHQ(droneId, operatorId) {
  try {
    const drone = activeDrones.get(droneId);
    
    if (!drone) return;
    
    // Only proceed if there are no more orders to deliver
    if (drone.orders.length > 0) return;
    
    console.log(`Drone ${droneId} has returned to HQ`);
    
    // Reset drone in database
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: droneId,
      current_operator_id: null, // Reset operator
      is_available: 1, // Available again
      latitude: 25.7472, // HQ latitude
      longitude: 28.2511, // HQ longitude
      altitude: 0, // On the ground
      battery_level: 100 // Fully charged
    });
    
    // Find the courier
    for (const [socket, client] of clients.entries()) {
      if (client.id === operatorId) {
        sendMessage(socket, {
          type: 'DRONE_RESET',
          droneId: droneId,
          message: 'Drone has returned to HQ and has been reset'
        });
        
        // Update client info
        client.operatingDroneId = null;
        clients.set(socket, client);
      }
    }
    
    // Remove from active drones
    activeDrones.delete(droneId);
    
    // Broadcast to all users that drone has returned
    broadcastToAll({
      type: 'DRONE_RETURNED',
      droneId: droneId,
      message: 'Drone has returned to HQ'
    });
  } catch (error) {
    console.error('Reset drone at HQ error:', error.response?.data || error.message);
  }
}

// Broadcast drone position to all clients
function broadcastDronePosition(droneId) {
  const drone = activeDrones.get(droneId);
  
  if (!drone) return;
  
  broadcastToAll({
    type: 'DRONE_POSITION',
    droneId: droneId,
    latitude: drone.latitude,
    longitude: drone.longitude,
    altitude: drone.altitude,
    batteryLevel: drone.batteryLevel,
    courierId: drone.courierId,
    courierEmail: drone.courierEmail
  });
}

// Calculate distance between two points (haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

// Send message to a specific client
function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Broadcast message to all clients
function broadcastToAll(message) {
  for (const [socket, _] of clients.entries()) {
    sendMessage(socket, message);
  }
}

// Broadcast message to all couriers
function broadcastToCouriers(message) {
  for (const [socket, client] of clients.entries()) {
    if (client.userType === 'Courier') {
      sendMessage(socket, message);
    }
  }
}

// Broadcast message to all customers
function broadcastToCustomers(message) {
  for (const [socket, client] of clients.entries()) {
    if (client.userType === 'Customer') {
      sendMessage(socket, message);
    }
  }
}

// Setup server commands
function setupServerCommands() {
  console.log('Server commands:');
  console.log('- CURRENTLY_DELIVERING: Show orders currently being delivered');
  console.log('- KILL <username>: Disconnect a specific user');
  console.log('- DRONE_STATUS: Show status of all active drones');
  console.log('- QUIT: Shutdown the server');
  
  rl.on('line', async (input) => {
    const args = input.trim().split(' ');
    const command = args[0].toUpperCase();
    
    switch (command) {
      case 'CURRENTLY_DELIVERING':
        handleCurrentlyDeliveringCommand();
        break;
      case 'KILL':
        if (args.length < 2) {
          console.log('Usage: KILL <username>');
        } else {
          handleKillCommand(args[1]);
        }
        break;
      case 'DRONE_STATUS':
        handleDroneStatusCommand();
        break;
      case 'QUIT':
        handleQuitCommand();
        break;
      default:
        console.log('Unknown command. Available commands:');
        console.log('- CURRENTLY_DELIVERING');
        console.log('- KILL <username>');
        console.log('- DRONE_STATUS');
        console.log('- QUIT');
    }
  });
}

// Handle CURRENTLY_DELIVERING command
async function handleCurrentlyDeliveringCommand() {

  console.log('Currently delivering:');
  
  try {
  
      // Get order details
      const ordersResponse = await apiClient.post("", {
        type: 'GetAllDeliveries',
      });
     
      var ProductsResponse;
      if (ordersResponse.data.status === 'success') {
        const orders = ordersResponse.data.data;
        
       for( i=0;i<orders.length;i++){
       var order=orders[i];


        
        if (order) {
          console.log(`Order ID: ${order.order_id}`);
          console.log(`Customer ID: ${order.customer_id}`);
          console.log(`Destination: [${order.destination_latitude}, ${order.destination_longitude}]`);
          console.log(`Tracking number: ${order.tracking_num}`);
          console.log(`Products:`);
          // get the products
            ProductsResponse = await apiClient.post("", {
        type: 'GetProducts',
        order_id: order.order_id
  
      });
       var products = ProductsResponse.data.data;
       for( j=0;j<products.length;j++)
          console.log(products[j])
          console.log('---');
        }
      }
      }
    
  } catch (error) {
    console.error('Error fetching order details:', error.message);
  }
}

// Handle KILL command
function handleKillCommand(username) {
  let found = false;
  
  for (const [socket, client] of clients.entries()) {
    if (client.username === username) {
      console.log(`Disconnecting user: ${username}`);
      
      // Send disconnect message to client
      sendMessage(socket, {
        type: 'FORCE_DISCONNECT',
        message: 'You have been disconnected by the server admin'
      });
      
      // Close the connection
      socket.close();
      
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log(`User not found: ${username}`);
  }
}

// Handle DRONE_STATUS command
async function handleDroneStatusCommand() {


console.log('Active drones:');
const dronesResponse = await apiClient.post("", {
        type: 'GetAllDrones'
      });
     
      
      if (dronesResponse.data.status === 'success') {
        const dronesArr = dronesResponse.data.data;
        
       for( i=0;i<dronesArr.length;i++){
       var droneData=dronesArr[i];

 
  
  
  
  
    console.log(`Drone ID: ${droneData.id}`);
    console.log(`Battery Level: ${droneData.battery_level.toFixed(1)}%`);
    console.log(`Altitude: ${droneData.altitude} meters`);
    console.log(`GPS Coordinates: [${droneData.latest_latitude}, ${droneData.latest_longitude}]`);
    console.log('---');
       }}
  
}

// Handle QUIT command
function handleQuitCommand() {
  console.log('Shutting down server...');
  
  // Broadcast shutdown message to all clients
  broadcastToAll({
    type: 'SERVER_SHUTDOWN',
    message: 'Server is shutting down'
  });
  
  // Close all WebSocket connections
  for (const [socket, _] of clients.entries()) {
    socket.close();
  }
  
  // Close the server
  server.close(() => {
    console.log('Server has been shut down');
    process.exit(0);
  });
}

// Start the server
askForPort();