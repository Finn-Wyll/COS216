// src/app/components/map/map.component.ts

import { Component, OnInit, Input, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @Input() centerLatitude: number = -25.7545; // Default to Hatfield
  @Input() centerLongitude: number = 28.2314;
  @Input() zoom: number = 14;

  private map: L.Map | null = null;
  private hqMarker: L.Marker | null = null;
  private droneMarker: L.Marker | null = null;
  private customerMarkers: L.Marker[] = [];
  private dustDevilCircles: L.Circle[] = [];

  // HQ coordinates
  private readonly HQ_LATITUDE = 25.7472;
  private readonly HQ_LONGITUDE = 28.2511;

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    // Create map
    this.map = L.map('map').setView([this.centerLatitude, this.centerLongitude], this.zoom);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Add HQ marker
    this.addHQMarker();
  }

  private addHQMarker(): void {
    if (!this.map) return;

    // Create custom HQ icon
    const hqIcon = L.icon({
      iconUrl: 'assets/hq-icon.png', // You'll need to add this asset
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });

    // Fallback to default icon if asset is missing
    this.hqMarker = L.marker([this.HQ_LATITUDE, this.HQ_LONGITUDE], {
      icon: hqIcon
    }).addTo(this.map);

    this.hqMarker.bindPopup('HQ: Drone Base Station');
    
    // Draw 5km radius circle around HQ
    L.circle([this.HQ_LATITUDE, this.HQ_LONGITUDE], {
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.05,
      radius: 5000 // 5km in meters
    }).addTo(this.map);
  }

  updateDronePosition(latitude: number, longitude: number, altitude: number): void {
    if (!this.map) return;

    // Create drone icon if it doesn't exist
    if (!this.droneMarker) {
      const droneIcon = L.icon({
        iconUrl: 'assets/drone-icon.png', // You'll need to add this asset
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      this.droneMarker = L.marker([latitude, longitude], {
        icon: droneIcon
      }).addTo(this.map);
      
      this.droneMarker.bindPopup(`Drone<br>Altitude: ${altitude}m`);
    } else {
      this.droneMarker.setLatLng([latitude, longitude]);
      this.droneMarker.setPopupContent(`Drone<br>Altitude: ${altitude}m`);
    }
  }

  addCustomerMarker(id: number, latitude: number, longitude: number): void {
    if (!this.map) return;

    const marker = L.marker([latitude, longitude])
      .addTo(this.map)
      .bindPopup(`Customer #${id}<br>[${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`);
    
    this.customerMarkers.push(marker);
  }

  updateDustDevils(dustDevils: Array<{latitude: number, longitude: number}>): void {
    if (!this.map) return;

    // Remove existing dust devils
    this.dustDevilCircles.forEach(circle => circle.remove());
    this.dustDevilCircles = [];

    // Add new dust devils
    dustDevils.forEach(devil => {
      const circle = L.circle([devil.latitude, devil.longitude], {
        color: 'orange',
        fillColor: '#ff9800',
        fillOpacity: 0.5,
        radius: 10 // 10m radius
      }).addTo(this.map!);
      
      circle.bindPopup('Dust Devil - Avoid!');
      this.dustDevilCircles.push(circle);
    });
  }

  clearCustomerMarkers(): void {
    this.customerMarkers.forEach(marker => marker.remove());
    this.customerMarkers = [];
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}