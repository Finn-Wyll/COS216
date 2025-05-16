/**
 * COS 216 Homework Assignment
 * WebSocket Test Client
 * 
 * [Your Name]
 * [Your Student Number]
 */

// Simple WebSocket client to test the server
const WebSocket = require('ws');
const readline = require('readline');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let ws = null;
let currentUser = null;

// Function to connect to the server
function connect(port) {
  ws = new WebSocket(`ws://localhost:${port}`);
  
  ws.on('open', () => {
    console.log('Connected to server');
    askForLoginDetails();
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received message:', message);
      
      if (message.type === 'LOGIN_SUCCESS') {
        currentUser = {
          userId: message.userId,
          userType: message.userType
        };
        
        console.log(`Logged in as ${currentUser.userType}`);
        showOptions();
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Disconnected from server');
    process.exit(0);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    process.exit(1);
  });
}

// Function to ask for login details
function askForLoginDetails() {
  rl.question('Email: ', (email) => {
    rl.question('Password: ', (password) => {
      rl.question('User Type (Customer/Courier): ', (userType) => {
        // Send login request
        ws.send(JSON.stringify({
          type: 'Login',
          email: email,
          password: password,
          userType: userType
        }));
      });
    });
  });
}

// Function to show options based on user type
function showOptions() {
  if (!currentUser) {
    console.log('You need to login first');
    return;
  }
  
  if (currentUser.userType === 'Customer') {
    console.log('\nCustomer Options:');
    console.log('1. View Orders');
    console.log('2. Request Delivery');
    console.log('3. Quit');
    
    rl.question('Select an option: ', (option) => {
      switch (option) {
        case '1':
          ws.send(JSON.stringify({
            type: 'GET_ORDERS'
          }));
          setTimeout(showOptions, 1000);
          break;
        case '2':
          rl.question('Order ID: ', (orderId) => {
            rl.question('Latitude: ', (latitude) => {
              rl.question('Longitude: ', (longitude) => {
                ws.send(JSON.stringify({
                  type: 'REQUEST_DELIVERY',
                  orderId: orderId,
                  latitude: parseFloat(latitude),
                  longitude: parseFloat(longitude)
                }));
                setTimeout(showOptions, 1000);
              });
            });
          });
          break;
        case '3':
          ws.close();
          break;
        default:
          console.log('Invalid option');
          showOptions();
      }
    });
  } else if (currentUser.userType === 'Courier') {
    console.log('\nCourier Options:');
    console.log('1. View Available Orders');
    console.log('2. View Available Drones');
    console.log('3. Select Orders for Delivery');
    console.log('4. Move Drone');
    console.log('5. Mark Order as Delivered');
    console.log('6. Quit');
    
    rl.question('Select an option: ', (option) => {
      switch (option) {
        case '1':
          ws.send(JSON.stringify({
            type: 'GET_ORDERS'
          }));
          setTimeout(showOptions, 1000);
          break;
        case '2':
          ws.send(JSON.stringify({
            type: 'GET_DRONES'
          }));
          setTimeout(showOptions, 1000);
          break;
        case '3':
          rl.question('Drone ID: ', (droneId) => {
            rl.question('Order IDs (comma-separated): ', (orderIds) => {
              ws.send(JSON.stringify({
                type: 'SELECT_ORDERS',
                droneId: parseInt(droneId),
                orderIds: orderIds.split(',').map(id => parseInt(id.trim()))
              }));
              setTimeout(showOptions, 1000);
            });
          });
          break;
        case '4':
          rl.question('Direction (UP/DOWN/LEFT/RIGHT): ', (direction) => {
            ws.send(JSON.stringify({
              type: 'MOVE_DRONE',
              direction: direction.toUpperCase(),
              dustDevils: [] // Simulated dust devils would be here
            }));
            setTimeout(showOptions, 1000);
          });
          break;
        case '5':
          rl.question('Order ID: ', (orderId) => {
            ws.send(JSON.stringify({
              type: 'MARK_DELIVERED',
              orderId: parseInt(orderId)
            }));
            setTimeout(showOptions, 1000);
          });
          break;
        case '6':
          ws.close();
          break;
        default:
          console.log('Invalid option');
          showOptions();
      }
    });
  }
}

// Start the client
rl.question('Enter server port: ', (port) => {
  connect(parseInt(port));
});
