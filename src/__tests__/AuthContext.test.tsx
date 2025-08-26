// AuthContext.test.tsx
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';

// Mock Firebase
jest.mock('../config/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: jest.fn(),
  },
  googleProvider: {},
}));

describe('AuthContext', () => {
  it('provides authentication state', async () => {
    let authState: any;
    
    const TestComponent = () => {
      authState = useAuth();
      return null;
    };
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(authState).toBeDefined();
      expect(authState.currentUser).toBeNull();
      expect(authState.loading).toBe(false);
    });
  });
  
  // Add more tests as you build features
});