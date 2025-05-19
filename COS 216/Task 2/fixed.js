const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const readline = require('readline');
const process = require('process');
const { json } = require('stream/consumers');


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


const WHEATLEY_USERNAME = "u24754120"; 
const WHEATLEY_PASSWORD = "Wyllf2006";
const API_BASE_URL = `https://wheatley.cs.up.ac.za/u24754120/api.php`;

var app = express();

const server = http.createServer(app);

let wss = null;

const clients = new Map();

const deliveringOrders = new Map();

const activeDrones = new Map();

function askForPort() {
  rl.question('Enter port number to listen on (1024-49151): ', (port) => {
    const portNum = parseInt(port);
    
    
    if (isNaN(portNum) || portNum < 1024 || portNum > 49151) {
      console.log('Invalid port number. Please enter a number between 1024 and 49151.');
      askForPort();
      return;
    }
    
    startServer(portNum);
  });
}

function startServer(port) {

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    setupWebSocketServer();
    setupServerCommands();
  });
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': 'Basic ' + btoa(`${WHEATLEY_USERNAME}:${WHEATLEY_PASSWORD}`),
    'Content-Type': 'application/json'
  }
});

function setupWebSocketServer() {
  wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    const tempId = Math.random().toString(36).substring(2, 10);
    clients.set(ws, { id: tempId, authenticated: false });
    
    console.log(`New connection established (temporary ID: ${tempId})`);
    
    ws.on('message', async (message) => {

      try {
        const data = JSON.parse(message);
        
        if (data.type === 'LOGIN') {
          await handleLogin(ws, data);
        } 
        else if (!clients.get(ws).authenticated) {
          sendMessage(ws, { type: 'ERROR', message: 'Please login first' });
        }
        else if (data.type === 'REQUEST_DELIVERY') {
          await handleRequestDelivery(ws, data);
        }
        else if (data.type === 'SELECT_ORDERS') {
          await handleSelectOrders(ws, data);
        }
        else if (data.type === 'MOVE_DRONE') {
          await handleDroneMovement(ws, data);
        }
        else if (data.type === 'MARK_DELIVERED') {
          await handleMarkDelivered(ws, data);
        }
        else if (data.type === 'GET_ORDERS') {
          await handleGetOrders(ws);
        }
        else if (data.type === 'GET_DRONES') {
          await handleGetDrones(ws);
        }
      } catch (error) {
        console.error('Error processing message:', error);
        sendMessage(ws, { type: 'ERROR', message: 'Invalid message format' });
      }
    });
    
    ws.on('close', () => {
      const clientInfo = clients.get(ws);
      if (clientInfo) {
        console.log(`Client disconnected: ${clientInfo.username || clientInfo.id}`);
        
        if (clientInfo.userType === 'Courier' && clientInfo.operatingDroneId) {
          handleCourierDisconnect(clientInfo);
        }
        
        clients.delete(ws);
      }
    });
    
    sendMessage(ws, { 
      type: 'CONNECTED', 
      message: 'Connected to Drone Courier System. Please login.' 
    });
  });
}

async function handleLogin(ws, data) {
  try {

    const response = await apiClient.post('', { "type": "Login",
 "email":data.email,
 "password":data.password
  });



    
    if (response.data.status === 'success') {

      const userId = response.data.id;
      
      const userType = response.data.userType ; 
      
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

async function handleRequestDelivery(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Customer') {
    sendMessage(ws, { type: 'ERROR', message: 'Only customers can request deliveries' });
    return;
  }
  
  try {

    const ordersResponse = await apiClient.post('', {
      type: 'GetAllOrders',
      customer_id: clientInfo.id
    });
    
    if (ordersResponse.data.status !== 'success') {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get orders' });
      return;
    }
    
    const orders = ordersResponse.data.data;
    const order = orders.find(o => o.order_id === data.orderId);
    
    if (!order) {
      sendMessage(ws, { type: 'ERROR', message: 'Order not found' });
      return;
    }
    
    const updateResponse = await apiClient.post('', {
      type: 'UpdateOrder',
      order_id: order.order_id,
      latitude: order.destination_latitude,
      longitude: order.destination_longitude,
      state: order.state,
      requested: 1
    });
    
    if (updateResponse.data.status === 'success') {

      broadcastToCouriers({
        type: 'NEW_ORDER',
        orderId: order.order_id,
        trackingNumber: order.tracking_num,
        customerId: clientInfo.id,
        customerEmail: clientInfo.username,
        requested: 1,
        message: 'New delivery request'
      });
      
      sendMessage(ws, { 
        type: 'ORDER_UPDATE',
        orderId: order.order_id,
        status: order.state,
        requested: 1,
        message: 'Delivery requested successfully. Waiting for courier.'
      });
    } else {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to request delivery' });
    }
  } catch (error) {
    console.error('Request delivery error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to request delivery' });
  }
}

async function handleSelectOrders(ws, data) {
  const clientInfo = clients.get(ws);
  
  if (clientInfo.userType !== 'Courier') {
    sendMessage(ws, { type: 'ERROR', message: 'Only couriers can select orders for delivery' });
    return;
  }
  
  try {

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
    
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: data.droneId,
      current_operator_id: clientInfo.id,
      is_available: 0,
      latitude: drone.latest_latitude,
      longitude: drone.latest_longitude,
      altitude: 20,
      battery_level: drone.battery_level
    });
    
    for (const orderId of data.orderIds) {
      await apiClient.post('', {
        type: 'UpdateOrder',
        order_id: orderId,
        latitude: drone.latest_latitude,
        longitude: drone.latest_longitude,
        state: 'Out_for_delivery'
      });
      
      deliveringOrders.set(orderId, {
        droneId: data.droneId,
        courierId: clientInfo.id,
        courierEmail: clientInfo.username
      });
    }
    
    clientInfo.operatingDroneId = data.droneId;
    clients.set(ws, clientInfo);
    
    activeDrones.set(data.droneId, {
      id: data.droneId,
      courierId: clientInfo.id,
      courierEmail: clientInfo.username,
      orders: data.orderIds,
      latitude: parseFloat(drone.latest_latitude),
      longitude: parseFloat(drone.latest_longitude),
      altitude: 20,
      batteryLevel: parseFloat(drone.battery_level)
    });
    
    for (const orderId of data.orderIds) {
      const orderResponse = await apiClient.post('', {
        type: 'GetAllOrders',
        customer_id: clientInfo.id
      });
      
      if (orderResponse.data.status === 'success') {
        const orders = orderResponse.data.data;
        const order = orders.find(o => o.order_id === orderId);
        
        if (order) {

          for (const [socket, client] of clients.entries()) {
            if (client.id === order.customer_id) {
              sendMessage(socket, {
                type: 'ORDER_UPDATE',
                orderId: orderId,
                status: 'Out_for_delivery',
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
    
    broadcastDronePosition(data.droneId);
  } catch (error) {
    console.error('Select orders error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to select orders for delivery' });
  }
}

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
  
  console.log(`Moving drone ${droneId} in direction ${data.direction}`);
  
  let newLatitude = drone.latitude;
  let newLongitude = drone.longitude;
  

  switch (data.direction) {
    case 'UP':
      newLatitude += 0.0001;
      break;
    case 'DOWN':
      newLatitude -= 0.0001;
      break;
    case 'LEFT':
      newLongitude -= 0.0001;
      break;
    case 'RIGHT':
      newLongitude += 0.0001;
      break;
  }
  
  let dustDevilEncountered = false;
  
  if (data.dustDevils && Array.isArray(data.dustDevils) && data.dustDevils.length > 0) {
    console.log('Checking for dust devils:', data.dustDevils);
    
    const isInDustDevil = data.dustDevils.some(devil => {
      if (!devil.latitude || !devil.longitude) return false;
      
      const distance = calculateDistance(
        newLatitude, newLongitude,
        parseFloat(devil.latitude), parseFloat(devil.longitude)
      );
      
      console.log(`Distance to dust devil at [${devil.latitude}, ${devil.longitude}]: ${distance}km`);
      return distance <= 0.0001;
    });
    
    if (isInDustDevil) {
      dustDevilEncountered = true;
      console.log('Dust devil encountered!');
      
      switch (data.direction) {
        case 'UP':
          newLatitude -= 0.0001;
          newLatitude -= 0.0001;
          break;
        case 'DOWN':
          newLatitude += 0.0001;
          newLatitude += 0.0001;
          break;
        case 'LEFT':
          newLongitude += 0.0001;
          newLongitude += 0.0001;
          break;
        case 'RIGHT':
          newLongitude -= 0.0001;
          newLongitude -= 0.0001;
          break;
      }
      
      drone.altitude += 5;
      
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
  
  const distanceFromHQ = calculateDistance(
    newLatitude, newLongitude,
    -25.7472, 28.2511
  );
  
  if (distanceFromHQ > 5) {
    sendMessage(ws, {
      type: 'RANGE_WARNING',
      message: 'Cannot move further: Drone would exceed 5km range from HQ'
    });
    return;
  }
  
  drone.latitude = newLatitude;
  drone.longitude = newLongitude;
  
  drone.batteryLevel -= 0.1;
  if (drone.batteryLevel <= 0) {
    await handleDroneCrash(droneId, 'Battery depleted');
    return;
  }
  
  activeDrones.set(droneId, drone);
  
  try {

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
    
    for (const orderId of drone.orders) {
      await apiClient.post('', {
        type: 'UpdateOrder',
        order_id: orderId,
        latitude: newLatitude,
        longitude: newLongitude,
        state: 'Out_for_delivery'
      });
    }
    
    broadcastDronePosition(droneId);
    
    const atHQ = calculateDistance(
      newLatitude, newLongitude,
      -25.7472, 28.2511
    ) < 0.0001;
    
    if (atHQ) {

      await resetDroneAtHQ(droneId, clientInfo.id);
    }
  } catch (error) {
    console.error('Drone movement error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to update drone position' });
  }
}

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
  
  console.log(`Attempting to mark order ${data.orderId} as delivered`);
  
  if (!drone.orders.includes(data.orderId)) {
    sendMessage(ws, { type: 'ERROR', message: 'Order not found in drone\'s current deliveries' });
    return;
  }
  
  try {

    const ordersResponse = await apiClient.post('', {
      type: 'GetAllDeliveries'
    });
    
    if (ordersResponse.data.status !== 'success' || !ordersResponse.data.data) {
      console.error('Failed to get orders:', ordersResponse.data);
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get order details' });
      return;
    }
    
    const orders = ordersResponse.data.data;
    const order = orders.find(o => o.order_id === data.orderId);
    
    if (!order) {
      console.error(`Order ${data.orderId} not found in orders list`);

      const destinationInfo = drone.orders.find(o => o.id === data.orderId);
      if (!destinationInfo) {
        sendMessage(ws, { type: 'ERROR', message: 'Order not found' });
        return;
      }
    }
    
    console.log(`Found order: ${JSON.stringify(order)}`);
    
    
    let destinationLatitude, destinationLongitude;
    
    if (order) {
      destinationLatitude = parseFloat(order.destination_latitude);
      destinationLongitude = parseFloat(order.destination_longitude);
    } else {

      for (const orderId of drone.orders) {

        destinationLatitude = drone.latitude;
        destinationLongitude = drone.longitude;
      }
    }
    
    const distanceToDestination = calculateDistance(
      drone.latitude, drone.longitude,
      destinationLatitude, destinationLongitude
    );
    
    console.log(`Distance to destination: ${distanceToDestination} km`);
    
    if (distanceToDestination > 0.0002) {
      sendMessage(ws, {
        type: 'ERROR',
        message: 'Drone is not close enough to the delivery location'
      });
      return;
    }
    
    await apiClient.post('', {
      type: 'UpdateOrder',
      order_id: data.orderId,
      latitude: destinationLatitude,
      longitude: destinationLongitude,
      state: 'Delivered',
      delivery_date: new Date()
    });
    
    drone.orders = drone.orders.filter(id => id !== data.orderId);
    activeDrones.set(droneId, drone);
    
    deliveringOrders.delete(data.orderId);
    
    let customerId = null;
    if (order) {
      customerId = order.customer_id;
    }
    
    if (customerId) {

      for (const [socket, client] of clients.entries()) {
        if (client.id === customerId) {
          sendMessage(socket, {
            type: 'ORDER_DELIVERED',
            orderId: data.orderId,
            message: 'Your order has been delivered!'
          });
        }
      }
    }
    
    sendMessage(ws, {
      type: 'DELIVERY_CONFIRMED',
      orderId: data.orderId,
      remainingOrders: drone.orders,
      message: 'Order marked as delivered'
    });
    
    if (drone.orders.length === 0) {
      sendMessage(ws, {
        type: 'RETURN_TO_HQ',
        message: 'All orders delivered. Please return to HQ.'
      });
    }
  } catch (error) {
    console.error('Mark delivered error:', error);
    console.error('Details:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to mark order as delivered' });
  }
}

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

async function handleGetDrones(ws) {
  try {
    console.log('Getting all drones...');
    const response = await apiClient.post('', {
      type: 'GetAllDrones'
    });
    
    if (response.data.status === 'success') {
      console.log('Drones retrieved:', response.data.data);
      
      if (!response.data.data || response.data.data.length === 0) {
        console.log('No drones found, creating a default drone');
        
        try {

          const createResponse = await apiClient.post('', {
            type: 'CreateDrone',
            current_operator_id: null,
            is_available: 1,
            latitude: 25.7472,
            longitude: 28.2511,
            altitude: 0,
            battery_level: 100
          });
          
          if (createResponse.data.status === 'success') {
            console.log('Default drone created');
            
            const refreshResponse = await apiClient.post('', {
              type: 'GetAllDrones'
            });
            
            if (refreshResponse.data.status === 'success') {
              console.log('Drones list refreshed:', refreshResponse.data.data);
              sendMessage(ws, {
                type: 'DRONES_LIST',
                drones: refreshResponse.data.data
              });
            } else {
              sendMessage(ws, { type: 'ERROR', message: 'Failed to refresh drones list' });
            }
          } else {
            sendMessage(ws, { type: 'ERROR', message: 'Failed to create default drone' });
          }
        } catch (error) {
          console.error('Error creating default drone:', error.response?.data || error.message);
          sendMessage(ws, { type: 'ERROR', message: 'Failed to create default drone' });
        }
      } else {

        sendMessage(ws, {
          type: 'DRONES_LIST',
          drones: response.data.data
        });
      }
    } else {
      sendMessage(ws, { type: 'ERROR', message: 'Failed to get drones' });
    }
  } catch (error) {
    console.error('Get drones error:', error.response?.data || error.message);
    sendMessage(ws, { type: 'ERROR', message: 'Failed to get drones' });
  }
}

async function handleCourierDisconnect(clientInfo) {
  const droneId = clientInfo.operatingDroneId;
  
  if (!droneId) return;
  
  try {
    const drone = activeDrones.get(droneId);
    
    if (drone) {
      console.log(`Courier ${clientInfo.username} disconnected while operating drone ${droneId}`);
      
      const deliveriesResponse = await apiClient.post('', {
        type: 'GetAllDeliveries'
      });
      
      if (deliveriesResponse.data.status === 'success' && deliveriesResponse.data.data) {
        const activeDeliveries = deliveriesResponse.data.data;
        
        for (const orderId of drone.orders) {
          console.log(`Processing disconnected drone order: ${orderId}`);
          
          const order = activeDeliveries.find(o => o.order_id === orderId);
          
          if (order) {
            console.log(`Found order details for order #${orderId}, customer_id: ${order.customer_id}`);
            
            for (const [socket, client] of clients.entries()) {
              if (client.id === order.customer_id) {
                console.log(`Notifying customer ${client.username} about postponed delivery`);
                
                sendMessage(socket, {
                  type: 'DELIVERY_POSTPONED',
                  orderId: orderId,
                  message: 'Your delivery has been postponed due to courier disconnection. The drone has crashed.'
                });
              }
            }
            
            const updateResult = await apiClient.post('', {
              type: 'UpdateOrder',
              order_id: orderId,
              latitude: order.destination_latitude,
              longitude: order.destination_longitude,
              state: 'Storage',
              requested: 1
            });
            
            console.log(`Reset order #${orderId} to Storage state: ${updateResult.data.status}`);
          } else {
            console.warn(`Could not find active delivery for order #${orderId}`);
          }
          
          deliveringOrders.delete(orderId);
        }
      } else {
        console.error('Failed to get active deliveries:', deliveriesResponse.data);
      }
      
      const droneUpdateResult = await apiClient.post('', {
        type: 'UpdateDrone',
        drone_id: droneId,
        current_operator_id: null,
        is_available: 0,
        latitude: drone.latitude,
        longitude: drone.longitude,
        altitude: 0,
        battery_level: 0
      });
      
      console.log(`Updated drone #${droneId} to crashed state: ${droneUpdateResult.data.status}`);
      
      activeDrones.delete(droneId);
      
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

async function handleDroneCrash(droneId, reason) {
  try {
    const drone = activeDrones.get(droneId);
    
    if (!drone) return;
    
    console.log(`Drone ${droneId} crashed: ${reason}`);
    
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: droneId,
      current_operator_id: null,
      is_available: 0,
      latitude: drone.latitude,
      longitude: drone.longitude,
      altitude: 0,
      battery_level: 0
    });
    
    for (const [socket, client] of clients.entries()) {
      if (client.id === drone.courierId) {
        sendMessage(socket, {
          type: 'DRONE_CRASHED',
          droneId: droneId,
          message: `Drone crashed: ${reason}`
        });
        
        client.operatingDroneId = null;
        clients.set(socket, client);
      }
    }
    
    for (const orderId of drone.orders) {

      const ordersResponse = await apiClient.post('', {
        type: 'GetAllOrders',
        customer_id: drone.courierId
      });
      
      if (ordersResponse.data.status === 'success') {
        const orders = ordersResponse.data.data;
        const order = orders.find(o => o.order_id === orderId);
        
        if (order) {

          for (const [socket, client] of clients.entries()) {
            if (client.id === order.customer_id) {
              sendMessage(socket, {
                type: 'DELIVERY_POSTPONED',
                orderId: orderId,
                message: `Your delivery has been postponed due to drone crash: ${reason}`
              });
            }
          }
          
          await apiClient.post('', {
            type: 'UpdateOrder',
            order_id: orderId,
            latitude: order.destination_latitude,
            longitude: order.destination_longitude,
            state: 'Storage'
          });
        }
      }
      
      deliveringOrders.delete(orderId);
    }
    
    activeDrones.delete(droneId);
    
    broadcastToAll({
      type: 'DRONE_CRASHED',
      droneId: droneId,
      message: `Drone has crashed: ${reason}`
    });
  } catch (error) {
    console.error('Handle drone crash error:', error.response?.data || error.message);
  }
}

async function resetDroneAtHQ(droneId, operatorId) {
  try {
    const drone = activeDrones.get(droneId);
    
    if (!drone) return;
    
    if (drone.orders.length > 0) return;
    
    console.log(`Drone ${droneId} has returned to HQ`);
    
    await apiClient.post('', {
      type: 'UpdateDrone',
      drone_id: droneId,
      current_operator_id: null,
      is_available: 1,
      latitude: -25.7472,
      longitude: 28.2511,
      altitude: 0,
      battery_level: 100
    });
    
    for (const [socket, client] of clients.entries()) {
      if (client.id === operatorId) {
        sendMessage(socket, {
          type: 'DRONE_RESET',
          droneId: droneId,
          message: 'Drone has returned to HQ and has been reset'
        });
        
        client.operatingDroneId = null;
        clients.set(socket, client);
      }
    }
    
    activeDrones.delete(droneId);
   broadcastToAll({
      type: 'DRONE_RETURNED',
      droneId: droneId,
      message: 'Drone has returned to HQ'
    });
  } catch (error) {
    console.error('Reset drone at HQ error:', error.response?.data || error.message);
  }
}


function     broadcastDronePosition(droneId) {
  const drone = activeDrones.get(droneId);
  
  if (!drone) return;
  
  broadcastToAll({
    type: 'DRONE_POSITION',
    droneId: droneId,
    latitude: drone.latitude,
    longitude: drone.longitude,
    altitude:    drone.altitude,
    batteryLevel: drone.batteryLevel,
    courierId: drone.courierId,
    courierEmail: drone.courierEmail
  });
}

function calculateDistance(lat1, lon1, lat2,    lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return       distance;
}

function sendMessage(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToAll(message)   {
  for (const [socket, _] of clients.entries()) {
    sendMessage(socket, message);
  }
}

function broadcastToCouriers(message) {
  for (const [socket, client] of     clients.entries()) {
    if (client.userType === 'Courier') {
      sendMessage(socket, message);
    }
  }
}

function      broadcastToCustomers(message) {
  for (const [socket, client] of clients.entries()) {
    if (client.userType === 'Customer') {
      sendMessage(socket, message);
    }
  }
}

function setupServerCommands()    {
  console.log('Server commands:');
  console.log('- CURRENTLY_DELIVERING: Show orders currently being delivered');
  console.log('- KILL <username>: Disconnect a specific user');
  console.log('- DRONE_STATUS: Show status of all active drones');
  console.log('- QUIT: Shutdown the server');
  
  rl.on('line', async (input) => {
    const args = input.trim().split(' ');
    const command = args[0].toUpperCase();
    
    switch   (command) {
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
      case     'QUIT':
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

async        function handleCurrentlyDeliveringCommand() {

  console.log('Currently delivering:');
  
  try {
  
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

function      handleKillCommand(username) {
  let found = false;
  
  for (const [socket, client] of clients.entries()) {
    if (client.username === username) {
      console.log(`Disconnecting user: ${username}`);
      
      sendMessage(socket, {
        type: 'FORCE_DISCONNECT',
        message: 'You have been disconnected by the server admin'
      });
      
      socket.close();
      
      found = true;
      break;
    }
  }
  
  if (!found)   {
    console.log(`User not found: ${username}`);
  }
}

async function    handleDroneStatusCommand() {


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

function  handleQuitCommand() {
  console.log('Shutting down server...');
  
  broadcastToAll({
    type: 'SERVER_SHUTDOWN',
    message: 'Server is shutting down'
  });
  
  for (const [socket, _] of clients.entries()) {
    socket.close();
  }
  
  server.close(() => {
    console.log('Server has been shut down');
    process.exit(0);
  });
}

askForPort();