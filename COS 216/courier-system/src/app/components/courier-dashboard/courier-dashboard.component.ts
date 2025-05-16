import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-courier-dashboard',
  templateUrl: './courier-dashboard.component.html',
  styleUrls: ['./courier-dashboard.component.css']
})
export class CourierDashboardComponent implements OnInit, OnDestroy {
  selectedDrone: any = null;
  availableOrders: any[] = [];
  currentDeliveries: any[] = [];
  canDeliver: boolean = false;
  private subscription: Subscription = new Subscription();

  constructor(
    private socketService: SocketService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Check if logged in
    this.subscription.add(
      this.socketService.isLoggedIn$.subscribe(isLoggedIn => {
        if (!isLoggedIn) {
          this.router.navigate(['/login']);
        }
      })
    );
    
    // Get user type
    this.subscription.add(
      this.socketService.userType$.subscribe(userType => {
        if (userType && userType !== 'courier') {
          this.router.navigate(['/customer']);
        }
      })
    );
    
    // Get drones
    this.subscription.add(
      this.socketService.drones$.subscribe(drones => {
        // Get first drone operated by current user or first available drone
        if (drones.length > 0) {
          const username = this.socketService.currentApiKey;
          
          const operatedDrone = drones.find(d => d.current_operator_id === username);
          if (operatedDrone) {
            this.selectedDrone = operatedDrone;
          } else if (!this.selectedDrone) {
            const availableDrone = drones.find(d => d.is_available);
            if (availableDrone) {
              this.selectedDrone = availableDrone;
            }
          }
        } else {
          this.selectedDrone = null;
        }
      })
    );
    
    // Get orders
    this.subscription.add(
      this.socketService.orders$.subscribe(orders => {
        this.availableOrders = orders.filter(o => o.state === 'Storage');
        this.currentDeliveries = orders.filter(o => o.state === 'Out_for_delivery');
        
        // Check if we can deliver an order (drone at destination)
        this.canDeliver = this.checkCanDeliver();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  logout(): void {
    this.socketService.logout();
  }

  moveDrone(direction: string): void {
    if (this.selectedDrone) {
      this.socketService.moveDrone(this.selectedDrone.id, direction);
    }
  }

  selectOrder(order: any): void {
    if (this.selectedDrone) {
      this.socketService.loadOrder(order.order_id, this.selectedDrone.id);
    } else {
      alert('No drone available for delivery');
    }
  }

  deliverOrder(): void {
    if (!this.canDeliver) return;
    
    // Find the order that can be delivered
    const deliverableDroneId = this.selectedDrone.id;
    const deliverableOrder = this.currentDeliveries.find(o => {
      const droneLat = parseFloat(this.selectedDrone.latest_latitude);
      const droneLng = parseFloat(this.selectedDrone.latest_longitude);
      const orderLat = parseFloat(o.destination_latitude);
      const orderLng = parseFloat(o.destination_longitude);
      
      const distance = this.calculateDistance(droneLat, droneLng, orderLat, orderLng);
      // Continue src/app/components/courier-dashboard/courier-dashboard.component.ts
      
      return distance < 0.0001; // Very close
    });
    
    if (deliverableOrder) {
      this.socketService.deliverOrder(deliverableOrder.order_id);
    }
  }

  private checkCanDeliver(): boolean {
    if (!this.selectedDrone || this.currentDeliveries.length === 0) {
      return false;
    }
    
    // Check if drone is at any delivery location
    const droneLat = parseFloat(this.selectedDrone.latest_latitude);
    const droneLng = parseFloat(this.selectedDrone.latest_longitude);
    
    return this.currentDeliveries.some(order => {
      const orderLat = parseFloat(order.destination_latitude);
      const orderLng = parseFloat(order.destination_longitude);
      
      const distance = this.calculateDistance(droneLat, droneLng, orderLat, orderLng);
      return distance < 0.0001; // Very close
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }
}