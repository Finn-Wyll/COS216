// src/app/components/order-view/order-view.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { Order } from '../../models/order.model';

@Component({
  selector: 'app-order-view',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './order-view.component.html',
  styleUrls: ['./order-view.component.css']
})
export class OrderViewComponent implements OnInit, OnDestroy {
  orders: Order[] = [];
  loading: boolean = true;
  error: string = '';
  userName: string = '';
  userType: string = '';
  private destroy$ = new Subject<void>();

  constructor(
    private webSocketService: WebSocketService,
    private authService: AuthService,
    private orderService: OrderService
  ) {}

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

    // Subscribe to orders
    this.orderService.orders$
      .pipe(takeUntil(this.destroy$))
      .subscribe(orders => {
        this.orders = orders;
        this.loading = false;
      });

    // Listen for WebSocket messages
    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.type === 'ERROR') {
          this.error = message.message;
        }
      });

    // Get orders
    this.loading = true;
    this.orderService.getOrders();
  }

  requestDelivery(order: Order): void {
    if (order.state !== 'Storage') {
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

  getOrderStatusClass(status: string): string {
    switch (status) {
      case 'Storage':
        return 'status-storage';
      case 'OutForDelivery':
        return 'status-out-for-delivery';
      case 'Delivered':
        return 'status-delivered';
      default:
        return '';
    }
  }

  getOrderStatusText(status: string): string {
    switch (status) {
      case 'Storage':
        return 'In Storage';
      case 'OutForDelivery':
        return 'Out For Delivery';
      case 'Delivered':
        return 'Delivered';
      default:
        return status;
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