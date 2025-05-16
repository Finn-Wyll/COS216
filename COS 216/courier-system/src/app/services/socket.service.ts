import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private serverUrl = 'http://localhost:3000';
  
  // Authentication state
  private isLoggedInSubject = new BehaviorSubject<boolean>(false);
  private userTypeSubject = new BehaviorSubject<string>('');
  private apiKeySubject = new BehaviorSubject<string>('');
  
  // Application data
  private ordersSubject = new BehaviorSubject<any[]>([]);
  private dronesSubject = new BehaviorSubject<any[]>([]);
  private notificationsSubject = new BehaviorSubject<string[]>([]);
  private dustDevilsSubject = new BehaviorSubject<any[]>([]);
  
  // Instead of using Observables directly, provide getters for the values
  get isLoggedIn$() { return this.isLoggedInSubject.asObservable(); }
  get userType$() { return this.userTypeSubject.asObservable(); }
  get apiKey$() { return this.apiKeySubject.asObservable(); }
  get orders$() { return this.ordersSubject.asObservable(); }
  get drones$() { return this.dronesSubject.asObservable(); }
  get notifications$() { return this.notificationsSubject.asObservable(); }
  get dustDevils$() { return this.dustDevilsSubject.asObservable(); }

  // Add direct value getters for synchronous access
  get currentUserType() { return this.userTypeSubject.value; }
  get currentApiKey() { return this.apiKeySubject.value; }
  get currentOrders() { return this.ordersSubject.value; }
  get currentDrones() { return this.dronesSubject.value; }
  get currentDustDevils() { return this.dustDevilsSubject.value; }

  constructor(private router: Router) {
    // Create random dust devils every minute
    setInterval(() => this.generateDustDevils(), 60000);
    this.generateDustDevils(); // Initial dust devils
  }

  public connect(port?: number): void {
    // Close existing connection
    this.disconnect();
    
    // Connect to server
    const serverUrl = `http://localhost:${port || 3000}`;
    this.socket = io(serverUrl);
    
    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket?.id);
      this.addNotification('Connected to server');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.addNotification('Disconnected from server');
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.addNotification('Connection error: ' + error.message);
    });
    
    // Handle server messages
    this.socket.on('login_response', (data) => {
      if (data.status === 'success') {
        this.isLoggedInSubject.next(true);
        this.userTypeSubject.next(data.data.user_type);
        this.apiKeySubject.next(data.data.apikey);
        
        // Redirect based on user type
        if (data.data.user_type === 'customer') {
          this.router.navigate(['/customer']);
        } else if (data.data.user_type === 'courier') {
          this.router.navigate(['/courier']);
        }
      } else {
        this.addNotification(`Login failed: ${data.message}`);
      }
    });
    
    this.socket.on('drone_status', (data) => {
      this.dronesSubject.next(data.drones);
    });
    
    this.socket.on('current_deliveries', (data) => {
      this.ordersSubject.next(data.deliveries);
    });
    
    this.socket.on('command_response', (data) => {
      console.log('Command response:', data);
      
      if (data.status === 'error') {
        this.addNotification(`Command error: ${data.message}`);
      }
    });
    
    this.socket.on('notification', (data) => {
      this.addNotification(data.message);
    });
    
    this.socket.on('server_shutdown', (data) => {
      this.addNotification(data.message);
      this.disconnect();
      this.router.navigate(['/login']);
    });
    
    this.socket.on('delivery_possible', (data) => {
      this.addNotification(`You can now deliver order ${data.order_id}. Click the 'Deliver' button.`);
    });
    
    this.socket.on('error', (data) => {
      this.addNotification(`Error: ${data.message}`);
    });
  }
  
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  public login(email: string, password: string): void {
    if (this.socket) {
      this.socket.emit('login', { email, password });
    } else {
      this.addNotification('Not connected to server');
      this.connect();
    }
  }
  
  public sendCommand(command: string, params: any = {}): void {
    if (this.socket) {
      this.socket.emit('command', { command, ...params });
    } else {
      this.addNotification('Not connected to server');
      this.connect();
    }
  }
  
  public moveDrone(droneId: string, direction: string, inDustDevil: boolean = false): void {
    if (this.socket) {
      this.socket.emit('move_drone', { 
        drone_id: droneId, 
        direction, 
        in_dust_devil: inDustDevil 
      });
    } else {
      this.addNotification('Not connected to server');
      this.connect();
    }
  }
  
  public deliverOrder(orderId: string): void {
    if (this.socket) {
      this.socket.emit('deliver_order', { order_id: orderId });
    } else {
      this.addNotification('Not connected to server');
      this.connect();
    }
  }
  
  public loadOrder(orderId: string, droneId: string): void {
    if (this.socket) {
      this.socket.emit('load_order', { order_id: orderId, drone_id: droneId });
    } else {
      this.addNotification('Not connected to server');
      this.connect();
    }
  }
  
  public logout(): void {
    this.isLoggedInSubject.next(false);
    this.userTypeSubject.next('');
    this.apiKeySubject.next('');
    this.disconnect();
    this.router.navigate(['/login']);
  }
  
  private addNotification(message: string): void {
    const notifications = this.notificationsSubject.value;
    notifications.unshift(message); // Add at the beginning
    
    // Keep only the last 5 notifications
    this.notificationsSubject.next(notifications.slice(0, 5));
  }
  
  private generateDustDevils(): void {
    // HQ coordinates
    const HQ_LAT = 25.7472;
    const HQ_LNG = 28.2511;
    
    const count = Math.floor(Math.random() * 6) + 5; // 5-10 dust devils
    const dustDevils = [];
    
    for (let i = 0; i < count; i++) {
      // Random coordinates within 5km radius
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * 5; // 0-5km
      
      // Convert from polar to Cartesian coordinates
      // 1 degree of latitude/longitude is approximately 111km
      const latOffset = (radius * Math.sin(angle)) / 111;
      const lngOffset = (radius * Math.cos(angle)) / (111 * Math.cos(HQ_LAT * Math.PI / 180));
      
      const lat = HQ_LAT + latOffset;
      const lng = HQ_LNG + lngOffset;
      
      dustDevils.push({
        id: `dust-${Date.now()}-${i}`,
        lat,
        lng,
        radius: 10 // meters
      });
    }
    
    this.dustDevilsSubject.next(dustDevils);
  }
}