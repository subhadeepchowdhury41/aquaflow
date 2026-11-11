import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '@/api/client';

export interface User {
  id: string;
  email?: string;
  phone: string;
  full_name: string;
  role: string;
  tenant_id?: string;
  branch_id?: string;
  is_super_admin: boolean;
  permissions: string[];
}

export interface LicenseInfo {
  key: string;
  status: 'trial' | 'active' | 'grace_period' | 'expired' | 'suspended';
  expires_at: string | null;
  grace_period_days: number;
  is_operational: boolean;
  restriction_reason?: string | null;
}

interface AuthContextType {
  user: User | null;
  license: LicenseInfo | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  renewLicense: (days: number) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem('aquaflow_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const res = await apiClient.get<User>('/auth/me');
      setUser(res.data);

      // If user belongs to a tenant staff/owner (and not super admin or customer), fetch tenant profile & live license
      if (res.data.tenant_id && !res.data.is_super_admin && res.data.role !== 'customer') {
        try {
          const tenantRes = await apiClient.get('/admin/profile');
          if (tenantRes.data.license) {
            setLicense(tenantRes.data.license);
          }
        } catch (e) {
          console.warn('Could not fetch tenant license state', e);
        }
      }
    } catch (err) {
      console.error('Failed to load profile', err);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const login = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('aquaflow_token', accessToken);
    localStorage.setItem('aquaflow_refresh_token', refreshToken);
    await fetchProfile();
  };

  const logout = () => {
    localStorage.removeItem('aquaflow_token');
    localStorage.removeItem('aquaflow_refresh_token');
    setUser(null);
    setLicense(null);
  };

  const refreshProfile = async () => {
    await fetchProfile();
  };

  const renewLicense = async (days: number) => {
    try {
      const res = await apiClient.post(`/admin/subscriptions/renew?validity_days=${days}`);
      if (res.data.success) {
        await fetchProfile();
        return true;
      }
      return false;
    } catch (e) {
      console.error('License renewal failed', e);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        license,
        isLoading,
        login,
        logout,
        refreshProfile,
        renewLicense,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

