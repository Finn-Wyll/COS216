// src/app/components/courier-dashboard/courier-dashboard.component.ts

import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
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
    private orderService: OrderService
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

    // Listen for WebSocket messages
    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        switch (message.type) {
          case 'ORDERS_LIST':
            if (message.orders && Array.isArray(message.orders)) {
              this.orders = message.orders;
            }
            break;
          
          case 'DRONES_LIST':
            if (message.drones && Array.isArray(message.drones)) {
              this.drones = message.drones;
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
            this.dustDevils = message.dustDevils || [];
            break;
          
          case 'DRONE_MOVED':
            this.addNotification(`Drone moved to [${message.latitude.toFixed(4)}, ${message.longitude.toFixed(4)}], Altitude: ${message.altitude}m, Battery: ${message.batteryLevel.toFixed(1)}%`);
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
            break;
        }
      });

    // Get initial data
    this.loadOrders();
    this.loadDrones();
  }

  loadOrders(): void {
    this.webSocketService.send({
      type: 'GET_ORDERS'
    });
  }

  loadDrones(): void {
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

    this.webSocketService.send({
      type: 'SELECT_ORDERS',
      droneId: this.selectedDrone.id,
      orderIds: this.selectedOrders
    });
    
    // Update customer markers for selected orders
    this.customerMarkers = this.orders
      .filter(order => this.selectedOrders.includes(order.order_id))
      .map(order => ({
        id: order.order_id,
        latitude: order.destination_latitude,
        longitude: order.destination_longitude
      }));
  }

  moveDrone(direction: string): void {
    if (!this.isOperatingDrone) {
      this.addNotification('You are not currently operating a drone');
      return;
    }

    this.webSocketService.send({
      type: 'MOVE_DRONE',
      direction: direction,
      dustDevils: this.dustDevils
    });
  }

  markAsDelivered(orderId: number): void {
    if (!this.isOperatingDrone) {
      this.addNotification('You are not currently operating a drone');
      return;
    }

    this.webSocketService.send({
      type: 'MARK_DELIVERED',
      orderId: orderId
    });
    
    // Remove delivered order from customer markers
    this.customerMarkers = this.customerMarkers.filter(marker => marker.id !== orderId);
  }

  private addNotification(message: string): void {
    this.notifications.unshift(message);
    // Keep only the last 20 notifications
    if (this.notifications.length > 20) {
      this.notifications.pop();
    }
  }

  selectDrone(drone: Drone): void {
    if (drone.is_available) {
      this.selectedDrone = drone;
    } else {
      this.addNotification(`Drone #${drone.id} is not available`);
    }
  }

  logout(): void {
    this.authService.logout();
    this.webSocketService.disconnect();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}