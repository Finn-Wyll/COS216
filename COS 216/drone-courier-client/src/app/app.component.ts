// src/app/app.component.ts

import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSocketService } from './services/websocket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Drone Delivery System';

  constructor(private webSocketService: WebSocketService) {}

  ngOnInit(): void {
    // Initialize WebSocket connection
    this.webSocketService.connect();
  }
}