/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '@/lib/api';
import { generateKeyPair, reencryptPrivateKey, protectPrivateKey, unprotectPrivateKey, canUnlockPrivateKey } from '@/lib/crypto';
import { savePrivateKey, getPrivateKey, clearKeys, saveUnlockedPrivateKey, getUnlockedPrivateKey } from '@/lib/secureStorage';
import { useRouter } from 'next/navigation';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'Owner' | 'Admin' | 'User' | 'External';
  accountMode?: 'personal' | 'organization';
  twoFactorEnabled?: boolean;
  publicKey?: string;
  encryptedPrivateKey?: string;
  avatarUrl?: string;
  organization?: {
    id: string;
    domain: string;
    verificationStatus: 'pending' | 'verified';
    openEnrollment: boolean;
  } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  masterPassword: string | null;
  unlockedPgpKey: string | null;
  appMode: 'personal' | 'organization';
  setAppMode: (mode: 'personal' | 'organization') => void;
  login: (email: string, masterPassword: string) => Promise<{ success: boolean; requires2FA?: boolean; challengeToken?: string; email?: string }>;
  complete2FALogin: (payload: { user: UserProfile; token: string; masterPassword?: string; unlockedPgpKey?: string | null }) => Promise<void>;
  hydrateSession: (payload: { user: UserProfile; token?: string; masterPassword?: string; unlockedPgpKey?: string | null }) => Promise<void>;
  verify2FALogin: (email: string, code: string, masterPassword: string, unlockedPgpKey?: string | null) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    masterPassword: string,
    role?: 'Owner' | 'Admin' | 'User' | 'External',
    organizationDomain?: string
  ) => Promise<{ success: boolean; requiresVerification?: boolean; email?: string; user?: UserProfile }>;
  resendVerificationCode: (email: string) => Promise<{ success: boolean; error?: string }>;
  updateMasterPassword: (newMasterPass: string, oldMasterPass?: string) => Promise<void>;
  updateProfile: (name: string, email: string, avatarUrl?: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  getEncryptedPrivateKey: () => Promise<string | null>;
  setUnlockedPgpKey: (key: string | null) => void;
  unlockVault: (password: string) => Promise<string | null>;
  isLoading: boolean;
  isHydrating: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);
  const [unlockedPgpKey, setUnlockedPgpKey] = useState<string | null>(null);
  const [appModeState, setAppModeState] = useState<'personal' | 'organization'>('personal');
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrating, setIsHydrating] = useState(false);

  const loadUnlockedPrivateKey = async (mode: 'personal' | 'organization') => {
    try {
      if (typeof window === 'undefined') return;
      const cached = await getUnlockedPrivateKey(mode);
      if (cached) setUnlockedPgpKey(cached);
    } catch (e) {
      console.warn('Failed to load unlocked private key:', e);
    }
  };

  const unlockAndCachePrivateKey = async (
    passphrase: string,
    mode: 'personal' | 'organization',
    encryptedKeyArmored?: string
  ): Promise<boolean> => {
    try {
      const encryptedKey = encryptedKeyArmored || user?.encryptedPrivateKey || await getPrivateKey();
      if (!encryptedKey) return false;
      const unlocked = await unprotectPrivateKey(encryptedKey, passphrase);
      setUnlockedPgpKey(unlocked);
      if (typeof window !== 'undefined') {
        await saveUnlockedPrivateKey(unlocked, mode);
      }
      return true;
    } catch (e) {
      console.warn('Failed to unlock PGP key:', e);
      return false;
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mode = (localStorage.getItem('clickrypt_app_mode') as 'personal' | 'organization') || 'personal';
      setAppModeState(mode);
    }
    setIsLoading(true);
    fetchSession().finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetchSession();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const setAppMode = (mode: 'personal' | 'organization') => {
    setAppModeState(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('clickrypt_app_mode', mode);
    }
    fetchSession();
  };

  const fetchSession = async (modeOverride?: 'personal' | 'organization') => {
    setIsHydrating(true);
    const currentMode =
      modeOverride ||
      (typeof window !== 'undefined' ? (localStorage.getItem('clickrypt_app_mode') as 'personal' | 'organization') || 'personal' : 'personal');
    if (modeOverride && typeof window !== 'undefined') {
      localStorage.setItem('clickrypt_app_mode', currentMode);
    }
    try {
      const res = await api.get(`/auth/me?mode=${currentMode}`);
      if (res.data?.user) {
        const serverMode = (res.data.user.accountMode as 'personal' | 'organization') || currentMode;
        if (serverMode !== currentMode && !modeOverride) {
          setAppModeState(serverMode);
          if (typeof window !== 'undefined') {
            localStorage.setItem('clickrypt_app_mode', serverMode);
          }
          await fetchSession(serverMode);
          return;
        }
        setUser(res.data.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem(`clickrypt_user_profile_${currentMode}`, JSON.stringify(res.data.user));
        }
        await loadUnlockedPrivateKey(currentMode);
        if (
          res.data.user.accountMode === 'organization' &&
          res.data.user.organization?.verificationStatus === 'pending' &&
          res.data.user.role === 'Owner'
        ) {
          router.push('/verify-organization');
        }
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          const hasToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
          if (hasToken) {
            // Token is no longer valid (suspended/invalid) — force lock out
            sessionStorage.removeItem('access_token');
            localStorage.removeItem('access_token');
            localStorage.removeItem('clickrypt_user_profile_personal');
            localStorage.removeItem('clickrypt_user_profile_organization');
            localStorage.removeItem(`clickrypt_user_profile_${currentMode}`);
            delete api.defaults.headers.common['Authorization'];
            clearKeys().catch(() => {});
            if (window.location.pathname !== '/login') {
              window.location.replace('/login');
            }
          }
        }
      }
    } catch {
      if (typeof window !== 'undefined' && !navigator.onLine) {
        const savedUser = localStorage.getItem(`clickrypt_user_profile_${currentMode}`);
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
            await loadUnlockedPrivateKey(currentMode);
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
        if (typeof window !== 'undefined') {
          const hasToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
          if (hasToken) {
            sessionStorage.removeItem('access_token');
            localStorage.removeItem('access_token');
            localStorage.removeItem('clickrypt_user_profile_personal');
            localStorage.removeItem('clickrypt_user_profile_organization');
            localStorage.removeItem(`clickrypt_user_profile_${currentMode}`);
            delete api.defaults.headers.common['Authorization'];
            clearKeys().catch(() => {});
            if (window.location.pathname !== '/login') {
              window.location.replace('/login');
            }
          }
        }
      }
    } finally {
      setIsHydrating(false);
    }
  };

  const hydrateSession = async ({
    user: userObj,
    token,
    masterPassword: masterPass,
    unlockedPgpKey: unlocked,
  }: {
    user: UserProfile;
    token?: string;
    masterPassword?: string;
    unlockedPgpKey?: string | null;
  }) => {
    setIsHydrating(true);
    try {
      const serverMode = (userObj.accountMode as 'personal' | 'organization') || 'personal';

      setUser(userObj);
      setAppModeState(serverMode);
      if (masterPass) {
        setMasterPassword(masterPass);
      }
      if (unlocked !== undefined) {
        setUnlockedPgpKey(unlocked);
        if (unlocked && typeof window !== 'undefined') {
          await saveUnlockedPrivateKey(unlocked, serverMode);
        }
      } else if (masterPass) {
        await unlockAndCachePrivateKey(masterPass, serverMode, userObj.encryptedPrivateKey);
      }

      if (typeof window !== 'undefined') {
        if (token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          try {
            sessionStorage.setItem('access_token', token);
            localStorage.setItem('access_token', token);
          } catch (e) {
            console.warn('Token storage unavailable:', e);
          }
        }
        try {
          localStorage.setItem('clickrypt_app_mode', serverMode);
          localStorage.setItem(`clickrypt_user_profile_${serverMode}`, JSON.stringify(userObj));
        } catch (e) {
          console.warn('Profile storage unavailable:', e);
        }
      }

      if (userObj.encryptedPrivateKey) {
        try {
          await savePrivateKey(userObj.encryptedPrivateKey);
        } catch (e) {
          console.warn('Private key cache unavailable:', e);
        }
      }
    } finally {
      setIsHydrating(false);
    }
  };

  const complete2FALogin = async ({
    user: userObj,
    token,
    masterPassword: masterPass,
    unlockedPgpKey: unlocked,
  }: {
    user: UserProfile;
    token: string;
    masterPassword?: string;
    unlockedPgpKey?: string | null;
  }) => {
    await hydrateSession({
      user: userObj,
      token,
      masterPassword: masterPass,
      unlockedPgpKey: unlocked,
    });
  };

  const login = async (
    email: string,
    masterPass: string
  ): Promise<{ success: boolean; requires2FA?: boolean; challengeToken?: string; email?: string }> => {
    try {
      const res = await api.post('/auth/login', { email, password: masterPass });

      if (res.data?.requires2FA) {
        return {
          success: true,
          requires2FA: true,
          challengeToken: res.data.challengeToken,
          email: res.data.email || email,
        };
      }

      if (res.data?.user) {
        await hydrateSession({ user: res.data.user, token: res.data.token, masterPassword: masterPass });
        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const verify2FALogin = async (
    email: string,
    code: string,
    masterPass: string,
    unlockedPgpKey?: string | null
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.post('/auth/2fa/login-verify', { email, code });

      if (res.data?.user && res.data?.token) {
        await hydrateSession({
          user: res.data.user,
          token: res.data.token,
          masterPassword: masterPass,
          unlockedPgpKey,
        });
        return { success: true };
      }
      return { success: false, error: res.data?.error || 'Two-factor authentication failed.' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('2FA login verify error:', error);
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Invalid or expired 2FA code.',
      };
    }
  };

  const register = async (
    name: string,
    email: string,
    masterPass: string,
    role?: 'Owner' | 'Admin' | 'User' | 'External',
    organizationDomain?: string
  ): Promise<{ success: boolean; requiresVerification?: boolean; email?: string; user?: UserProfile }> => {
    const currentMode = (typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'personal' : 'personal') as 'personal' | 'organization';
    try {
      const { privateKey, publicKey } = await generateKeyPair(email, masterPass);
      const res = await api.post('/auth/register', {
        name,
        email,
        password: masterPass,
        role: role || 'User',
        publicKey,
        encryptedPrivateKey: privateKey,
        accountMode: currentMode,
        organizationDomain: currentMode === 'organization' ? organizationDomain : undefined,
      });

      if (res.data?.requiresVerification) {
        return { success: true, requiresVerification: true, email };
      }

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
        await unlockAndCachePrivateKey(masterPass, currentMode, privateKey);
        return { success: true, user: res.data.user };
      }
      throw new Error(res.data?.error || 'Registration failed');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error || error?.message || 'Registration failed';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = new Error(message) as any;
      err.status = status || 0;
      if (!status || status >= 500) {
        console.error('Register error:', error);
      }
      throw err;
    }
  };

  const resendVerificationCode = async (email: string) => {
    try {
      const res = await api.post('/auth/resend-verification', { email });
      return { success: res.data?.success || false, error: res.data?.error };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to resend code',
      };
    }
  };

  const updateMasterPassword = async (newMasterPass: string, oldMasterPass?: string) => {
    if (!user) return;
    const oldPass = oldMasterPass ?? masterPassword;
    let sourceKey: string | null = null;
    if (unlockedPgpKey) {
      sourceKey = unlockedPgpKey;
    } else if (user.encryptedPrivateKey) {
      sourceKey = user.encryptedPrivateKey;
    } else {
      sourceKey = await getPrivateKey();
    }
    if (!sourceKey) return;

    try {
      const reencrypted = unlockedPgpKey
        ? await protectPrivateKey(sourceKey, newMasterPass)
        : oldPass
          ? await reencryptPrivateKey(sourceKey, oldPass, newMasterPass)
          : await protectPrivateKey(sourceKey, newMasterPass);

      setMasterPassword(newMasterPass);
      const updated = { ...user, encryptedPrivateKey: reencrypted };
      setUser(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(`clickrypt_user_profile_${appModeState}`, JSON.stringify(updated));
        } catch (e) {
          console.warn('Profile storage unavailable:', e);
        }
      }
      await savePrivateKey(reencrypted);
      await unlockAndCachePrivateKey(newMasterPass, appModeState, reencrypted);
    } catch (e) {
      console.warn('Key re-encryption error:', e);
    }
  };

  const updateProfile = async (name: string, email: string, avatarUrl?: string): Promise<boolean> => {
    const currentMode = typeof window !== 'undefined' ? localStorage.getItem('clickrypt_app_mode') || 'personal' : 'personal';
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
    setUnlockedPgpKey(null);
    delete api.defaults.headers.common['Authorization'];
    await clearKeys();
    if (typeof window !== 'undefined') {
      window.location.replace('/login');
    }
  };

  const unlockVault = async (password: string): Promise<string | null> => {
    const encryptedKey = user?.encryptedPrivateKey || (await getPrivateKey());
    if (!encryptedKey) return null;
    const ok = await canUnlockPrivateKey(encryptedKey, password);
    if (!ok) return null;
    try {
      const unlocked = await unprotectPrivateKey(encryptedKey, password);
      setMasterPassword(password);
      setUnlockedPgpKey(unlocked);
      if (typeof window !== 'undefined') {
        await saveUnlockedPrivateKey(unlocked, appModeState);
      }
      return unlocked;
    } catch {
      return null;
    }
  };

  const getEncryptedPrivateKey = async () => {
    if (unlockedPgpKey) return unlockedPgpKey;
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
        unlockedPgpKey,
        setUnlockedPgpKey,
        login,
        complete2FALogin,
        hydrateSession,
        verify2FALogin,
        register,
        resendVerificationCode,
        updateMasterPassword,
        updateProfile,
        logout,
        refreshUser: () => fetchSession(),
        getEncryptedPrivateKey,
        unlockVault,
        isLoading,
        isHydrating,
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

export function useRequireAuth() {
  const { isLoading, isAuthenticated, isHydrating } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isHydrating) return;
    if (typeof window !== 'undefined' && !isAuthenticated) {
      const hasToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      if (!hasToken) {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, isHydrating, router]);
}
