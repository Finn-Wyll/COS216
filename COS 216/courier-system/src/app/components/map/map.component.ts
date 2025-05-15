import { Component, OnInit, OnDestroy, AfterViewInit, Input } from '@angular/core';
import { Subscription } from 'rxjs';
import * as L from 'leaflet';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() showDroneControls: boolean = false;
  
  private map!: L.Map;
  private droneMarkers: Map<string, L.Marker> = new Map();
  private orderMarkers: Map<string, L.Marker> = new Map();
  private dustDevilCircles: Map<string, L.Circle> = new Map();
  private hqMarker: L.Marker | null = null;
  private subscriptions: Subscription = new Subscription();
  
  // HQ coordinates
  private readonly HQ_LAT = 25.7472;
  private readonly HQ_LNG = 28.2511;
  
  // Icon definitions
  private droneIcon = L.icon({
    iconUrl: 'assets/drone.png',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  
  private orderIcon = L.icon({
    iconUrl: 'assets/package.png',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  
  private hqIcon = L.icon({
    iconUrl: 'assets/headquarters.png',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  constructor(private socketService: SocketService) { }

  ngOnInit(): void {
    // Create subscriptions
    this.subscriptions.add(
      this.socketService.drones$.subscribe(drones => this.updateDroneMarkers(drones))
    );
    
    this.subscriptions.add(
      this.socketService.orders$.subscribe(orders => this.updateOrderMarkers(orders))
    );
    
    this.subscriptions.add(
      this.socketService.dustDevils$.subscribe(dustDevils => this.updateDustDevils(dustDevils))
    );
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    // Create map instance
    this.map = L.map('map', {
      center: [this.HQ_LAT, this.HQ_LNG],
      zoom: 14
    });

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Add HQ marker
    this.hqMarker = L.marker([this.HQ_LAT, this.HQ_LNG], { icon: this.hqIcon })
      .addTo(this.map)
      .bindPopup('Headquarters');
      
    // Add 5km radius circle around HQ
    L.circle([this.HQ_LAT, this.HQ_LNG], {
      radius: 5000, // 5km in meters
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.05,
      weight: 1
    }).addTo(this.map);
    
    // Add keyboard event listeners if drone controls are enabled
    if (this.showDroneControls) {
      document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }
  }

  private updateDroneMarkers(drones: any[]): void {
    if (!this.map) return;
    
    // Remove old markers that are no longer present
    const currentDroneIds = new Set(drones.map(drone => drone.id));
    for (const [droneId, marker] of this.droneMarkers.entries()) {
      if (!currentDroneIds.has(droneId)) {
        this.map.removeLayer(marker);
        this.droneMarkers.delete(droneId);
      }
    }
    
    // Update or add markers for current drones
    drones.forEach(drone => {
      const lat = parseFloat(drone.latest_latitude);
      const lng = parseFloat(drone.latest_longitude);
      
      if (isNaN(lat) || isNaN(lng)) return;
      
      const popupContent = `
        <strong>Drone ${drone.id}</strong><br>
        Battery: ${drone.battery_level}%<br>
        Altitude: ${drone.altitude}m<br>
        Operator: ${drone.current_operator_id || 'None'}<br>
        Available: ${drone.is_available ? 'Yes' : 'No'}
      `;
      
      if (this.droneMarkers.has(drone.id)) {
        // Update existing marker
        const marker = this.droneMarkers.get(drone.id)!;
        marker.setLatLng([lat, lng]);
        marker.setPopupContent(popupContent);
      } else {
        // Add new marker
        const marker = L.marker([lat, lng], { icon: this.droneIcon })
          .addTo(this.map)
          .bindPopup(popupContent);
        
        this.droneMarkers.set(drone.id, marker);
      }
    });
  }

  private updateOrderMarkers(orders: any[]): void {
    if (!this.map) return;
    
    // Remove old markers that are no longer present
    const currentOrderIds = new Set(orders.map(order => order.order_id));
    for (const [orderId, marker] of this.orderMarkers.entries()) {
      if (!currentOrderIds.has(orderId)) {
        this.map.removeLayer(marker);
        this.orderMarkers.delete(orderId);
      }
    }
    
    // Update or add markers for current orders
    orders.forEach(order => {
      const lat = parseFloat(order.destination_latitude);
      const lng = parseFloat(order.destination_longitude);
      
      if (isNaN(lat) || isNaN(lng)) return;
      
      const popupContent = `
        <strong>Order ${order.order_id}</strong><br>
        Customer: ${order.customer_id}<br>
        State: ${order.state}<br>
        Delivery Date: ${order.delivery_date || 'Not set'}
      `;
      
      if (this.orderMarkers.has(order.order_id)) {
        // Update existing marker
        const marker = this.orderMarkers.get(order.order_id)!;
        marker.setLatLng([lat, lng]);
        marker.setPopupContent(popupContent);
      } else {
        // Add new marker
        const marker = L.marker([lat, lng], { icon: this.orderIcon })
          .addTo(this.map)
          .bindPopup(popupContent);
        
        this.orderMarkers.set(order.order_id, marker);
      }
    });
  }

  private updateDustDevils(dustDevils: any[]): void {
    if (!this.map) return;
    
    // Remove old circles
    for (const circle of this.dustDevilCircles.values()) {
      this.map.removeLayer(circle);
    }
    this.dustDevilCircles.clear();
    
    // Add new circles
    dustDevils.forEach(devil => {
      const circle = L.circle([devil.lat, devil.lng], {
        radius: devil.radius,
        color: 'orange',
        fillColor: '#ff9800',
        fillOpacity: 0.5,
        weight: 2
      }).addTo(this.map);
      
      this.dustDevilCircles.set(devil.id, circle);
    });
  }

  private handleKeyPress(e: KeyboardEvent): void {
    // Get first drone (assuming only one drone is controlled by current user)
    const drones = this.socketService.currentDrones;

    if (drones.length === 0) return;
    
    const droneId = drones[0].id;
    
    // Check for dust devil collision
    const inDustDevil = this.checkDustDevilCollision(drones[0]);
    
    // Handle arrow keys
    switch (e.key) {
      case 'ArrowUp':
        this.socketService.moveDrone(droneId, 'UP', inDustDevil);
        e.preventDefault();
        break;
      case 'ArrowDown':
        this.socketService.moveDrone(droneId, 'DOWN', inDustDevil);
        e.preventDefault();
        break;
      case 'ArrowLeft':
        this.socketService.moveDrone(droneId, 'LEFT', inDustDevil);
        e.preventDefault();
        break;
      case 'ArrowRight':
        this.socketService.moveDrone(droneId, 'RIGHT', inDustDevil);
        e.preventDefault();
        break;
    }
  }

  private checkDustDevilCollision(drone: any): boolean {
    if (!drone) return false;
    
    const droneLat = parseFloat(drone.latest_latitude);
    const droneLng = parseFloat(drone.latest_longitude);
    
    if (isNaN(droneLat) || isNaN(droneLng)) return false;
    
    // Check collision with each dust devil
const dustDevils = this.socketService.currentDustDevils;    
    for (const devil of dustDevils) {
      const distance = this.calculateDistance(
        droneLat, droneLng, 
        devil.lat, devil.lng
      );
      
      // Convert radius from meters to kilometers
      if (distance <= (devil.radius / 1000)) {
        return true;
      }
    }
    
    return false;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    return distance;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }
}