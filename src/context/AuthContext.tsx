'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/lib/api';
import { generateKeyPair } from '@/lib/crypto';
import { savePrivateKey, getPrivateKey, clearKeys } from '@/lib/secureStorage';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Admin' | 'User' | 'External';
  publicKey?: string;
  encryptedPrivateKey?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  masterPassword: string | null;
  appMode: 'personal' | 'organization';
  setAppMode: (mode: 'personal' | 'organization') => void;
  login: (email: string, masterPassword: string) => Promise<boolean>;
  register: (name: string, email: string, masterPassword: string, role?: 'Owner' | 'Admin' | 'User' | 'External') => Promise<boolean>;
  updateMasterPassword: (newMasterPass: string) => Promise<void>;
  updateProfile: (name: string, email: string, avatarUrl?: string) => Promise<boolean>;
  logout: () => void;
  getEncryptedPrivateKey: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [masterPassword, setMasterPassword] = useState<string | null>('password'); // default for quick demo access
  const [appModeState, setAppModeState] = useState<'personal' | 'organization'>('organization');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mode = (localStorage.getItem('clickrypt_app_mode') as 'personal' | 'organization') || 'organization';
      setAppModeState(mode);
    }
    fetchSession();
  }, []);

  const setAppMode = (mode: 'personal' | 'organization') => {
    setAppModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('clickrypt_app_mode', mode);
    }
    fetchSession();
  };

  const fetchSession = async () => {
    const currentMode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'organization' : 'organization';
    let cachedUser: UserProfile | null = null;
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`clickrypt_user_profile_${currentMode}`);
      if (savedUser) {
        try {
          cachedUser = JSON.parse(savedUser);
          setUser(cachedUser);
        } catch (e) {}
      }
    }
    try {
      const res = await api.get(`/auth/me?mode=${currentMode}`);
      if (res.data?.user) {
        const mergedUser = cachedUser
          ? {
              ...res.data.user,
              name: cachedUser.name || res.data.user.name,
              email: cachedUser.email || res.data.user.email,
              avatarUrl: cachedUser.avatarUrl !== undefined ? cachedUser.avatarUrl : res.data.user.avatarUrl,
            }
          : res.data.user;
        setUser(mergedUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(mergedUser));
        }
      }
    } catch (error) {
      // Keep cached profile if offline
    }
  };

  const login = async (email: string, masterPass: string): Promise<boolean> => {
    const currentMode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'organization' : 'organization';
    try {
      const res = await api.post('/auth/login', { email, password: masterPass });
      if (res.data?.user) {
        if (typeof window !== 'undefined') {
          if (res.data.token) {
            sessionStorage.setItem('access_token', res.data.token);
            localStorage.setItem('access_token', res.data.token);
          }
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(res.data.user));
        }
        setUser(res.data.user);
        setMasterPassword(masterPass);
        if (res.data.user.encryptedPrivateKey) {
          await savePrivateKey(res.data.user.encryptedPrivateKey);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (name: string, email: string, masterPass: string, role?: 'Owner' | 'Admin' | 'User' | 'External'): Promise<boolean> => {
    const currentMode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'organization' : 'organization';
    try {
      // 1. Generate client-side PGP keys
      const { privateKey, publicKey } = await generateKeyPair(email, masterPass);

      // 2. Post registration to backend
      const res = await api.post('/auth/register', {
        name,
        email,
        password: masterPass,
        role: role || 'User',
        publicKey,
        encryptedPrivateKey: privateKey,
      });

      if (res.data?.user) {
        if (typeof window !== 'undefined') {
          if (res.data.token) {
            sessionStorage.setItem('access_token', res.data.token);
            localStorage.setItem('access_token', res.data.token);
          }
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(res.data.user));
        }
        setUser(res.data.user);
        setMasterPassword(masterPass);
        await savePrivateKey(privateKey);
        return true;
      }
      throw new Error(res.data?.error || 'Registration failed');
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error || error?.message || 'Registration failed';
      const err = new Error(message) as any;
      err.status = status || 0;
      if (!status || status >= 500) {
        console.error('Register error:', error);
      }
      throw err;
    }
  };

  const updateMasterPassword = async (newMasterPass: string) => {
    setMasterPassword(newMasterPass);
    if (user?.email) {
      try {
        const { privateKey } = await generateKeyPair(user.email, newMasterPass);
        await savePrivateKey(privateKey);
      } catch (e) {
        console.warn('Key re-encryption error:', e);
      }
    }
  };

  const updateProfile = async (name: string, email: string, avatarUrl?: string): Promise<boolean> => {
    const currentMode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'organization' : 'organization';
    try {
      const res = await api.put('/auth/me', { name, email, avatarUrl, mode: currentMode });
      const updatedUser = res.data?.user || (user ? { ...user, name, email, avatarUrl } : null);
      if (updatedUser) {
        setUser(updatedUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(updatedUser));
        }
        return true;
      }
      return false;
    } catch (error) {
      if (user) {
        const updatedUser = { ...user, name, email, avatarUrl };
        setUser(updatedUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(updatedUser));
        }
      }
      return true;
    }
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('access_token');
      localStorage.removeItem('access_token');
      localStorage.removeItem('clickrypt_user_profile');
      localStorage.removeItem('clickrypt_user_profile_personal');
      localStorage.removeItem('clickrypt_user_profile_organization');
    }
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // ignore
    }
    setUser(null);
    setMasterPassword(null);
    await clearKeys();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const getEncryptedPrivateKey = async () => {
    if (user?.encryptedPrivateKey) return user.encryptedPrivateKey;
    return await getPrivateKey();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        masterPassword,
        appMode: appModeState,
        setAppMode,
        login,
        register,
        updateMasterPassword,
        updateProfile,
        logout,
        getEncryptedPrivateKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
