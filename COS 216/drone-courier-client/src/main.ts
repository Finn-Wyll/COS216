// src/main.ts

import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { WebSocketService } from './app/services/websocket.service';
import { AuthService } from './app/services/auth.service';
import { OrderService } from './app/services/order.service';
import { DustDevilService } from './app/services/dust-devil.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    WebSocketService,
    AuthService,
    OrderService,
    DustDevilService
  ]
}).catch(err => console.error(err));