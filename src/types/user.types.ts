// user.types.ts
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date;
  provider: 'google' | 'email';
}

export interface UserSettings {
  userId: string;
  emailNotifications: boolean;
  syncFrequency: 'hourly' | 'daily' | 'weekly';
  gmailConnected: boolean;
  lastSyncTime: Date | null;
}