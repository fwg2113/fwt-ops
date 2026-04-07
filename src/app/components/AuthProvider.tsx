'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/app/lib/supabase-browser';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  email: string;
  shopId: number;
  role: string;
  name: string;
  teamMemberId: string | null;
  loginMode: 'user' | 'station';
  rolePermissions: Record<string, boolean>;
  viewPreferences: Record<string, string[]>;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateViewPreferences: (page: string, modules: string[]) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  updateViewPreferences: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowser();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        resolveUser(s.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        resolveUser(s.user);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function resolveUser(authUser: User) {
    try {
      // Look up team member record to get shop_id + role
      const res = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${(await createSupabaseBrowser().auth.getSession()).data.session?.access_token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          shopId: data.shopId,
          role: data.role,
          name: data.name,
          teamMemberId: data.teamMemberId,
          loginMode: data.loginMode || 'user',
          rolePermissions: data.rolePermissions || {},
          viewPreferences: data.viewPreferences || {},
        });
      } else {
        // User exists in auth but not linked to a shop -- shouldn't happen in normal flow
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setLoading(false);
  }

  function updateViewPreferences(page: string, modules: string[]) {
    // Optimistically update local state
    setUser(prev => prev ? {
      ...prev,
      viewPreferences: { ...prev.viewPreferences, [page]: modules },
    } : prev);

    // Persist to server
    (async () => {
      try {
        const s = (await createSupabaseBrowser().auth.getSession()).data.session;
        if (!s?.access_token) return;
        await fetch('/api/auth/preferences', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${s.access_token}`,
          },
          body: JSON.stringify({ page, modules }),
        });
      } catch { /* silent -- local state already updated */ }
    })();
  }

  async function signOut() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, updateViewPreferences }}>
      {children}
    </AuthContext.Provider>
  );
}
