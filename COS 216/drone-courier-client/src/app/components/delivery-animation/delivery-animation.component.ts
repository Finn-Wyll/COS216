import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delivery-animation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delivery-animation.component.html',
  styleUrls: ['./delivery-animation.component.css']
})

export class DeliveryAnimationComponent implements OnChanges 
{
  @Input() show: boolean = false;
  @Input() deliveryDate: string | null = null;
  @Output() animationComplete = new EventEmitter<void>();
  
  visibility: boolean = false;
  daStages: number = 0;
  fadeOut: boolean = false;
  
  ngOnChanges(changes: SimpleChanges) 
  {
    if (changes['show'] && this.show) 
    {
      this.startAnimation();
    }
  }
  
  private startAnimation() 
  {
    this.visibility = true;
    this.daStages = 0;
    this.fadeOut = false;
    
    setTimeout(() => this.daStages = 1, 300);
    setTimeout(() => this.daStages = 2, 1000);
    setTimeout(() => this.daStages = 3, 1800);
    
    setTimeout(() => 
    {
      this.fadeOut = true;
    }, 3000);
    
    setTimeout(() => 
    {
      this.visibility
 = false;
      this.animationComplete.emit();
    }, 3500);
  }
}