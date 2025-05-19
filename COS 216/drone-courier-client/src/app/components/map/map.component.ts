import { Component, OnInit, Input, AfterViewInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})

export class MapComponent implements AfterViewInit, OnChanges, OnDestroy 
{
  @Input() centerLatitude: number = -25.7545; //Hatfield
  @Input() centerLongitude: number = 28.2314; //Hatfield
  @Input() zoom: number = 14;
  @Input() dronePosition: { latitude: number, longitude: number, altitude: number } | null = null;
  @Input() dustDevils: Array<{ latitude: number, longitude: number }> = [];
  @Input() customerMarkers: Array<{ id: number, latitude: number, longitude: number }> = [];

  private map: L.Map | null = null;
  private hqMarker: L.Marker | null = null;
  private droneMarker: L.Marker | null = null;
  private customerMarkersMap: Map<number, L.Marker> = new Map();
  private dustDevilCircles: L.Circle[] = [];

  // Hatfield HQ
  private readonly HQ_LATITUDE = -25.7472;
  private readonly HQ_LONGITUDE = 28.2511;

  ngAfterViewInit(): void 
  {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void 
  {
    if (changes['dronePosition'] && this.map) 
      {
      if (this.dronePosition) 
        {
        this.updateDronePosition(
          this.dronePosition.latitude,
          this.dronePosition.longitude,
          this.dronePosition.altitude
        );
      }
    }

    if (changes['dustDevils'] && this.map) 
    {
      this.updateDustDevils(this.dustDevils);
    }

    if (changes['customerMarkers'] && this.map) 
    {
      this.updateCustomerMarkers(this.customerMarkers);
    }
  }

  private initMap(): void {

    this.map = L.map('map').setView([this.centerLatitude, this.centerLongitude], this.zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
    {
      maxZoom: 19,
      attribution: 'DaStreetMap'
    }).addTo(this.map);

    this.addHQMarker();

    if (this.dronePosition) 
    {
      this.updateDronePosition(
        this.dronePosition.latitude,
        this.dronePosition.longitude,
        this.dronePosition.altitude
      );
    }

    if (this.dustDevils.length > 0) 
    {
      this.updateDustDevils(this.dustDevils);
    }

    if (this.customerMarkers.length > 0) 
    {
      this.updateCustomerMarkers(this.customerMarkers);
    }
  }

  private addHQMarker(): void 
  {
    if (!this.map) return;

    const hqIcon = L.divIcon({
      className: 'hq-marker',
      html: '<div class="hq-icon"><span>🏢</span></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

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

  private updateDronePosition(latitude: number, longitude: number, altitude: number): void 
  {
    if (!this.map) return;

    // Create drone icon if it doesn't exist
    if (!this.droneMarker) {
      const droneIcon = L.divIcon({
        className: 'drone-marker',
        html: '<div class="drone-icon">🚁</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      this.droneMarker = L.marker([latitude, longitude], {
        icon: droneIcon
      }).addTo(this.map);
      
      this.droneMarker.bindPopup(`Drone<br>Altitude: ${altitude}m`);
    } 
    else 
    {
      this.droneMarker.setLatLng([latitude, longitude]);
      this.droneMarker.setPopupContent(`Drone<br>Altitude: ${altitude}m`);
    }
  }

  private updateCustomerMarkers(markers: Array<{ id: number, latitude: number, longitude: number }>): void 
  {
    if (!this.map) return;

    // Remove markers don't exist
    const newMarkerIds = new Set(markers.map(m => m.id));
    Array.from(this.customerMarkersMap.keys()).forEach(id => {
      if (!newMarkerIds.has(id)) {
        if (this.customerMarkersMap.has(id)) {
          const marker = this.customerMarkersMap.get(id);
          if (marker) {
            marker.remove();
            this.customerMarkersMap.delete(id);
          }
        }
      }
    });

    // Add / update markers
    markers.forEach(markerData => {
      if (this.customerMarkersMap.has(markerData.id)) 
        {
        // Update existing marker
        const marker = this.customerMarkersMap.get(markerData.id);
        if (marker) 
          {
          marker.setLatLng([markerData.latitude, markerData.longitude]);
          marker.setPopupContent(`Customer #${markerData.id}<br>[${markerData.latitude}, ${markerData.longitude}]`);
        }
      } 
      else 
      {
        // Create new marker
        const customerIcon = L.divIcon({
          className: 'customer-marker',
          html: '<div class="customer-icon">📦</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([markerData.latitude, markerData.longitude], {
          icon: customerIcon
        }).addTo(this.map!);
        
        marker.bindPopup(`Customer #${markerData.id}<br>[${markerData.latitude}, ${markerData.longitude}]`);
        this.customerMarkersMap.set(markerData.id, marker);
      }
    });
  }

  private updateDustDevils(dustDevils: Array<{latitude: number, longitude: number}>): void 
  {
    if (!this.map) return;

    // Remove existing dust devils
    this.dustDevilCircles.forEach(circle => circle.remove());
    this.dustDevilCircles = [];

    // Add new dust devils
    dustDevils.forEach(devil => {
      const circle = L.circle([devil.latitude, devil.longitude], 
      {
        color: 'orange',
        fillColor: '#ff9800',
        fillOpacity: 0.5,
        radius: 10 // 10m radius
      }).addTo(this.map!);
      
      circle.bindPopup('Dust Devil - Avoid!');
      this.dustDevilCircles.push(circle);
    });
  }

  ngOnDestroy(): void 
  {
    if (this.map) 
    {
      this.map.remove();
      this.map = null;
    }
  }
}