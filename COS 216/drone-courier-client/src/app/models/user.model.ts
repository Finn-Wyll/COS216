export interface User 
{
  id: number;
  username: string;
  email: string;
  type: 'Customer' | 'Courier';
  authenticated: boolean;
}

export interface LoginResponse 
{
  status: string;
  timestamp: number;
  id?: number;
}
