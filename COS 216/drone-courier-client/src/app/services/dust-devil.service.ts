// src/app/services/dust-devil.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class DustDevilService {
  // Hatfield area boundaries (approximate)
  private readonly MIN_LAT = -25.76;
  private readonly MAX_LAT = -25.74;
  private readonly MIN_LNG = 28.22;
  private readonly MAX_LNG = 28.24;
  
  // HQ coordinates
  private readonly HQ_LATITUDE = -25.7472;
  private readonly HQ_LONGITUDE = 28.2511;
  
  // Dust devil properties
  private readonly MIN_DUST_DEVILS = 5;
  private readonly MAX_DUST_DEVILS = 10;
  private readonly SAFE_DISTANCE = 0.0002; // Approx 20 meters in decimal degrees
  
  private dustDevilsSubject = new BehaviorSubject<Array<{ latitude: number, longitude: number }>>([]);
  public dustDevils$ = this.dustDevilsSubject.asObservable();
  
  constructor() {
    // Generate new dust devils every minute
    interval(60000).subscribe(() => {
      this.generateDustDevils();
    });
    
    // Generate initial dust devils
    this.generateDustDevils();
  }
  
  private generateDustDevils(): void {
    // Determine number of dust devils
    const count = this.getRandomInt(this.MIN_DUST_DEVILS, this.MAX_DUST_DEVILS);
    
    const dustDevils: Array<{ latitude: number, longitude: number }> = [];
    
    for (let i = 0; i < count; i++) {
      // Generate random position
      const latitude = this.getRandomFloat(this.MIN_LAT, this.MAX_LAT);
      const longitude = this.getRandomFloat(this.MIN_LNG, this.MAX_LNG);
      
      // Make sure dust devil is not too close to HQ
      const distanceToHQ = this.calculateDistance(
        latitude, longitude,
        this.HQ_LATITUDE, this.HQ_LONGITUDE
      );
      
      if (distanceToHQ > this.SAFE_DISTANCE) {
        dustDevils.push({ latitude, longitude });
      }
    }
    
    this.dustDevilsSubject.next(dustDevils);
  }
  
  private getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  private getRandomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
  
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return distance;
  }
  
  getCurrentDustDevils(): Array<{ latitude: number, longitude: number }> {
    return this.dustDevilsSubject.value;
  }
}