'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

// Shop tabs
import ShopInfoTab from './tabs/ShopInfoTab';
import BrandsTab from './tabs/BrandsTab';
import ModulesTab from './tabs/ModulesTab';
import AppearanceTab from './tabs/AppearanceTab';
import TeamTab from './tabs/TeamTab';

// Operations tabs
import ScheduleTab from './tabs/ScheduleTab';
import ClosedDatesTab from './tabs/ClosedDatesTab';
import NotificationsTab from './tabs/NotificationsTab';
import CheckoutTab from './tabs/CheckoutTab';
import ActionButtonsTab from './tabs/ActionButtonsTab';
import PaymentTab from './tabs/PaymentTab';
import DiscountsWarrantyTab from './tabs/DiscountsWarrantyTab';

// Auto Tint module tabs
import AutoTintBookingTab from './tabs/AutoTintBookingTab';
import ServicesTab from './tabs/ServicesTab';
import FilmsTab from './tabs/FilmsTab';
import VehiclesTab from './tabs/VehiclesTab';

type TabKey =
  | 'shop-info' | 'brands' | 'modules' | 'appearance' | 'team'
  | 'schedule' | 'closed-dates' | 'notifications' | 'checkout' | 'action-buttons' | 'payment' | 'discounts'
  | 'auto-tint-booking' | 'auto-tint-services' | 'auto-tint-films' | 'auto-tint-vehicles';

interface NavSection {
  title: string;
  items: { key: TabKey; label: string }[];
  moduleKey?: string;
}

interface ShopModule {
  enabled: boolean;
  service_modules: { module_key: string; label: string; color: string };
}

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabKey>('shop-info');
  const [settingsData, setSettingsData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auto/settings')
      .then(r => r.json())
      .then(d => { setSettingsData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const enabledModules = useMemo(() => {
    if (!settingsData) return new Set<string>();
    const modules = (settingsData.shopModules || []) as ShopModule[];
    return new Set(modules.filter(m => m.enabled).map(m => m.service_modules.module_key));
  }, [settingsData]);

  const NAV_SECTIONS: NavSection[] = useMemo(() => [
    {
      title: 'SHOP',
      items: [
        { key: 'shop-info', label: 'Shop Info' },
        { key: 'brands', label: 'Brands' },
        { key: 'modules', label: 'Modules' },
        { key: 'team', label: 'Team' },
        { key: 'appearance', label: 'Appearance' },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { key: 'schedule', label: 'Schedule' },
        { key: 'closed-dates', label: 'Closed Dates' },
        { key: 'notifications', label: 'Notifications' },
        { key: 'checkout', label: 'Checkout' },
        { key: 'action-buttons', label: 'Action Buttons' },
        { key: 'payment', label: 'Payment' },
        { key: 'discounts', label: 'Discounts & Warranty' },
      ],
    },
    {
      title: 'AUTO TINT',
      moduleKey: 'auto_tint',
      items: [
        { key: 'auto-tint-booking', label: 'Booking Config' },
        { key: 'auto-tint-services', label: 'Services' },
        { key: 'auto-tint-films', label: 'Films & Pricing' },
        { key: 'auto-tint-vehicles', label: 'Vehicles' },
      ],
    },
  ], []);

  const visibleSections = useMemo(() =>
    NAV_SECTIONS.filter(s => !s.moduleKey || enabledModules.has(s.moduleKey)),
    [NAV_SECTIONS, enabledModules]
  );

  useEffect(() => {
    const allKeys = visibleSections.flatMap(s => s.items.map(i => i.key));
    if (!allKeys.includes(activeTab)) setActiveTab('shop-info');
  }, [visibleSections, activeTab]);

  // Generic save/add/delete helpers
  async function saveSettings(table: string, id: number | null, data: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch('/api/auto/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id, data }),
      });
      const result = await res.json();
      return result.success === true;
    } catch { return false; }
  }

  async function addSettings(table: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch('/api/auto/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, data }),
      });
      const result = await res.json();
      return result.success ? result.data : null;
    } catch { return null; }
  }

  async function deleteSettings(table: string, id: number): Promise<boolean> {
    try {
      const res = await fetch('/api/auto/settings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id }),
      });
      const result = await res.json();
      return result.success === true;
    } catch { return false; }
  }

  function refreshSettings() {
    fetch('/api/auto/settings')
      .then(r => r.json())
      .then(setSettingsData)
      .catch(() => {});
  }

  function getModuleColor(moduleKey: string): string {
    if (!settingsData) return COLORS.red;
    const modules = (settingsData.shopModules || []) as ShopModule[];
    const mod = modules.find(m => m.service_modules.module_key === moduleKey);
    return mod?.service_modules.color || COLORS.red;
  }

  return (
    <div>
      <PageHeader title="System" titleAccent="Settings" subtitle="Account" />

      {/* Mobile: Tab dropdown */}
      {isMobile && (
        <div style={{ marginBottom: SPACING.lg }}>
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as TabKey)}
            style={{
              width: '100%', padding: '12px 16px',
              background: COLORS.inputBg, color: COLORS.textPrimary,
              border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
              fontSize: FONT.sizeSm, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            {visibleSections.map(section => (
              <optgroup key={section.title} label={section.title}>
                {section.items.map(item => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', gap: SPACING.xl, minHeight: isMobile ? 0 : 600 }}>
        {/* Left Sidebar Nav (desktop only) */}
        {!isMobile && <nav style={{
          width: 200,
          flexShrink: 0,
          borderRight: `1px solid ${COLORS.border}`,
          paddingRight: SPACING.lg,
        }}>
          {visibleSections.map((section, sIdx) => (
            <div key={section.title} style={{ marginBottom: SPACING.lg }}>
              {sIdx > 0 && (
                <div style={{
                  height: 1,
                  background: COLORS.border,
                  margin: `${SPACING.sm}px 0 ${SPACING.md}px`,
                }} />
              )}
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                padding: `0 ${SPACING.sm}px ${SPACING.sm}px`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                {section.moduleKey && (
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: getModuleColor(section.moduleKey),
                    flexShrink: 0,
                  }} />
                )}
                {section.title}
              </div>
              {section.items.map(item => {
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: `${SPACING.sm}px ${SPACING.md}px`,
                      background: isActive ? COLORS.activeBg : 'transparent',
                      color: isActive ? COLORS.red : COLORS.textSecondary,
                      border: 'none',
                      borderLeft: isActive ? `3px solid ${COLORS.red}` : '3px solid transparent',
                      borderRadius: `0 ${RADIUS.sm}px ${RADIUS.sm}px 0`,
                      cursor: 'pointer',
                      fontSize: FONT.sizeSm,
                      fontWeight: isActive ? FONT.weightSemibold : FONT.weightMedium,
                      transition: 'all 0.15s',
                      marginBottom: 2,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>}

        {/* Content Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading settings...</div>
          ) : !settingsData ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Failed to load settings.</div>
          ) : (
            <>
              {/* Shop */}
              {activeTab === 'shop-info' && (
                <ShopInfoTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'brands' && (
                <BrandsTab data={settingsData} onSave={saveSettings} onAdd={addSettings} onDelete={deleteSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'modules' && (
                <ModulesTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'team' && (
                <TeamTab data={settingsData} onRefresh={refreshSettings} />
              )}
              {activeTab === 'appearance' && (
                <AppearanceTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}

              {/* Operations */}
              {activeTab === 'schedule' && (
                <ScheduleTab data={settingsData} onSave={saveSettings} onAdd={addSettings} onDelete={deleteSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'closed-dates' && (
                <ClosedDatesTab data={settingsData} onAdd={addSettings} onDelete={deleteSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'notifications' && (
                <NotificationsTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'checkout' && (
                <CheckoutTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'action-buttons' && (
                <ActionButtonsTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'payment' && (
                <PaymentTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'discounts' && (
                <DiscountsWarrantyTab data={settingsData} onSave={saveSettings} onAdd={addSettings} onDelete={deleteSettings} onRefresh={refreshSettings} />
              )}

              {/* Auto Tint */}
              {activeTab === 'auto-tint-booking' && (
                <AutoTintBookingTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'auto-tint-services' && (
                <ServicesTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'auto-tint-films' && (
                <FilmsTab data={settingsData} onSave={saveSettings} onRefresh={refreshSettings} />
              )}
              {activeTab === 'auto-tint-vehicles' && (
                <VehiclesTab />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
