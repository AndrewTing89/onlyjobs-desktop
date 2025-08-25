// ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/ElectronAuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireEmailVerification?: boolean;
  redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireEmailVerification = false,
  redirectTo = '/'
}) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Log navigation attempts for analytics
    if (!loading) {
      console.log('Protected route access:', {
        path: location.pathname,
        authenticated: !!currentUser,
      });
    }
  }, [currentUser, loading, location]);

  // Show loading state
  if (loading) {
    // You can replace this with your actual loading component later
    return <div>Loading...</div>;
  }

  // Not authenticated
  if (!currentUser) {
    // Save the attempted location for redirect after login
    sessionStorage.setItem('redirectAfterLogin', location.pathname);
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Email verification not needed for Electron app

  // Authenticated - render children
  return <>{children}</>;
};
