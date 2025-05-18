import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { DustDevilService } from '../../services/dust-devil.service';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { Order } from '../../models/order.model';
import { Drone } from '../../models/drone.model';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-courier-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MapComponent],
  templateUrl: './courier-dashboard.component.html',
  styleUrls: ['./courier-dashboard.component.css']
})
export class CourierDashboardComponent implements OnInit, OnDestroy {
  userName: string = '';
  userType: string = '';
  notifications: string[] = [];
  orders: Order[] = [];
  drones: Drone[] = [];
  selectedDrone: Drone | null = null;
  selectedOrders: number[] = [];
  
  // Debug flags
  isDebugMode: boolean = true; // Set to true to enable debugging
  
  // Drone status
  dronePosition: { latitude: number, longitude: number, altitude: number } | null = null;
  batteryLevel: number = 100;
  dustDevils: Array<{latitude: number, longitude: number}> = [];
  customerMarkers: Array<{id: number, latitude: number, longitude: number}> = [];
  isOperatingDrone: boolean = false;
  
  private destroy$ = new Subject<void>();

  constructor(
    private webSocketService: WebSocketService,
    private authService: AuthService,
    private orderService: OrderService,
    private dustDevilService: DustDevilService // Inject DustDevilService
  ) {}

  // Handle keyboard controls for drone movement
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.isOperatingDrone) return;
    
    let direction = '';
    
    switch (event.key) {
      case 'ArrowUp':
        direction = 'UP';
        break;
      case 'ArrowDown':
        direction = 'DOWN';
        break;
      case 'ArrowLeft':
        direction = 'LEFT';
        break;
      case 'ArrowRight':
        direction = 'RIGHT';
        break;
      default:
        return;
    }
    
    this.moveDrone(direction);
  }

  ngOnInit(): void {
    // Get current user info
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user) {
          this.userName = user.username;
          this.userType = user.type;
        }
      });

    // Subscribe to dust devil updates from the service
    this.dustDevilService.dustDevils$
      .pipe(takeUntil(this.destroy$))
      .subscribe(devils => {
        this.dustDevils = devils;
        if (this.isDebugMode) {
          console.log('Dust devils updated:', this.dustDevils);
        }
      });

    // Listen for WebSocket messages
    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (this.isDebugMode) {
          console.log('Received message:', message);
        }
        
        switch (message.type) {
          case 'ORDERS_LIST':
            if (message.orders && Array.isArray(message.orders)) {
              // Filter to only show requested orders
              this.orders = message.orders.filter((order: Order) => order.requested === 1 && order.state === 'Storage');
              if (this.isDebugMode) {
                console.log('Filtered orders:', this.orders);
              }
              
              // Important: Request drones after getting orders to ensure both are loaded
              this.loadDrones();
            }
            break;
          
          case 'DRONES_LIST':
            if (message.drones && Array.isArray(message.drones)) {
              this.drones = message.drones;
              // Add logging to debug
              if (this.isDebugMode) {
                console.log('Drones received:', this.drones);
                // Check availability status of each drone
                this.drones.forEach(drone => {
                  console.log(`Drone #${drone.id}: is_available=${drone.is_available} (${typeof drone.is_available})`);
                  console.log(`Drone #${drone.id} is available:`, this.isDroneAvailable(drone));
                });
              }
            }
            break;
          
          case 'DRONE_POSITION':
            this.dronePosition = {
              latitude: message.latitude,
              longitude: message.longitude,
              altitude: message.altitude
            };
            this.batteryLevel = message.batteryLevel;
            break;
          
          case 'DUST_DEVILS':
            if (message.dustDevils && Array.isArray(message.dustDevils)) {
              this.dustDevils = message.dustDevils || [];
              if (this.isDebugMode) {
                console.log('Dust devils updated from server:', this.dustDevils);
              }
            }
            break;
          
          case 'DRONE_MOVED':
            this.addNotification(`Drone moved to [${message.latitude}, ${message.longitude}], Altitude: ${message.altitude}m, Battery: ${message.batteryLevel}%`);
            break;
          
          case 'DUST_DEVIL_WARNING':
            this.addNotification(`⚠️ ${message.message}`);
            break;
          
          case 'RANGE_WARNING':
            this.addNotification(`⚠️ ${message.message}`);
            break;
          
          case 'ORDERS_SELECTED':
            this.isOperatingDrone = true;
            this.addNotification(`You are now operating drone #${message.droneId} with ${message.orderIds.length} orders`);
            break;
          
          case 'DELIVERY_CONFIRMED':
            this.addNotification(`Order #${message.orderId} delivered successfully! ${message.remainingOrders.length} orders left.`);
            // Only remove the marker on successful delivery confirmation
            this.customerMarkers = this.customerMarkers.filter(marker => marker.id !== message.orderId);
            break;
          
          case 'RETURN_TO_HQ':
            this.addNotification(`${message.message}`);
            break;
          
          case 'DRONE_RESET':
            this.isOperatingDrone = false;
            this.selectedDrone = null;
            this.selectedOrders = [];
            this.addNotification(`${message.message}`);
            break;
          
          case 'DRONE_CRASHED':
            this.isOperatingDrone = false;
            this.selectedDrone = null;
            this.selectedOrders = [];
            this.addNotification(`⛔ ${message.message}`);
            break;
            
          case 'ERROR':
            this.addNotification(`Error: ${message.message}`);
            // Don't remove markers on error messages
            break;
        }
      });

    // Get initial data
    this.loadOrders();
  }

  loadOrders(): void {
    if (this.isDebugMode) {
      console.log('Loading orders...');
    }
    this.webSocketService.send({
      type: 'GET_ORDERS'
    });
  }

  loadDrones(): void {
    if (this.isDebugMode) {
      console.log('Loading drones...');
    }
    this.webSocketService.send({
      type: 'GET_DRONES'
    });
  }

  toggleOrderSelection(orderId: number): void {
    const index = this.selectedOrders.indexOf(orderId);
    if (index === -1) {
      // Check if we already have 7 orders selected
      if (this.selectedOrders.length >= 7) {
        this.addNotification('Maximum 7 orders can be selected for delivery');
        return;
      }
      this.selectedOrders.push(orderId);
    } else {
      this.selectedOrders.splice(index, 1);
    }
  }

  startDelivery(): void {
    if (!this.selectedDrone) {
      this.addNotification('Please select a drone first');
      return;
    }

    if (this.selectedOrders.length === 0) {
      this.addNotification('Please select at least one order for delivery');
      return;
    }

    // Log the orders being selected for delivery
    console.log('Starting delivery with orders:', this.selectedOrders);
    console.log('Selected drone:', this.selectedDrone);

    // Send the SELECT_ORDERS message
    const message = {
      type: 'SELECT_ORDERS',
      droneId: this.selectedDrone.id,
      orderIds: this.selectedOrders
    };
    
    if (this.isDebugMode) {
      console.log('Sending SELECT_ORDERS message:', message);
    }

    this.webSocketService.send(message);
    
    // Update customer markers for selected orders
    this.customerMarkers = this.orders
      .filter(order => this.selectedOrders.includes(order.order_id))
      .map(order => ({
        id: order.order_id,
        latitude: Number(order.destination_latitude),
        longitude: Number(order.destination_longitude)
      }));
      
    console.log('Updated customer markers:', this.customerMarkers);
  }

  moveDrone(direction: string): void {
    if (!this.isOperatingDrone) {
      this.addNotification('You are not currently operating a drone');
      return;
    }

    // Get current dust devils from service
    const currentDustDevils = this.dustDevilService.getCurrentDustDevils();

    this.webSocketService.send({
      type: 'MOVE_DRONE',
      direction: direction,
      dustDevils: currentDustDevils
    });
  }

  markAsDelivered(orderId: number): void {
    if (!this.isOperatingDrone) {
      this.addNotification('You are not currently operating a drone');
      return;
    }

    // Find the customer marker for this order
    const orderMarker = this.customerMarkers.find(marker => marker.id === orderId);
    if (!orderMarker) {
      this.addNotification(`Error: Cannot find marker for order #${orderId}`);
      return;
    }

    // Check if drone is close enough to the delivery location
    if (this.dronePosition) {
      const distance = this.calculateDistance(
        this.dronePosition.latitude, this.dronePosition.longitude,
        orderMarker.latitude, orderMarker.longitude
      );
      
      console.log(`Distance to delivery location: ${distance} km`);
      
      // Allow delivery if within 20 meters (0.02 km)
      if (distance > 0.02) {
        this.addNotification('Move closer to the delivery location');
        return;
      }
    }

    console.log(`Sending MARK_DELIVERED for order ${orderId}`);
    
    // Send request to mark as delivered
    this.webSocketService.send({
      type: 'MARK_DELIVERED',
      orderId: orderId
    });
    
    // Don't remove the marker here anymore - wait for DELIVERY_CONFIRMED
  }

  // Helper function to calculate distance between two points
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

  private addNotification(message: string): void {
    this.notifications.unshift(message);
    // Keep only the last 20 notifications
    if (this.notifications.length > 20) {
      this.notifications.pop();
    }
  }

  // Helper method to determine if a drone is available
  isDroneAvailable(drone: Drone): boolean {
    // Handle different data types (number, string, boolean)
    if (typeof drone.is_available === 'boolean') {
      return drone.is_available;
    } else if (typeof drone.is_available === 'string') {
      return drone.is_available === '1' || drone.is_available === 'true';
    } else {
      return drone.is_available === 1;
    }
  }

  selectDrone(drone: Drone): void {
    if (this.isDroneAvailable(drone)) {
      this.selectedDrone = drone;
      this.addNotification(`Selected drone #${drone.id}`);
    } else {
      this.addNotification(`Drone #${drone.id} is not available`);
    }
  }

  logout(): void {
    this.authService.logout();
    this.webSocketService.disconnect();
  }

  // For debugging - force refresh data
  forceRefresh(): void {
    this.loadOrders();
    this.loadDrones();
    this.addNotification('Force refreshed data');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

}