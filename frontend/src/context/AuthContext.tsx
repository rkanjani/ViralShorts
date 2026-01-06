import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, isConfigured } from '../services/firebase';
import apiClient from '../api/client';
import type { User, ApiResponse } from '../types';

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    firebaseUser: null,
    isAuthenticated: false,
    loading: true,
    error: null,
  });

  // Fetch user data from our backend
  const fetchUserData = useCallback(async (): Promise<User | null> => {
    try {
      const response = await apiClient.get<ApiResponse<User>>('/auth/me');
      return response.data.data || null;
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      return null;
    }
  }, []);

  // Listen for Firebase auth state changes
  useEffect(() => {
    if (!auth || !isConfigured) {
      // Firebase not configured, set loading to false
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in, fetch their data from our backend
        const userData = await fetchUserData();
        setState({
          user: userData,
          firebaseUser,
          isAuthenticated: true,
          loading: false,
          error: null,
        });
      } else {
        // User is signed out
        setState({
          user: null,
          firebaseUser: null,
          isAuthenticated: false,
          loading: false,
          error: null,
        });
      }
    });

    return () => unsubscribe();
  }, [fetchUserData]);

  // Login with Google
  const loginWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider || !isConfigured) {
      setState((prev) => ({
        ...prev,
        error: 'Firebase is not configured. Please set up your .env file.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Auth state listener will handle the rest
      console.log('Google sign-in successful:', result.user.email);
    } catch (error) {
      console.error('Google sign-in failed:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to sign in with Google',
      }));
    }
  }, []);

  // Logout
  const logout = useCallback(async () => {
    if (!auth || !isConfigured) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      await firebaseSignOut(auth);
      // Auth state listener will handle the rest
    } catch (error) {
      console.error('Sign out failed:', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to sign out',
      }));
    }
  }, []);

  // Refresh user data
  const refreshUser = useCallback(async () => {
    if (!state.firebaseUser) return;

    const userData = await fetchUserData();
    setState((prev) => ({
      ...prev,
      user: userData,
    }));
  }, [state.firebaseUser, fetchUserData]);

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextType = {
    ...state,
    loginWithGoogle,
    logout,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
