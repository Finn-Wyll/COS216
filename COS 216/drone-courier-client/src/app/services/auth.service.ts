// src/app/services/auth.service.ts

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, filter, map } from 'rxjs';
import { User } from '../models/user.model';
import { WebSocketService } from './websocket.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private webSocketService: WebSocketService,
    private router: Router
  ) {
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
      
      setTimeout(() => {
        // Redirect based on user type
        if (user.type === 'Customer') {
          console.log('Navigating to dashboard...');
          this.router.navigate(['/dashboard']);
        } else if (user.type === 'Courier') {
          console.log('Navigating to courier dashboard...');
          this.router.navigate(['/courier']);
        }
      }, 100);
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
    this.router.navigate(['/login']);
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