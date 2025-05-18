// src/app/app.routes.ts

import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';
import { map } from 'rxjs';

import { LoginComponent } from './components/login/login.component';
import { CustomerDashboardComponent } from './components/customer-dashboard/customer-dashboard.component';
import { CourierDashboardComponent } from './components/courier-dashboard/courier-dashboard.component';
import { OrderViewComponent } from './components/order-view/order-view.component';

export const routes: Routes = [
  { 
    path: 'login', 
    component: LoginComponent,
    canActivate: [() => {
      const authService = inject(AuthService);
      return authService.currentUser$.pipe(
        map(user => !user?.authenticated)
      );
    }]
  },
  { 
    path: 'dashboard', 
    component: CustomerDashboardComponent,
    canActivate: [() => {
      const authService = inject(AuthService);
      return authService.currentUser$.pipe(
        map(user => !!user?.authenticated && user.type === 'Customer')
      );
    }]
  },
  { 
    path: 'courier', 
    component: CourierDashboardComponent,
    canActivate: [() => {
      const authService = inject(AuthService);
      return authService.currentUser$.pipe(
        map(user => !!user?.authenticated && user.type === 'Courier')
      );
    }]
  },
  { 
    path: 'orders', 
    component: OrderViewComponent,
    canActivate: [() => {
      const authService = inject(AuthService);
      return authService.currentUser$.pipe(
        map(user => !!user?.authenticated)
      );
    }]
  },
  { 
    path: '', 
    redirectTo: '/login', 
    pathMatch: 'full' 
  },
  { 
    path: '**', 
    redirectTo: '/login' 
  }
];