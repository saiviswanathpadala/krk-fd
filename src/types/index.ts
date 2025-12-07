export interface User {
  id: number;
  phone: string;
  name?: string;
  email?: string;
  city?: string;
  dateOfBirth?: Date;
  profileImgUrl?: string;
  profileCompleted: boolean;
  role: string;
  createdAt: Date;
  lastLogin: Date;
}

export interface AuthResponse {
  token: string;
  user: User;
  profileCompleted: boolean;
}