export interface Drone 
{
  id: number;
  current_operator_id: number | null;
  is_available: boolean;
  latest_latitude: number;
  latest_longitude: number;
  altitude: number;
  battery_level: number;
}

export interface DronesResponse 
{
  status: string;
  timestamp: number;
  data: Drone[];
}
