// Token management for Electron app
const TOKEN_KEY = 'onlyjobs_auth_token';
const USER_KEY = 'onlyjobs_user';

export interface AuthToken {
  token: string;
  expiresAt: number;
  user: {
    uid: string;
    email: string;
    displayName?: string;
  };
}

// Store token in localStorage (in production, use secure storage)
export const saveAuthToken = (token: AuthToken) => {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  localStorage.setItem(USER_KEY, JSON.stringify(token.user));
};

// Get stored token
export const getAuthToken = (): AuthToken | null => {
  const tokenStr = localStorage.getItem(TOKEN_KEY);
  if (!tokenStr) return null;
  
  try {
    const token = JSON.parse(tokenStr) as AuthToken;
    
    // Check if token is expired
    if (token.expiresAt < Date.now()) {
      clearAuthToken();
      return null;
    }
    
    return token;
  } catch {
    return null;
  }
};

// Get stored user
export const getStoredUser = () => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Clear token
export const clearAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// Check if authenticated
export const isAuthenticated = (): boolean => {
  return getAuthToken() !== null;
};