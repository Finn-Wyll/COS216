import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './components/login/login.component';
import { CustomerDashboardComponent } from './components/customer-dashboard/customer-dashboard.component';
import { CourierDashboardComponent } from './components/courier-dashboard/courier-dashboard.component';
import { MapComponent } from './components/map/map.component';
import { NotificationsComponent } from './components/notifications/notifications.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    CustomerDashboardComponent,
    CourierDashboardComponent,
    MapComponent,
    NotificationsComponent
  ],
  imports: [BrowserModule,AppRoutingModule,FormsModule,HttpClientModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }