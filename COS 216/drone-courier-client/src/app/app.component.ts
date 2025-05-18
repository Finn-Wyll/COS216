import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebSocketService } from './services/websocket.service';
import { DustDevilService } from './services/dust-devil.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit 
{
  title = 'Drone Delivery System';

  constructor(
    private webSocketService: WebSocketService,
    private dustDevilService: DustDevilService
  ) {}

  ngOnInit(): void 
  {
    this.webSocketService.connect();
  }
}