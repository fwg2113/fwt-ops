'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

// ============================================================================
// STATION MODE CONTEXT
// Auto-activates when the logged-in user has login_mode = 'station'.
// Restricted pages show lock icons. PIN escalation grants temporary access.
// Escalated access resets on navigation or after 60s of inactivity.
// ============================================================================

interface EscalatedUser {
  teamMemberId: string;
  name: string;
  role: string;
  permissions: Record<string, boolean>;
}

interface StationContextType {
  isStationMode: boolean;
  basePermissions: Record<string, boolean>;
  escalatedUser: EscalatedUser | null;
  isEscalated: boolean;
  hasPermission: (key: string) => boolean;
  requestEscalation: () => void;
  clearEscalation: () => void;
  showPinOverlay: boolean;
  onPinSuccess: (user: EscalatedUser) => void;
  dismissPinOverlay: () => void;
}

const StationContext = createContext<StationContextType>({
  isStationMode: false,
  basePermissions: {},
  escalatedUser: null,
  isEscalated: false,
  hasPermission: () => true,
  requestEscalation: () => {},
  clearEscalation: () => {},
  showPinOverlay: false,
  onPinSuccess: () => {},
  dismissPinOverlay: () => {},
});

export function useStationMode() {
  return useContext(StationContext);
}

const ESCALATION_TIMEOUT = 60000; // 60 seconds

export default function StationModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [escalatedUser, setEscalatedUser] = useState<EscalatedUser | null>(null);
  const [showPinOverlay, setShowPinOverlay] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathnameRef = useRef(pathname);

  // Detect station mode from logged-in user
  const isStationMode = user?.loginMode === 'station';
  const basePermissions = isStationMode ? (user?.rolePermissions || {}) : {};

  // Reset escalation on navigation
  useEffect(() => {
    if (prevPathnameRef.current !== pathname && escalatedUser) {
      setEscalatedUser(null);
    }
    prevPathnameRef.current = pathname;
  }, [pathname, escalatedUser]);

  // Inactivity timer
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (escalatedUser) {
      timerRef.current = setTimeout(() => {
        setEscalatedUser(null);
      }, ESCALATION_TIMEOUT);
    }
  }, [escalatedUser]);

  useEffect(() => {
    if (!isStationMode || !escalatedUser) return;

    resetTimer();
    const events = ['touchstart', 'mousedown', 'keydown', 'scroll'];
    const handler = () => resetTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStationMode, escalatedUser, resetTimer]);

  function hasPermission(key: string): boolean {
    if (!isStationMode) return true;
    // Base permission allows it
    if (basePermissions[key]) return true;
    if (basePermissions.full_access) return true;
    // Escalated user has access
    if (escalatedUser) {
      if (escalatedUser.permissions.full_access) return true;
      if (escalatedUser.permissions[key]) return true;
    }
    return false;
  }

  function requestEscalation() {
    setShowPinOverlay(true);
  }

  function onPinSuccess(u: EscalatedUser) {
    setEscalatedUser(u);
    setShowPinOverlay(false);
  }

  function dismissPinOverlay() {
    setShowPinOverlay(false);
  }

  function clearEscalation() {
    setEscalatedUser(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }

  return (
    <StationContext.Provider value={{
      isStationMode,
      basePermissions,
      escalatedUser,
      isEscalated: !!escalatedUser,
      hasPermission,
      requestEscalation,
      clearEscalation,
      showPinOverlay,
      onPinSuccess,
      dismissPinOverlay,
    }}>
      {children}
    </StationContext.Provider>
  );
}
