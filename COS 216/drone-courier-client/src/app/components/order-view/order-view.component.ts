import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { DustDevilService } from '../../services/dust-devil.service';
import { Order } from '../../models/order.model';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-order-view',
  standalone: true,
  imports: [CommonModule, RouterModule, MapComponent],
  templateUrl: './order-view.component.html',
  styleUrls: ['./order-view.component.css']
})

export class OrderViewComponent implements OnInit, OnDestroy 
{
  orders: Order[] = [];
  loading: boolean = true;
  error: string = '';
  userName: string = '';
  userType: string = '';
  dronePosition: { latitude: number, longitude: number, altitude: number } | null = null;
  dustDevils: Array<{latitude: number, longitude: number}> = [];
  customerMarkers: Array<{id: number, latitude: number, longitude: number}> = [];
  
  private destroy$ = new Subject<void>();

  constructor(
    private webSocketService: WebSocketService,
    private authService: AuthService,
    private orderService: OrderService,
    private dustDevilService: DustDevilService
  ) {}

  ngOnInit(): void 
  {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        if (user) 
        {
          this.userName = user.username;
          this.userType = user.type;
        }
      });

    this.orderService.orders$
      .pipe(takeUntil(this.destroy$))
      .subscribe(orders => 
      {
        this.orders = orders;
        this.loading = false;
        
        this.customerMarkers = orders.map(order => ({
          id: order.order_id,
          latitude: order.destination_latitude, 
          longitude: order.destination_longitude
        }));
      });

    this.dustDevilService.dustDevils$
      .pipe(takeUntil(this.destroy$))
      .subscribe(dustDevils => {
        this.dustDevils = dustDevils;
      });

    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.type === 'ERROR') 
          {
          this.error = message.message;
        } 
        else if (message.type === 'ORDER_UPDATE') 
        {
          this.orderService.getOrders();
        }
        
        if (message.type === 'DRONE_POSITION') {
          this.dronePosition = {
            latitude: message.latitude,
            longitude: message.longitude,
            altitude: message.altitude
          };
        }
      });

    this.loading = true;
    this.orderService.getOrders();
  }

  requestDelivery(order: Order): void 
  {
    if (order.state !== 'Storage') 
    {
      this.error = 'This order is already out for delivery or delivered';
      return;
    }

    this.webSocketService.send({
      type: 'REQUEST_DELIVERY',
      orderId: order.order_id,
      latitude: order.destination_latitude,
      longitude: order.destination_longitude
    });
  }

  getOrderStatusClass(status: string): string 
  {
    switch (status) 
    {
      case 'Storage':
        return 'status-storage';
      case 'OutForDelivery':
      case 'Out_for_delivery':
        return 'status-out-for-delivery';
      case 'Delivered':
        return 'status-delivered';
      default:
        return '';
    }
  }

  getOrderStatusText(status: string): string 
  {
    switch (status) 
    {
      case 'Storage':
        return 'In Storage';
      case 'OutForDelivery':
      case 'Out_for_delivery':
        return 'Out For Delivery';
      case 'Delivered':
        return 'Delivered';
      default:
        return status;
    }
  }

  isDeliveryRequested(order: Order): boolean 
  {
    return order.requested === 1;
  }

  logout(): void 
  {
    this.authService.logout();
    this.webSocketService.disconnect();
  }

  refreshOrders(): void 
  {
    this.loading = true;
    this.orderService.getOrders();
  }

  ngOnDestroy(): void 
  {
    this.destroy$.next();
    this.destroy$.complete();
  }
}