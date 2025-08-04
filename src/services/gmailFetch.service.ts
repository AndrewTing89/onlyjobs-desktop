// gmailFetch.service.ts
import { auth } from '../config/firebase';

class GmailFetchService {
  private readonly CLOUD_RUN_URL = 'https://gmail-fetch-12002195951.us-central1.run.app';

  // Trigger backfill fetch (up to 200 emails in pages of 50)
  async triggerBackfill(uid: string): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const idToken = await auth.currentUser.getIdToken();
    
    const response = await fetch(`${this.CLOUD_RUN_URL}/fetch?uid=${uid}&backfill=true`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backfill fetch failed: ${errorText}`);
    }

    return response.json();
  }

  // Trigger incremental fetch (latest 10 emails)
  async triggerIncremental(uid: string): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const idToken = await auth.currentUser.getIdToken();
    
    const response = await fetch(`${this.CLOUD_RUN_URL}/fetch?uid=${uid}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Incremental fetch failed: ${errorText}`);
    }

    return response.json();
  }

  // Generic fetch function with options
  async fetch(uid: string, options: { backfill?: boolean } = {}): Promise<any> {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const idToken = await auth.currentUser.getIdToken();
    const url = new URL(`${this.CLOUD_RUN_URL}/fetch`);
    url.searchParams.set('uid', uid);
    
    if (options.backfill) {
      url.searchParams.set('backfill', 'true');
    }
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail fetch failed: ${errorText}`);
    }

    return response.json();
  }
}

export const gmailFetchService = new GmailFetchService();