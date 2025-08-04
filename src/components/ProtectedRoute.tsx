// ProtectedRoute.tsx
import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  const { currentUser, loading, isEmailVerified } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Log navigation attempts for analytics
    if (!loading) {
      console.log('Protected route access:', {
        path: location.pathname,
        authenticated: !!currentUser,
        emailVerified: isEmailVerified,
      });
    }
  }, [currentUser, loading, location, isEmailVerified]);

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

  // Check email verification if required
  if (requireEmailVerification && !isEmailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // Authenticated - render children
  return <>{children}</>;
};
