import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifications: string[] = [];
  private subscription: Subscription = new Subscription();

  constructor(private socketService: SocketService) { }

  ngOnInit(): void {
    this.subscription.add(
      this.socketService.notifications$.subscribe(
        notifications => this.notifications = notifications
      )
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }
}