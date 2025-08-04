// gmail.service.ts
import { apiService } from './api.service';
import { GmailSyncRequest, GmailSyncResponse } from '../types/api.types';

class GmailService {
  // Get Gmail OAuth URL
  async getOAuthUrl(): Promise<string> {
    const response = await apiService.post<{ authUrl: string }>('/api/gmail/auth-url', {});
    return response.authUrl;
  }

  // Handle OAuth callback
  async handleOAuthCallback(code: string): Promise<void> {
    await apiService.post('/api/gmail/callback', { code });
  }

  // Finalize tokens from temporary storage
  async finalizeTokens(tempTokenId: string): Promise<void> {
    await apiService.post('/api/gmail/finalize-tokens', { temp_token_id: tempTokenId });
  }

  // Trigger manual sync
  async triggerSync(request?: Partial<GmailSyncRequest>): Promise<GmailSyncResponse> {
    return await apiService.post<GmailSyncResponse>('/api/sync/trigger', request || {});
  }

  // Get sync status
  async getSyncStatus(): Promise<{
    lastSync: Date | null;
    isRunning: boolean;
    emailsProcessed: number;
  }> {
    return await apiService.get('/api/sync/status');
  }

  // Check Gmail connection status
  async getConnectionStatus(): Promise<{ connected: boolean; email?: string }> {
    try {
      const response = await apiService.get<{ connected: boolean; email?: string }>('/api/gmail/status');
      return response;
    } catch (error) {
      // If endpoint doesn't exist or fails, assume not connected
      return { connected: false };
    }
  }

  // Disconnect Gmail
  async disconnect(): Promise<void> {
    await apiService.delete('/api/gmail/disconnect');
  }
}

export const gmailService = new GmailService();