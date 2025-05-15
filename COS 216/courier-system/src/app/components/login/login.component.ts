// src/app/components/login/login.component.ts

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  serverForm: FormGroup;
  errorMessage: string = '';
  isConnected: boolean = false;
  isLoggedIn: boolean = false;
  
  constructor(
    private fb: FormBuilder,
    private socketService: SocketService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
    
    this.serverForm = this.fb.group({
      serverUrl: ['http://localhost:3000', Validators.required]
    });
  }
  
  ngOnInit(): void {
    // Check if already connected
    this.socketService.isConnected().subscribe(connected => {
      this.isConnected = connected;
    });
    
    // Subscribe to error messages
    this.socketService.getErrors().subscribe(error => {
      this.errorMessage = error;
    });
    
    // Check if already logged in
    this.socketService.getUser().subscribe(user => {
      if (user) {
        this.isLoggedIn = true;
        this.navigateBasedOnUserType(user.type);
      }
    });
  }
  
  connectToServer(): void {
    if (this.serverForm.valid) {
      const serverUrl = this.serverForm.get('serverUrl')?.value;
      this.socketService.connect(serverUrl);
    }
  }
  
  login(): void {
    if (this.loginForm.valid && this.isConnected) {
      const username = this.loginForm.get('username')?.value;
      const password = this.loginForm.get('password')?.value;
      
      this.socketService.login(username, password);
    }
  }
  
  // Navigate based on user type after login
  private navigateBasedOnUserType(userType: string): void {
    switch(userType) {
      case 'Customer':
        this.router.navigate(['/customer-dashboard']);
        break;
      case 'Courier':
        this.router.navigate(['/courier-dashboard']);
        break;
      default:
        // Handle other user types or stay on login page
        break;
    }
  }
  
  clearError(): void {
    this.socketService.clearError();
  }
}