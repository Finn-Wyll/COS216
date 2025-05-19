import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, filter } from 'rxjs';
import { Order } from '../models/order.model';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root'
})

export class OrderService 
{
  private ordersSubject = new BehaviorSubject<Order[]>([]);
  public orders$ = this.ordersSubject.asObservable();

  constructor(private webSocketService: WebSocketService) 
  {
    this.webSocketService.messages$.pipe(
      filter(message => message.type === 'ORDERS_LIST')
    ).subscribe(response => {
      if (response.orders && Array.isArray(response.orders)) 
      {
        this.ordersSubject.next(response.orders);
      }
    });

      this.webSocketService.messages$.pipe(
      filter(message => ['ORDER_UPDATE', 'ORDER_DELIVERED', 'ORDER_CREATED'].includes(message.type))
    ).subscribe(response => {
      if (response.type === 'ORDER_CREATED') 
        {
        const orders = this.ordersSubject.value;
        if (response.orderId && response.trackingNumber) 
        {
          this.getOrders();
        }
      } 
      else 
      {
        this.updateOrderStatus(response.orderId, response.status);
      }
    });
  }

  getOrders(): void 
  {
    this.webSocketService.send({
      type: 'GET_ORDERS'
    });
  }

  requestDelivery(order: Order): void 
  {
    this.webSocketService.send({
      type: 'REQUEST_DELIVERY',
      orderId: order.order_id,
      latitude: order.destination_latitude,
      longitude: order.destination_longitude
    });
  }

  private updateOrderStatus(orderId: number, status: string): void 
  {
    const currentOrders = this.ordersSubject.value;

    const updatedOrders = currentOrders.map(order => 
    {
      if (order.order_id === orderId) 
      {
        return { ...order, state: status };
      }
      return order;
      
    });
    this.ordersSubject.next(updatedOrders);
  }
}