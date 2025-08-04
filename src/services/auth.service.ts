// auth.service.ts
import { apiService } from './api.service';
import { UserProfile } from '../types/user.types';

class AuthService {
  // Create user profile in backend
  async createUserProfile(userId: string, email: string, displayName?: string): Promise<void> {
    await apiService.post('/api/users', {
      userId,
      email,
      displayName,
      createdAt: new Date().toISOString(),
    });
  }

  // Get user profile
  async getUserProfile(): Promise<UserProfile> {
    return await apiService.get<UserProfile>('/api/users/me');
  }

  // Update user profile
  async updateUserProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    return await apiService.put<UserProfile>('/api/users/me', data);
  }

  // Check if Gmail is connected
  async checkGmailConnection(): Promise<boolean> {
    try {
      const response = await apiService.get<{ connected: boolean }>('/api/gmail/status');
      return response.connected;
    } catch {
      return false;
    }
  }
}

export const authService = new AuthService();