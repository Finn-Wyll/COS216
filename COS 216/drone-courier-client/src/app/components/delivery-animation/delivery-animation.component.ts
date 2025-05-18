// src/app/components/delivery-animation/delivery-animation.component.ts

import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delivery-animation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-animation.component.html',
  styleUrls: ['./delivery-animation.component.css']
})
export class DeliveryAnimationComponent implements OnChanges {
  @Input() show: boolean = false;
  @Input() deliveryDate: string | null = null;
  @Output() animationComplete = new EventEmitter<void>();
  
  visible: boolean = false;
  stage: number = 0;
  fadeOut: boolean = false;
  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['show'] && this.show) {
      this.startAnimation();
    }
  }
  
  private startAnimation() {
    this.visible = true;
    this.stage = 0;
    this.fadeOut = false;
    
    // Animation sequence
    setTimeout(() => this.stage = 1, 300);
    setTimeout(() => this.stage = 2, 1000);
    setTimeout(() => this.stage = 3, 1800);
    
    // Start fade out
    setTimeout(() => {
      this.fadeOut = true;
    }, 3000);
    
    // Hide animation and emit complete event
    setTimeout(() => {
      this.visible = false;
      this.animationComplete.emit();
    }, 3500);
  }
}