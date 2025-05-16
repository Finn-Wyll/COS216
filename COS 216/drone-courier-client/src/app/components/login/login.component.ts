// src/app/components/login/login.component.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  isConnecting: boolean = true;
  errorMessage: string = '';
  private destroy$ = new Subject<void>();

  constructor(
    private webSocketService: WebSocketService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Connect to WebSocket
    this.webSocketService.connect();

    // Monitor connection status
    this.webSocketService.connectionStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isConnected => {
        this.isConnecting = !isConnected;
      });

    // Listen for login responses
    this.webSocketService.messages$
      .pipe(
        takeUntil(this.destroy$),
        filter(message => ['LOGIN_SUCCESS', 'LOGIN_FAILED'].includes(message.type))
      )
      .subscribe(message => {
        if (message.type === 'LOGIN_SUCCESS') {
          this.router.navigate(['/dashboard']);
        } else if (message.type === 'LOGIN_FAILED') {
          this.errorMessage = message.message || 'Login failed. Please try again.';
        }
      });
  }

  onLogin(): void {
    if (!this.email || !this.password) {
      this.errorMessage = 'Please enter both email and password';
      return;
    }

    this.errorMessage = '';
    this.authService.login(this.email, this.password);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
