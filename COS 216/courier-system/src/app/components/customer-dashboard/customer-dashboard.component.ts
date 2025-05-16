import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-customer-dashboard',
  templateUrl: './customer-dashboard.component.html',
  styleUrls: ['./customer-dashboard.component.css']
})
export class CustomerDashboardComponent implements OnInit, OnDestroy {
  orders: any[] = [];
  private subscription: Subscription = new Subscription();

  constructor(
    private socketService: SocketService,
    private router: Router
  ) { }

  ngOnInit(): void {
    // Check if logged in
    this.subscription.add(
      this.socketService.isLoggedIn$.subscribe(isLoggedIn => {
        if (!isLoggedIn) {
          this.router.navigate(['/login']);
        }
      })
    );
    
    // Get user type
    this.subscription.add(
      this.socketService.userType$.subscribe(userType => {
        if (userType && userType !== 'customer') {
          this.router.navigate(['/courier']);
        }
      })
    );
    
    // Get orders
    this.subscription.add(
      this.socketService.orders$.subscribe(orders => {
        this.orders = orders;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  logout(): void {
    this.socketService.logout();
  }

  requestDelivery(orderId: string): void {
    // Request delivery by loading the order onto a drone
    // In a real system, we'd select a drone, but for this demo,
    // we'll assume there's just one available drone
    const drones = this.socketService.currentDrones.filter((d: any) => d.is_available);
    
    if (drones.length > 0) {
      this.socketService.loadOrder(orderId, drones[0].id);
    } else {
      alert('No drones available for delivery at this time.');
    }
  }
}