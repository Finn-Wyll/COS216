// src/app/components/map/map.component.ts

import { Component, OnInit, AfterViewInit, Input, OnDestroy, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  @Input() userType: string = '';
  @Input() selectedDroneId: number | null = null;
  @Output() locationSelected = new EventEmitter<{latitude: number, longitude: number}>();
  
  private map!: L.Map;
  private droneMarkers: Map<number, L.Marker> = new Map();
  private orderMarkers: Map<number, L.Marker> = new Map();
  private dustDevilCircles: Map<number, L.Circle> = new Map();
  private HQMarker!: L.Marker;
  
  // Default HQ coordinates
  private HQ = {
    latitude: 25.7472,
    longitude: 28.2511
  };
  
  // Subscriptions
  private dronesSub!: Subscription;
  private ordersSub!: Subscription;
  private dustDevilsSub!: Subscription;
  
  // Marker icons
  private droneIcon = L.icon({
    iconUrl: 'assets/drone.png',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
  
  private HQIcon = L.icon({
    iconUrl: 'assets/headquarters.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
  
  private customerIcon = L.icon({
    iconUrl: 'assets/customer.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
  
  private selectedDroneIcon = L.icon({
    iconUrl: 'assets/drone-selected.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
  
  constructor(private socketService: SocketService) {}
  
  ngOnInit(): void {
    // Initialize subscriptions
    this.subscribeToSocketEvents();
  }
  
  ngAfterViewInit(): void {
    this.initMap();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedDroneId'] && !changes['selectedDroneId'].firstChange) {
      this.updateSelectedDrone();
    }
  }
  
  private initMap(): void {
    // Create map centered on Hatfield (University of Pretoria)
    this.map = L.map('map').setView([this.HQ.latitude, this.HQ.longitude], 15);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    
    // Add HQ marker
    this.HQMarker = L.marker([this.HQ.latitude, this.HQ.longitude], { icon: this.HQIcon })
      .addTo(this.map)
      .bindPopup('Headquarters');
    
    // Add 5km radius circle around HQ
    L.circle([this.HQ.latitude, this.HQ.longitude], {
      radius: 5000, // 5km in meters
      color: '#3388ff',
      fillColor: '#3388ff',
      fillOpacity: 0.1
    }).addTo(this.map);
    
    // Add click event handler for customer orders
    if (this.userType === 'Customer') {
      this.map.on('click', (e: L.LeafletMouseEvent) => {
        // Calculate distance from HQ
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;
        const distance = this.calculateDistance(
          this.HQ.latitude, 
          this.HQ.longitude, 
          clickLat, 
          clickLng
        );
        
        if (distance <= 5) {
          // Within range, show temporary marker
          const tempMarker = L.marker([clickLat, clickLng], { icon: this.customerIcon })
            .addTo(this.map)
            .bindPopup(
              `<b>Selected Location</b><br>` +
              `Latitude: ${clickLat.toFixed(6)}<br>` +
              `Longitude: ${clickLng.toFixed(6)}<br>` +
              `<button id="select-location">Select this location</button>`
            )
            .openPopup();
          
          // Add event listener to popup button
          setTimeout(() => {
            const button = document.getElementById('select-location');
            if (button) {
              button.addEventListener('click', () => {
                // Emit location selected event
                this.locationSelected.emit({
                  latitude: Number(clickLat.toFixed(6)),
                  longitude: Number(clickLng.toFixed(6))
                });
                
                // Remove temporary marker
                this.map.removeLayer(tempMarker);
              });
            }
          }, 100);
        } else {
          alert('Location is outside the 5km delivery radius!');
        }
      });
    }
  }
  
  private subscribeToSocketEvents(): void {
    // Subscribe to drones updates
    this.dronesSub = this.socketService.getDrones().subscribe(drones => {
      this.updateDroneMarkers(drones);
    });
    
    // Subscribe to orders updates
    this.ordersSub = this.socketService.getOrders().subscribe(orders => {
      this.updateOrderMarkers(orders);
    });
    
    // Subscribe to dust devils updates
    this.dustDevilsSub = this.socketService.getDustDevils().subscribe(dustDevils => {
      this.updateDustDevilCircles(dustDevils);
    });
  }
  
  // Update drone markers on the map
  private updateDroneMarkers(drones: any[]): void {
    // Remove drones no longer in the list
    this.droneMarkers.forEach((marker, id) => {
      if (!drones.some(drone => drone.id === id)) {
        this.map.removeLayer(marker);
        this.droneMarkers.delete(id);
      }
    });
    
    // Update or add drones
    drones.forEach(drone => {
      const position: L.LatLngExpression = [
        parseFloat(drone.latest_latitude), 
        parseFloat(drone.latest_longitude)
      ];
      
      // Select the appropriate icon
      const icon = (drone.id === this.selectedDroneId) ? this.selectedDroneIcon : this.droneIcon;
      
      if (this.droneMarkers.has(drone.id)) {
        // Update existing marker
        const marker = this.droneMarkers.get(drone.id)!;
        marker.setLatLng(position);
        marker.setIcon(icon);
        marker.setPopupContent(this.createDronePopupContent(drone));
      } else {
        // Create new marker
        const marker = L.marker(position, { icon })
          .addTo(this.map)
          .bindPopup(this.createDronePopupContent(drone));
        
        this.droneMarkers.set(drone.id, marker);
      }
    });
  }
  
  // Update order markers on the map
  private updateOrderMarkers(orders: any[]): void {
    // Remove orders no longer in the list
    this.orderMarkers.forEach((marker, id) => {
      if (!orders.some(order => order.order_id === id)) {
        this.map.removeLayer(marker);
        this.orderMarkers.delete(id);
      }
    });
    
    // Update or add orders
    orders.forEach(order => {
      const position: L.LatLngExpression = [
        parseFloat(order.destination_latitude), 
        parseFloat(order.destination_longitude)
      ];
      
      if (this.orderMarkers.has(order.order_id)) {
        // Update existing marker
        const marker = this.orderMarkers.get(order.order_id)!;
        marker.setPopupContent(this.createOrderPopupContent(order));
      } else {
        // Create new marker
        const marker = L.marker(position, { icon: this.customerIcon })
          .addTo(this.map)
          .bindPopup(this.createOrderPopupContent(order));
        
        this.orderMarkers.set(order.order_id, marker);
      }
    });
  }
  
  // Update dust devil circles on the map
  private updateDustDevilCircles(dustDevils: any[]): void {
    // Remove all existing dust devils
    this.dustDevilCircles.forEach((circle) => {
      this.map.removeLayer(circle);
    });
    this.dustDevilCircles.clear();
    
    // Add new dust devils
    dustDevils.forEach(devil => {
      const position: L.LatLngExpression = [devil.latitude, devil.longitude];
      const circle = L.circle(position, {
        radius: devil.radius, // radius in meters
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.4
      }).addTo(this.map);
      
      this.dustDevilCircles.set(devil.id, circle);
    });
  }
  
  // Update the selected drone icon
  private updateSelectedDrone(): void {
    this.droneMarkers.forEach((marker, id) => {
      const icon = (id === this.selectedDroneId) ? this.selectedDroneIcon : this.droneIcon;
      marker.setIcon(icon);
    });
  }
  
  // Create popup content for drone marker
  private createDronePopupContent(drone: any): string {
    return `
      <div class="popup-content">
        <h3>Drone #${drone.id}</h3>
        <p>Status: ${drone.is_available ? 'Available' : 'In Use'}</p>
        <p>Battery: ${drone.battery_level}%</p>
        <p>Altitude: ${drone.altitude}m</p>
        <p>Position: [${drone.latest_latitude}, ${drone.latest_longitude}]</p>
      </div>
    `;
  }
  
  // Create popup content for order marker
  private createOrderPopupContent(order: any): string {
    return `
      <div class="popup-content">
        <h3>Order #${order.order_id}</h3>
        <p>Tracking: ${order.tracking_num}</p>
        <p>Status: ${order.state}</p>
        <p>Destination: [${order.destination_latitude}, ${order.destination_longitude}]</p>
      </div>
    `;
  }
  
  // Calculate distance between two GPS coordinates in kilometers
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
  }
  
  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }
  
  // Move the selected drone (for courier operation)
  moveDrone(direction: string): void {
    if (this.selectedDroneId) {
      this.socketService.moveDrone(this.selectedDroneId, direction);
    }
  }
  
  // Clean up subscriptions on component destroy
  ngOnDestroy(): void {
    if (this.dronesSub) this.dronesSub.unsubscribe();
    if (this.ordersSub) this.ordersSub.unsubscribe();
    if (this.dustDevilsSub) this.dustDevilsSub.unsubscribe();
  }
}