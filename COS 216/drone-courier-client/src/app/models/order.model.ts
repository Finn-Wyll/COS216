// src/app/models/order.model.ts

export interface Order {
  order_id: number;
  customer_id: number;
  tracking_num: string;
  destination_latitude: number;
  destination_longitude: number;
  state: string;
  delivery_date: string | null;
}

export interface OrdersResponse {
  status: string;
  timestamp: number;
  data: Order[];
}
