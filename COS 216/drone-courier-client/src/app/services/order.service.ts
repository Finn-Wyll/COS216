// src/app/services/order.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, filter } from 'rxjs';
import { Order } from '../models/order.model';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private ordersSubject = new BehaviorSubject<Order[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  constructor(private webSocketService: WebSocketService) {
    // Listen for orders list from WebSocket
    this.webSocketService.messages$.pipe(
      filter(message => message.type === 'ORDERS_LIST')
    ).subscribe(response => {
      if (response.orders && Array.isArray(response.orders)) {
        this.ordersSubject.next(response.orders);
      }
    });

    // Listen for order updates
    this.webSocketService.messages$.pipe(
      filter(message => ['ORDER_UPDATE', 'ORDER_DELIVERED'].includes(message.type))
    ).subscribe(response => {
      this.updateOrderStatus(response.orderId, response.status);
    });
  }

  getOrders(): void {
    this.webSocketService.send({
      type: 'GET_ORDERS'
    });
  }

  requestDelivery(orderId: number, latitude: number, longitude: number): void {
    this.webSocketService.send({
      type: 'REQUEST_DELIVERY',
      orderId,
      latitude,
      longitude
    });
  }

  private updateOrderStatus(orderId: number, status: string): void {
    const currentOrders = this.ordersSubject.value;
    const updatedOrders = currentOrders.map(order => {
      if (order.order_id === orderId) {
        return { ...order, state: status };
      }
      return order;
    });
    this.ordersSubject.next(updatedOrders);
  }
}