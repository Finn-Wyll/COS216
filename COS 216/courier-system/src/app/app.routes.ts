// app.routes.ts
import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { CustomerDashboardComponent } from './components/customer-dashboard/customer-dashboard.component';
import { CourierDashboardComponent } from './components/courier-dashboard/courier-dashboard.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'customer', component: CustomerDashboardComponent },
  { path: 'courier', component: CourierDashboardComponent },
  { path: '**', redirectTo: '/login' }
];