import { Injectable, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket: WebSocket | null = null;
  private destroyRef = inject(DestroyRef);
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: any = null;
  
  private messageSubject = new Subject<any>();
  private connectionStatusSubject = new BehaviorSubject<boolean>(false);
  
  // Store the last message for reference
  private lastMessage: any = null;
  
  public messages$ = this.messageSubject.asObservable().pipe(
    takeUntilDestroyed(this.destroyRef)
  );
  
  public connectionStatus$ = this.connectionStatusSubject.asObservable().pipe(
    takeUntilDestroyed(this.destroyRef)
  );

  constructor() { }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log(`Attempting to connect to WebSocket at ws://localhost:${environment.serverPort}`);
    this.socket = new WebSocket(`ws://localhost:${environment.serverPort}`);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.connectionStatusSubject.next(true);
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        // Store the last message
        this.lastMessage = data;
        
        this.messageSubject.next(data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    this.socket.onclose = (event) => {
      console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
      this.connectionStatusSubject.next(false);
      
      // Attempt to reconnect with exponential backoff
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectAttempts++;
          this.connect();
        }, delay);
      } else {
        console.error('Maximum reconnect attempts reached');
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.connectionStatusSubject.next(false);
    };
  }

  send(message: any): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('Sending message:', message);
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message, WebSocket is not connected');
      // Try to reconnect and then send the message
      this.connect();
      // Add to a queue to send once connected (not implemented in this version)
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      console.log('Disconnecting WebSocket');
      this.socket.close();
      this.socket = null;
    }
  }
  
  // Get the last message received from the server
  getLastMessage(): any {
    return this.lastMessage;
  }
}