
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
// import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket!: Socket;
  private connected = new BehaviorSubject<boolean>(false);
  private user = new BehaviorSubject<any>(null);
  private drones = new BehaviorSubject<any[]>([]);
  private orders = new BehaviorSubject<any[]>([]);
  private dustDevils = new BehaviorSubject<any[]>([]);
  private systemMessages = new BehaviorSubject<any[]>([]);
  private errors = new BehaviorSubject<string>('');

  constructor() {
    // Initialize with no connection
  }

  // Connect to socket server
  connect(serverUrl: string): void {
    try {
      this.socket = io(serverUrl);
      
      // Set up socket event listeners
      this.setupSocketListeners();
      
      this.connected.next(true);
    } catch (err) {
      console.error('Socket connection error:', err);
      this.errors.next('Failed to connect to server. Please try again.');
      this.connected.next(false);
    }
  }

  // Setup all socket event listeners
  private setupSocketListeners(): void {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.connected.next(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.connected.next(false);
      this.systemMessages.next([...this.systemMessages.value, { 
        message: 'Disconnected from server', 
        timestamp: new Date() 
      }]);
    });

    this.socket.on('forced_disconnect', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date() 
      }]);
    });

    this.socket.on('server_shutdown', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date() 
      }]);
    });

    // Authentication events
    this.socket.on('login_success', (data) => {
      this.user.next(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    });

    this.socket.on('login_error', (data) => {
      this.errors.next(data.message);
    });

    // Data update events
    this.socket.on('drones_update', (data) => {
      this.drones.next(data);
    });

    this.socket.on('drone_position_update', (data) => {
      const updatedDrones = this.drones.value.map(drone => {
        if (drone.id === data.drone_id) {
          return { ...drone, ...data };
        }
        return drone;
      });
      this.drones.next(updatedDrones);
    });

    this.socket.on('drone_update', (data) => {
      const updatedDrones = this.drones.value.map(drone => {
        if (drone.id === data.id) {
          return data;
        }
        return drone;
      });
      this.drones.next(updatedDrones);
    });

    this.socket.on('orders_update', (data) => {
      this.orders.next(data);
    });

    this.socket.on('order_update', (data) => {
      const updatedOrders = this.orders.value.map(order => {
        if (order.order_id === data.order_id) {
          return { ...order, ...data };
        }
        return order;
      });
      this.orders.next(updatedOrders);
    });

    this.socket.on('dust_devils_update', (data) => {
      this.dustDevils.next(data);
    });

    // Notification events
    this.socket.on('error', (data) => {
      this.errors.next(data.message);
    });

    this.socket.on('system_message', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date() 
      }]);
    });

    this.socket.on('at_delivery_location', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: `You've reached the delivery location for order ${data.order_id}`, 
        timestamp: new Date(),
        type: 'delivery_location',
        order_id: data.order_id
      }]);
    });

    this.socket.on('dust_devil_encounter', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date(),
        type: 'dust_devil'
      }]);
    });

    this.socket.on('drone_crashed', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date(),
        type: 'drone_crash'
      }]);
    });

    this.socket.on('order_out_for_delivery', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: `Your order (${data.tracking_num}) is now out for delivery!`, 
        timestamp: new Date(),
        type: 'order_update',
        order_id: data.order_id
      }]);
    });

    this.socket.on('order_delivered', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: `Your order (${data.tracking_num}) has been delivered!`, 
        timestamp: new Date(),
        type: 'order_update',
        order_id: data.order_id
      }]);
    });

    this.socket.on('delivery_postponed', (data) => {
      this.systemMessages.next([...this.systemMessages.value, { 
        message: data.message, 
        timestamp: new Date(),
        type: 'order_update',
        order_id: data.order_id
      }]);
    });
  }

  // Send login request
  login(username: string, password: string): void {
    this.socket.emit('login', { username, password });
  }

  // Send move drone command
  moveDrone(droneId: number, direction: string): void {
    this.socket.emit('move_drone', { drone_id: droneId, direction });
  }

  // Load order onto drone
  loadOrder(orderId: number, droneId: number): void {
    this.socket.emit('load_order', { order_id: orderId, drone_id: droneId });
  }

  // Confirm order delivery
  deliverOrder(orderId: number): void {
    this.socket.emit('deliver_order', { order_id: orderId });
  }

  // Return drone to HQ
  returnToHQ(droneId: number): void {
    this.socket.emit('return_to_hq', { drone_id: droneId });
  }

  // Request current orders being delivered
  getCurrentlyDelivering(): void {
    this.socket.emit('currently_delivering');
  }

  // Request drone status
  getDroneStatus(droneId: number): void {
    this.socket.emit('drone_status', { drone_id: droneId });
  }

  // Customer order request
  requestDelivery(products: any[], latitude: number, longitude: number): void {
    const token = localStorage.getItem('token') || '';
    this.socket.emit('request_delivery', { 
      products, 
      latitude, 
      longitude,
      token
    });
  }

  // Disconnect socket
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.connected.next(false);
      this.user.next(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  }

  // Observable getters
  isConnected(): Observable<boolean> {
    return this.connected.asObservable();
  }

  getUser(): Observable<any> {
    return this.user.asObservable();
  }

  getDrones(): Observable<any[]> {
    return this.drones.asObservable();
  }

  getOrders(): Observable<any[]> {
    return this.orders.asObservable();
  }

  getDustDevils(): Observable<any[]> {
    return this.dustDevils.asObservable();
  }

  getSystemMessages(): Observable<any[]> {
    return this.systemMessages.asObservable();
  }

  getErrors(): Observable<string> {
    return this.errors.asObservable();
  }

  // Clear error message
  clearError(): void {
    this.errors.next('');
  }
}