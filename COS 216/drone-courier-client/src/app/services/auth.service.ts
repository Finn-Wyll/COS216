// src/app/services/auth.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, filter, map } from 'rxjs';
import { User } from '../models/user.model';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private webSocketService: WebSocketService) {
    // Listen for login responses from the WebSocket
    this.webSocketService.messages$.pipe(
      filter(message => message.type === 'LOGIN_SUCCESS')
    ).subscribe(response => {
      const user: User = {
        id: response.userId,
        username: response.email || 'User',
        email: response.email || '',
        type: response.userType,
        authenticated: true
      };
      this.currentUserSubject.next(user);
      localStorage.setItem('currentUser', JSON.stringify(user));
    });

    // Check if user is already logged in
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      this.currentUserSubject.next(JSON.parse(storedUser));
    }
  }

  login(email: string, password: string): void {
    this.webSocketService.send({
      type: 'LOGIN',
      email,
      password
    });
  }

  logout(): void {
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value?.authenticated;
  }

  get isCustomer(): boolean {
    return this.currentUserSubject.value?.type === 'Customer';
  }

  get isCourier(): boolean {
    return this.currentUserSubject.value?.type === 'Courier';
  }
}
