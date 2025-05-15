import { Component, OnInit, OnDestroy } from '@angular/core';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
  
})
export class LoginComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  serverPort: number = 3000;
  notifications: string[] = [];
  private subscription: Subscription = new Subscription();

  constructor(private socketService: SocketService) { }

  ngOnInit(): void {
    // Subscribe to notifications
    this.subscription.add(
      this.socketService.notifications$.subscribe(
        notifications => this.notifications = notifications
      )
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  onLogin(): void {
    if (this.email && this.password && this.serverPort >= 1024 && this.serverPort <= 49151) {
      // Connect to the server
      this.socketService.connect(this.serverPort);
      
      // Attempt login
      setTimeout(() => {
        this.socketService.login(this.email, this.password);
      }, 500);
    } else {
      if (this.serverPort < 1024 || this.serverPort > 49151) {
        alert('Please enter a valid port number between 1024 and 49151');
      } else {
        alert('Please fill in all required fields');
      }
    }
  }
}