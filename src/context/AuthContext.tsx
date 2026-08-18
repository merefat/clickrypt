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

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.user) {
        setUser(res.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
    }
  };

  const login = async (email: string, masterPass: string): Promise<boolean> => {
    try {
      const res = await api.post('/auth/login', { email, password: masterPass });
      if (res.data?.user) {
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
        setUser(res.data.user);
        setMasterPassword(masterPass);
        await savePrivateKey(privateKey);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Register error:', error);
      return false;
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
    try {
      const res = await api.put('/auth/me', { name, email, avatarUrl });
      if (res.data?.user) {
        setUser(res.data.user);
        return true;
      }
      setUser((prev) => (prev ? { ...prev, name, email, avatarUrl } : null));
      return true;
    } catch (error) {
      setUser((prev) => (prev ? { ...prev, name, email, avatarUrl } : null));
      return true;
    }
  };

  const logout = async () => {
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
