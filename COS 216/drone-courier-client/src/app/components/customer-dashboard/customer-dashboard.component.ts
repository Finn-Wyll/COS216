import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { Order } from '../../models/order.model';
import { MapComponent } from '../map/map.component';

@Component({
  selector: 'app-customer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MapComponent],
  templateUrl: './customer-dashboard.component.html',
  styleUrls: ['./customer-dashboard.component.css']
})

export class CustomerDashboardComponent implements OnInit, OnDestroy 
{
  userName: string = '';
  userType: string = '';
  notifications: string[] = [];
  dronePosition: { latitude: number, longitude: number, altitude: number } | null = null;
  dustDevils: Array<{latitude: number, longitude: number}> = [];
  private destroy$ = new Subject<void>();

  constructor
  (
    private webSocketService: WebSocketService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void 
  {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => 
        {
        if (user) 
          {
          this.userName = user.username;
          this.userType = user.type;
        }
      });

    this.webSocketService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (['ORDER_UPDATE', 'ORDER_DELIVERED', 'DELIVERY_POSTPONED'].includes(message.type)) 
        {
          const notification = message.message || `Status update: ${message.type}`;
          this.notifications.unshift(notification);
        }
        
        if (message.type === 'DRONE_POSITION') 
        {
          this.dronePosition = 
          {
            latitude: message.latitude,
            longitude: message.longitude,
            altitude: message.altitude
          };
        }
        
        if (message.type === 'DUST_DEVILS') 
        {
          this.dustDevils = message.dustDevils || [];
        }
      });
  }

  logout(): void 
  {
    this.authService.logout();
    this.webSocketService.disconnect();
  }

  ngOnDestroy(): void 
  {
    this.destroy$.next();
    this.destroy$.complete();
  }
}