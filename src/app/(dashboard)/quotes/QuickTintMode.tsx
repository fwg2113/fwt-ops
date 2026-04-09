'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardCard, Button, FormField, SelectInput, TextInput, Modal, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import type { BulkConfig, AutoVehicle, AutoVehiclePricingOverride } from '@/app/components/booking/types';
import { calculateServicePrice, calculateAlaCartePrice, getAvailableFilms, getAddFee, getAllowedShades, needsSplitShades } from '@/app/components/booking/pricing';
import { SendToCustomerModal, type SelectedRow } from './QuickTintModals';

interface Props {
  onExit: () => void;
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialCustomerEmail?: string;
}

// Table styles
const thStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
  textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.textMuted,
  borderBottom: `2px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`, fontSize: FONT.sizeSm,
  borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};

export default function QuickTintMode({ onExit, initialCustomerName, initialCustomerPhone, initialCustomerEmail }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showBookConfirm, setShowBookConfirm] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [bookingDirect, setBookingDirect] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [bookPath, setBookPath] = useState<'schedule' | 'tailored'>('schedule');
  const [showPreview, setShowPreview] = useState(false);
  const [optionsMode, setOptionsMode] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Customer
  const [customerName, setCustomerName] = useState(initialCustomerName || '');
  const [customerPhone, setCustomerPhone] = useState(initialCustomerPhone || '');
  const [customerEmail, setCustomerEmail] = useState(initialCustomerEmail || '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string; phone: string; email: string | null }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // YMM
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Services
  const [selectedRows, setSelectedRows] = useState<SelectedRow[]>([]);

  // Scheduling (on main screen)
  const [appointmentType, setAppointmentType] = useState('dropoff');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [dayAppointments, setDayAppointments] = useState<{
    customer_name: string; appointment_time: string | null; appointment_type: string;
    vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null;
    status: string; duration_minutes: number | null; services_json?: unknown; id: string;
  }[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [daySummary, setDaySummary] = useState<{ total: number; dropoffs: number; waiting: number; headsups: number } | null>(null);

  // Shade section collapsed by default
  const [shadesExpanded, setShadesExpanded] = useState(false);

  // Deposit override for "Send as Tailored Quote" path
  const [depositOverride, setDepositOverride] = useState<number | null>(null);
  const [overrideDeposit, setOverrideDeposit] = useState(false);
  const [tailoredSendMethod, setTailoredSendMethod] = useState<'sms' | 'email' | 'copy'>('copy');
  const [tailoredSentVia, setTailoredSentVia] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/auto/config').then(r => r.json()),
      fetch('/api/auto/customers').then(r => r.json()),
    ]).then(([configData, custData]) => {
      setConfig(configData as BulkConfig);
      setCustomers(Array.isArray(custData) ? custData : custData.customers || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Ghost cards for MiniTimeline preview
  const ghostCards = useMemo(() => {
    if (!selectedTime || selectedRows.length === 0 || !config) return [];
    const vehicleLabel = selectedYear && selectedMake && selectedModel
      ? `${selectedYear} ${selectedMake} ${selectedModel}` : 'New Vehicle';

    // Build a map of serviceKey -> duration_minutes from config
    const durationMap = new Map<string, number>();
    for (const svc of config.services) {
      durationMap.set(svc.service_key, svc.duration_minutes || 60);
    }

    // Identify primary vs add-on service keys in selectedRows
    const primaryKeys = new Set(config.services.filter(s => s.is_primary).map(s => s.service_key));
    const selectedPrimaries = selectedRows.filter(r => primaryKeys.has(r.serviceKey));
    const selectedAddons = selectedRows.filter(r => !primaryKeys.has(r.serviceKey));

    // Add-on duration: sum of unique add-on service keys
    const uniqueAddonKeys = new Set(selectedAddons.map(r => r.serviceKey));
    const addonDuration = [...uniqueAddonKeys].reduce((sum, key) => sum + (durationMap.get(key) || 0), 0);
    const addonLabels = [...uniqueAddonKeys].map(key => {
      const row = selectedAddons.find(r => r.serviceKey === key);
      return row?.label || key;
    });

    if (optionsMode && selectedPrimaries.length > 1) {
      // Options mode with multiple primaries: one ghost card per unique primary serviceKey
      const uniquePrimaryKeys = [...new Set(selectedPrimaries.map(r => r.serviceKey))];
      return uniquePrimaryKeys.map((pKey, i) => {
        const primaryRow = selectedPrimaries.find(r => r.serviceKey === pKey)!;
        const primaryDuration = durationMap.get(pKey) || 60;
        const allLabels = [primaryRow.label, ...addonLabels];
        return {
          time: selectedTime,
          durationMinutes: primaryDuration + addonDuration,
          label: vehicleLabel,
          services: allLabels.join(' + '),
          optionLabel: `Opt ${i + 1}`,
        };
      });
    }

    // Normal mode or single primary: one ghost card with unique service durations
    const uniqueServiceKeys = new Set(selectedRows.map(r => r.serviceKey));
    const totalDuration = [...uniqueServiceKeys].reduce((sum, key) => sum + (durationMap.get(key) || 60), 0);
    const serviceLabels = [...uniqueServiceKeys].map(key => {
      const row = selectedRows.find(r => r.serviceKey === key);
      return row?.label || key;
    });

    return [{
      time: selectedTime,
      durationMinutes: totalDuration,
      label: vehicleLabel,
      services: serviceLabels.join(' + '),
    }];
  }, [selectedTime, selectedRows, selectedYear, selectedMake, selectedModel, config, optionsMode]);

  // Fetch day schedule when date changes
  useEffect(() => {
    if (!selectedDate) { setDayAppointments([]); setDaySummary(null); return; }
    setLoadingDay(true);
    fetch(`/api/auto/appointments?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        setDayAppointments(
          (data.appointments || [])
            .filter((a: { status: string }) => a.status !== 'cancelled')
            .sort((a: { appointment_time: string | null }, b: { appointment_time: string | null }) =>
              (a.appointment_time || '99:99').localeCompare(b.appointment_time || '99:99'))
        );
        setDaySummary(data.summary || null);
      })
      .catch(() => { setDayAppointments([]); setDaySummary(null); })
      .finally(() => setLoadingDay(false));
  }, [selectedDate]);

  // YMM cascade
  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const all = new Set<number>();
    config.vehicles.forEach(v => { for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) all.add(y); });
    return Array.from(all).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !selectedYear) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end) set.add(v.make); });
    return Array.from(set).sort();
  }, [config, selectedYear]);

  const models = useMemo(() => {
    if (!config || !selectedYear || !selectedMake) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end && v.make === selectedMake) set.add(v.model); });
    return Array.from(set).sort();
  }, [config, selectedYear, selectedMake]);

  const vehicle = useMemo<AutoVehicle | null>(() => {
    if (!config || !selectedYear || !selectedMake || !selectedModel) return null;
    const year = parseInt(selectedYear);
    return config.vehicles.find(v =>
      v.make === selectedMake && v.model === selectedModel && year >= v.year_start && year <= v.year_end
    ) || null;
  }, [config, selectedYear, selectedMake, selectedModel]);

  const films = useMemo(() => {
    if (!config) return [];
    return vehicle ? getAvailableFilms(vehicle, config.films) : config.films;
  }, [config, vehicle]);

  const tintServices = useMemo(() => {
    if (!config) return [];
    return config.services.filter(s => s.enabled && s.service_type === 'tint').sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const removalServices = useMemo(() => {
    if (!config) return [];
    return config.services.filter(s => s.enabled && s.service_type === 'removal').sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const alaCarteServices = useMemo(() => {
    if (!config) return [];
    return config.services.filter(s => s.enabled && s.service_type === 'alacarte').sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const priceMatrix = useMemo(() => {
    if (!config || !vehicle) return null;
    const matrix: Record<string, Record<number, number>> = {};
    for (const svc of tintServices) {
      matrix[svc.service_key] = {};
      for (const film of films) {
        matrix[svc.service_key][film.id] = calculateServicePrice(vehicle, svc.service_key, film.id, config.pricing, config.vehicleClasses, config.vehiclePricingOverrides as AutoVehiclePricingOverride[]);
      }
    }
    for (const svc of removalServices) {
      matrix[svc.service_key] = {};
      matrix[svc.service_key][0] = calculateServicePrice(vehicle, svc.service_key, null, config.pricing, config.vehicleClasses, config.vehiclePricingOverrides as AutoVehiclePricingOverride[]);
    }
    for (const svc of alaCarteServices) {
      matrix[svc.service_key] = {};
      for (const film of films) {
        matrix[svc.service_key][film.id] = calculateAlaCartePrice(vehicle, svc.service_key, film.id, config.pricing);
      }
    }
    return matrix;
  }, [config, vehicle, tintServices, removalServices, alaCarteServices, films]);

  // Filter services to only show rows that have at least one non-zero price
  const visibleTintServices = useMemo(() => {
    if (!priceMatrix) return tintServices;
    return tintServices.filter(svc => films.some(f => (priceMatrix[svc.service_key]?.[f.id] ?? 0) > 0));
  }, [tintServices, priceMatrix, films]);

  const visibleRemovalServices = useMemo(() => {
    if (!priceMatrix) return removalServices;
    return removalServices.filter(svc => (priceMatrix[svc.service_key]?.[0] ?? 0) > 0);
  }, [removalServices, priceMatrix]);

  const visibleAlaCarteServices = useMemo(() => {
    if (!priceMatrix) return alaCarteServices;
    return alaCarteServices.filter(svc => films.some(f => (priceMatrix[svc.service_key]?.[f.id] ?? 0) > 0));
  }, [alaCarteServices, priceMatrix, films]);

  const addFee = useMemo(() => {
    if (!config || !vehicle) return 0;
    return getAddFee(vehicle, config.vehicleClasses);
  }, [config, vehicle]);

  const toggleRow = useCallback((serviceKey: string, label: string, filmId: number, filmName: string, price: number) => {
    setSelectedRows(prev => {
      const exactMatch = prev.find(r => r.serviceKey === serviceKey && r.filmId === filmId);
      // Clicking the same cell again: deselect it
      if (exactMatch) return prev.filter(r => !(r.serviceKey === serviceKey && r.filmId === filmId));

      if (optionsMode) {
        // Options mode: multiple films per row, multiple primaries allowed
        return [...prev, { serviceKey, label, filmId, filmName, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null }];
      }

      // Normal mode: one film per service row
      let updated = prev.filter(r => r.serviceKey !== serviceKey);

      // Primary service conflict: if selecting a primary service, remove any other primary service
      if (config) {
        const svcDef = config.services.find(s => s.service_key === serviceKey);
        if (svcDef?.is_primary) {
          const primaryKeys = new Set(config.services.filter(s => s.is_primary).map(s => s.service_key));
          updated = updated.filter(r => !primaryKeys.has(r.serviceKey));
        }
      }

      return [...updated, { serviceKey, label, filmId, filmName, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null }];
    });
  }, [config, optionsMode]);

  const updateRowShade = useCallback((serviceKey: string, filmId: number, field: 'shadeFront' | 'shadeRear', value: string | null) => {
    setSelectedRows(prev => prev.map(r =>
      r.serviceKey === serviceKey && r.filmId === filmId ? { ...r, [field]: value } : r
    ));
  }, []);

  const updateRowPrice = useCallback((serviceKey: string, filmId: number, newPrice: number) => {
    setSelectedRows(prev => prev.map(r =>
      r.serviceKey === serviceKey && r.filmId === filmId ? { ...r, price: newPrice } : r
    ));
  }, []);

  const updateRowPriceNote = useCallback((serviceKey: string, filmId: number, note: string | null) => {
    setSelectedRows(prev => prev.map(r =>
      r.serviceKey === serviceKey && r.filmId === filmId ? { ...r, priceNote: note } : r
    ));
  }, []);

  const isSelected = useCallback((serviceKey: string, filmId: number) => {
    return selectedRows.some(r => r.serviceKey === serviceKey && r.filmId === filmId);
  }, [selectedRows]);

  const totalSelected = selectedRows.reduce((sum, r) => sum + r.price, 0);
  useEffect(() => { setSelectedRows([]); }, [vehicle]);

  const appointmentTypes = useMemo(() => {
    if (!config) return [];
    const types: { value: string; label: string }[] = [];
    if (config.shopConfig.enable_dropoff) types.push({ value: 'dropoff', label: 'Drop-off' });
    if (config.shopConfig.enable_waiting) types.push({ value: 'waiting', label: 'Waiting' });
    if (config.shopConfig.enable_headsup_30) types.push({ value: 'headsup_30', label: 'Heads-Up (30 min)' });
    if (config.shopConfig.enable_headsup_60) types.push({ value: 'headsup_60', label: 'Heads-Up (60 min)' });
    return types;
  }, [config]);

  const timeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [];
    for (let h = 7; h <= 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        slots.push({ value: hour24, label: `${hour12}:${String(m).padStart(2, '0')} ${ampm}` });
      }
    }
    return slots;
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const hasSchedule = Boolean(selectedDate && selectedTime);

  // Customer search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch || customerSearch.length < 1) return [];
    const term = customerSearch.toLowerCase();
    return customers.filter(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.phone?.includes(term) || c.email?.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  function selectCustomer(c: typeof customers[0]) {
    setSelectedCustomerId(c.id);
    setCustomerName(`${c.first_name} ${c.last_name}`.trim());
    setCustomerPhone(c.phone || '');
    setCustomerEmail(c.email || '');
    setCustomerSearch(`${c.first_name} ${c.last_name}`.trim());
    setShowDropdown(false);
  }

  // ============================================================
  // ACTION: Add to Schedule (direct book, no deposit)
  // ============================================================
  async function handleDirectBook() {
    if (!vehicle || !selectedDate || !selectedTime || !customerName) return;
    setBookingDirect(true);
    try {
      const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';
      const nameParts = customerName.trim().split(' ');
      const res = await fetch('/api/auto/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '',
          phone: customerPhone, email: customerEmail,
          vehicleYear: selectedYear, vehicleMake: selectedMake, vehicleModel: selectedModel,
          classKeys: vehicle.class_keys.join('|'),
          serviceType: 'tint', appointmentType,
          servicesJson: selectedRows.map(s => ({
            serviceKey: s.serviceKey, label: s.label, filmId: s.filmId || null,
            filmName: s.filmName, filmAbbrev: null, shadeFront: s.shadeFront,
            shadeRear: s.shadeRear, shade: s.shadeFront, price: s.price,
            originalPrice: s.originalPrice, priceNote: s.priceNote || null,
            discountAmount: 0, duration: 60, module: 'auto_tint',
          })),
          subtotal: totalSelected, discountCode: null, discountType: null,
          discountPercent: 0, discountAmount: 0, depositPaid: 0,
          balanceDue: totalSelected,
          appointmentDate: selectedDate,
          appointmentTime: isHeadsUp ? null : selectedTime,
          durationMinutes: selectedRows.length * 60,
          windowStatus: 'never', hasAftermarketTint: null, additionalInterests: '',
          notes: 'Booked from Fast Lane', calendarTitle: '', emojiMarker: '',
        }),
      });
      const data = await res.json();
      if (data.success) setBookingSuccess(true);
    } catch { /* silent */ }
    setBookingDirect(false);
  }

  // ============================================================
  // ACTION: Send as Tailored Quote (customer approves, deposit per settings)
  // ============================================================
  async function handleSendTailoredQuote() {
    if (!vehicle) return;
    setSendingQuote(true);
    try {
      const res = await fetch('/api/auto/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake, vehicle_model: selectedModel,
          vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
          services: selectedRows.map(s => ({
            service_key: s.serviceKey, label: s.label, film_id: s.filmId || null,
            film_name: s.filmName, price: s.price, original_price: s.originalPrice, price_note: s.priceNote || null,
            shade_front: s.shadeFront, shade_rear: s.shadeRear,
          })),
          total_price: totalSelected,
          charge_deposit: overrideDeposit ? (depositOverride !== null && depositOverride > 0) : (config?.shopConfig.require_deposit ?? true),
          deposit_amount: overrideDeposit ? (depositOverride || 0) : (config?.shopConfig.deposit_amount || 50),
          send_method: tailoredSendMethod,
          // Pass the pre-selected schedule so customer sees it
          pre_appointment_type: selectedDate ? (appointmentType || 'dropoff') : null,
          pre_appointment_date: selectedDate || null,
          pre_appointment_time: selectedTime || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLink(data.booking_url);
        setTailoredSentVia(data.sent ? tailoredSendMethod : null);
      }
    } catch { /* silent */ }
    setSendingQuote(false);
  }

  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ============================================================
  // ACTION: Multi-Service Quote
  // ============================================================
  async function handleCreateQuote() {
    if (!vehicle || selectedRows.length === 0) return;
    setCreating(true);
    const docRes = await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: 'quote', customer_id: selectedCustomerId || null,
        customer_name: customerName || null, customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake,
        vehicle_model: selectedModel, class_keys: vehicle.class_keys.join('|'),
        subtotal: totalSelected, balance_due: totalSelected,
      }),
    });
    const doc = await docRes.json();
    if (!doc.id) { setCreating(false); return; }

    await fetch(`/api/documents/${doc.id}/line-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedRows.map((row, idx) => ({
        module: 'auto_tint', group_id: 'grp_quick_tint',
        description: row.label, quantity: 1, unit_price: row.price, line_total: row.price, sort_order: idx,
        custom_fields: {
          serviceKey: row.serviceKey, filmId: row.filmId > 0 ? row.filmId : null,
          filmName: row.filmName !== 'N/A' ? row.filmName : null,
          shadeFront: row.shadeFront, shadeRear: row.shadeRear, shade: row.shadeFront || null,
          originalPrice: row.originalPrice, priceNote: row.priceNote || null,
          vehicleYear: parseInt(selectedYear), vehicleMake: selectedMake,
          vehicleModel: selectedModel, classKeys: vehicle.class_keys.join('|'),
        },
      }))),
    });
    router.push(`/documents/${doc.id}`);
  }

  // ============================================================
  // ACTION: Send as Options Quote (Options Mode)
  // Creates a lead with options_mode=true. The lead booking page
  // shows a pick-one-per-service UI. Stays in FLQA world.
  // ============================================================
  const [optionsSendSms, setOptionsSendSms] = useState(true);
  const [optionsSendEmail, setOptionsSendEmail] = useState(true);
  const [optionsLink, setOptionsLink] = useState('');
  const [optionsSent, setOptionsSent] = useState(false);
  const [optionsSentVia, setOptionsSentVia] = useState<string[]>([]);
  const [showOptionsPreview, setShowOptionsPreview] = useState(false);
  const [optionsCopied, setOptionsCopied] = useState(false);

  async function handleSendOptions() {
    if (!vehicle || selectedRows.length === 0) return;
    const willSms = optionsSendSms && !!customerPhone;
    const willEmail = optionsSendEmail && !!customerEmail;
    if (!willSms && !willEmail) {
      alert('Enter a phone number for SMS or an email address to send.');
      return;
    }
    setCreating(true);

    try {
      const services = selectedRows.map(row => ({
        service_key: row.serviceKey, label: row.label,
        film_id: row.filmId > 0 ? row.filmId : null, film_name: row.filmName !== 'N/A' ? row.filmName : null,
        price: row.price, original_price: row.originalPrice,
        shade_front: row.shadeFront, shade_rear: row.shadeRear,
      }));

      const sentVia: string[] = [];

      // Send via SMS
      if (willSms) {
        const res = await fetch('/api/auto/leads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: customerName || null, customer_phone: customerPhone || null,
            customer_email: customerEmail || null,
            vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake, vehicle_model: selectedModel,
            vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
            services, total_price: totalSelected,
            charge_deposit: config?.shopConfig.require_deposit ?? true,
            deposit_amount: config?.shopConfig.deposit_amount || 50,
            send_method: 'sms', options_mode: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setOptionsLink(data.booking_url);
          if (data.sent) sentVia.push('SMS');
        }
      }

      // Send via Email (reuse same lead if SMS already created one, or create new)
      if (willEmail) {
        const res = await fetch('/api/auto/leads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: customerName || null, customer_phone: customerPhone || null,
            customer_email: customerEmail || null,
            vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake, vehicle_model: selectedModel,
            vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
            services, total_price: totalSelected,
            charge_deposit: config?.shopConfig.require_deposit ?? true,
            deposit_amount: config?.shopConfig.deposit_amount || 50,
            send_method: willSms ? 'email' : 'email', // If SMS already sent, this just sends email
            options_mode: true,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!optionsLink) setOptionsLink(data.booking_url);
          if (data.sent) sentVia.push('Email');
        }
      }

      setOptionsSentVia(sentVia);
      setOptionsSent(true);
    } catch { /* silent */ }
    setCreating(false);
  }

  async function handleCopyOptionsLink() {
    if (!vehicle || selectedRows.length === 0) return;
    // Generate link without sending
    if (!optionsLink) {
      const services = selectedRows.map(row => ({
        service_key: row.serviceKey, label: row.label,
        film_id: row.filmId > 0 ? row.filmId : null, film_name: row.filmName !== 'N/A' ? row.filmName : null,
        price: row.price, original_price: row.originalPrice,
        shade_front: row.shadeFront, shade_rear: row.shadeRear,
      }));
      const res = await fetch('/api/auto/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake, vehicle_model: selectedModel,
          vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
          services, total_price: totalSelected,
          charge_deposit: config?.shopConfig.require_deposit ?? true,
          deposit_amount: config?.shopConfig.deposit_amount || 50,
          send_method: 'copy', options_mode: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOptionsLink(data.booking_url);
        await navigator.clipboard.writeText(data.booking_url);
        setOptionsCopied(true);
        setTimeout(() => setOptionsCopied(false), 2000);
        return;
      }
    }
    await navigator.clipboard.writeText(optionsLink);
    setOptionsCopied(true);
    setTimeout(() => setOptionsCopied(false), 2000);
  }

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return <div style={{ padding: SPACING.xxl, color: COLORS.textMuted, textAlign: 'center' }}>Loading pricing data...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: SPACING.lg, padding: `${SPACING.md}px 0`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
          <div style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.md,
            background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}40`,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.red,
          }}>
            Fast Lane Quote / Appointment
          </div>
          <button onClick={onExit} style={{
            background: 'none', border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
            color: COLORS.textMuted, fontSize: FONT.sizeXs, padding: `${SPACING.xs}px ${SPACING.sm}px`,
            cursor: 'pointer',
          }}>
            Exit Fast Lane
          </button>
          {/* Options Mode toggle */}
          <button onClick={() => { setOptionsMode(!optionsMode); setSelectedRows([]); }} style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
            background: optionsMode ? `${COLORS.borderAccentSolid}20` : 'transparent',
            border: `1px solid ${optionsMode ? COLORS.borderAccentSolid : COLORS.borderInput}`,
            color: optionsMode ? COLORS.borderAccentSolid : COLORS.textMuted,
            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
          }}>
            {optionsMode ? 'Options Mode ON' : 'Options Mode'}
          </button>
        </div>
        {selectedRows.length > 0 && (
          <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
            {selectedRows.length} service{selectedRows.length !== 1 ? 's' : ''} -- ${totalSelected.toLocaleString()}
          </span>
        )}
      </div>

      {/* Customer */}
      <DashboardCard title="Customer" allowOverflow>
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <FormField label="Search or Enter Name">
              <TextInput
                value={customerSearch || customerName}
                onChange={e => { setCustomerSearch(e.target.value); setCustomerName(e.target.value); setSelectedCustomerId(null); setShowDropdown(true); }}
                onFocus={() => { if (filteredCustomers.length > 0) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder="Customer name..."
              />
            </FormField>
            {showDropdown && filteredCustomers.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: COLORS.cardBg, border: `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.sm, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}>
                {filteredCustomers.map(c => (
                  <div key={c.id} onMouseDown={() => selectCustomer(c)} style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, cursor: 'pointer',
                    borderBottom: `1px solid ${COLORS.border}`, fontSize: FONT.sizeSm, color: COLORS.textPrimary,
                  }}>
                    <div style={{ fontWeight: FONT.weightSemibold }}>{c.first_name} {c.last_name}</div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{c.phone}{c.email ? ` -- ${c.email}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 160 }}>
            <FormField label="Phone"><TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone..." /></FormField>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Email"><TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email..." /></FormField>
          </div>
        </div>
      </DashboardCard>

      {/* YMM Selector */}
      <div style={{ marginTop: SPACING.lg }}>
        <DashboardCard title="Select Vehicle">
          <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Year"><SelectInput value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedMake(''); setSelectedModel(''); }}>
                <option value="">Select Year</option>
                {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </SelectInput></FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Make"><SelectInput value={selectedMake} onChange={e => { setSelectedMake(e.target.value); setSelectedModel(''); }}>
                <option value="">{selectedYear ? 'Select Make' : '---'}</option>
                {makes.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput></FormField>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Model"><SelectInput value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="">{selectedMake ? 'Select Model' : '---'}</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput></FormField>
            </div>
            {vehicle && (
              <div style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, background: COLORS.activeBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderAccent}`, marginBottom: SPACING.lg }}>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Class</div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>{vehicle.class_keys.join(', ')}</div>
                {addFee > 0 && <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow, marginTop: 2 }}>+${addFee} ADD_FEE (Full Sides)</div>}
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* Pricing Matrix */}
      {vehicle && priceMatrix && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title={`${selectedYear} ${selectedMake} ${selectedModel}`} noPadding
            actions={selectedRows.length > 0 ? (
              <button onClick={() => setSelectedRows([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: FONT.sizeXs, textDecoration: 'underline' }}>Clear Selection</button>
            ) : (
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Click cells to select services</span>
            )}>
            {isMobile ? (
              /* ============ MOBILE: Film pills per service row ============ */
              <div style={{ padding: SPACING.md }}>
                {/* Tint Services */}
                {visibleTintServices.map(svc => {
                  const anySelected = selectedRows.some(r => r.serviceKey === svc.service_key);
                  return (
                    <div key={svc.service_key} style={{
                      marginBottom: SPACING.md, paddingBottom: SPACING.md,
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}>
                      <div
                        onClick={() => {
                          if (!optionsMode || !priceMatrix) return;
                          if (anySelected) {
                            setSelectedRows(prev => prev.filter(r => r.serviceKey !== svc.service_key));
                          } else {
                            const newRows: SelectedRow[] = [];
                            for (const film of films) {
                              const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                              if (price > 0) newRows.push({ serviceKey: svc.service_key, label: svc.label, filmId: film.id, filmName: film.name, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null });
                            }
                            setSelectedRows(prev => [...prev.filter(r => r.serviceKey !== svc.service_key), ...newRows]);
                          }
                        }}
                        style={{ marginBottom: 8, cursor: optionsMode ? 'pointer' : 'default' }}
                      >
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: COLORS.textPrimary }}>{svc.label}</div>
                        {svc.service_key === 'FULL_SIDES' && addFee > 0 && <div style={{ fontSize: '0.7rem', color: COLORS.yellow }}>incl. +${addFee} add fee</div>}
                        {optionsMode && <div style={{ fontSize: '0.65rem', color: anySelected ? COLORS.red : COLORS.textMuted }}>{anySelected ? 'Tap to deselect all' : 'Tap to select all'}</div>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {films.map(film => {
                          const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                          if (price <= 0) return null;
                          const sel = isSelected(svc.service_key, film.id);
                          return (
                            <button key={film.id}
                              onClick={() => toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                              style={{
                                padding: '10px 6px', borderRadius: RADIUS.md, cursor: 'pointer',
                                background: sel ? 'rgba(220, 38, 38, 0.2)' : COLORS.inputBg,
                                border: `2px solid ${sel ? COLORS.red : COLORS.border}`,
                                color: sel ? COLORS.red : COLORS.textPrimary,
                                fontSize: '0.8rem', fontWeight: sel ? 800 : 600,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                flex: '1 1 0', minWidth: 0,
                              }}
                            >
                              <span style={{ fontSize: '0.65rem', color: sel ? COLORS.red : COLORS.textMuted, fontWeight: 600 }}>{film.abbreviation || film.name}</span>
                              <span>${price}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Removal Services */}
                {visibleRemovalServices.length > 0 && (
                  <>
                    <div style={{
                      padding: `${SPACING.sm}px 0`, fontSize: '0.75rem',
                      fontWeight: 700, color: '#f59e0b',
                      textTransform: 'uppercase', letterSpacing: '1px',
                      borderBottom: `1px solid ${COLORS.border}`, marginBottom: SPACING.md,
                    }}>Removal Services</div>
                    {visibleRemovalServices.map(svc => {
                      const price = priceMatrix[svc.service_key]?.[0] ?? 0;
                      const sel = isSelected(svc.service_key, 0);
                      return (
                        <div key={svc.service_key} style={{
                          marginBottom: SPACING.md, paddingBottom: SPACING.md,
                          borderBottom: `1px solid ${COLORS.border}`,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: COLORS.textSecondary }}>{svc.label}</span>
                          <button
                            onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, 0, 'N/A', price)}
                            style={{
                              padding: '10px 18px', borderRadius: RADIUS.md, cursor: 'pointer',
                              background: sel ? 'rgba(220, 38, 38, 0.2)' : COLORS.inputBg,
                              border: `2px solid ${sel ? COLORS.red : COLORS.border}`,
                              color: sel ? COLORS.red : COLORS.textPrimary,
                              fontSize: '0.85rem', fontWeight: sel ? 800 : 600,
                            }}
                          >
                            ${price}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Ala Carte Services */}
                {visibleAlaCarteServices.length > 0 && (
                  <>
                    <div style={{
                      padding: `${SPACING.sm}px 0`, fontSize: '0.75rem',
                      fontWeight: 700, color: '#8b5cf6',
                      textTransform: 'uppercase', letterSpacing: '1px',
                      borderBottom: `1px solid ${COLORS.border}`, marginBottom: SPACING.md,
                    }}>Ala Carte -- Single Window</div>
                    {visibleAlaCarteServices.map(svc => {
                      const anySelected = selectedRows.some(r => r.serviceKey === svc.service_key);
                      return (
                        <div key={svc.service_key} style={{
                          marginBottom: SPACING.md, paddingBottom: SPACING.md,
                          borderBottom: `1px solid ${COLORS.border}`,
                        }}>
                          <div
                            onClick={() => {
                              if (!optionsMode || !priceMatrix) return;
                              if (anySelected) {
                                setSelectedRows(prev => prev.filter(r => r.serviceKey !== svc.service_key));
                              } else {
                                const newRows: SelectedRow[] = [];
                                for (const film of films) {
                                  const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                                  if (price > 0) newRows.push({ serviceKey: svc.service_key, label: svc.label, filmId: film.id, filmName: film.name, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null });
                                }
                                setSelectedRows(prev => [...prev.filter(r => r.serviceKey !== svc.service_key), ...newRows]);
                              }
                            }}
                            style={{ marginBottom: 8, cursor: optionsMode ? 'pointer' : 'default' }}
                          >
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: COLORS.textPrimary }}>{svc.label}</div>
                            {optionsMode && <div style={{ fontSize: '0.65rem', color: anySelected ? COLORS.red : COLORS.textMuted }}>{anySelected ? 'Tap to deselect all' : 'Tap to select all'}</div>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {films.map(film => {
                              const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                              if (price <= 0) return null;
                              const sel = isSelected(svc.service_key, film.id);
                              return (
                                <button key={film.id}
                                  onClick={() => toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                                  style={{
                                    padding: '10px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                                    background: sel ? 'rgba(220, 38, 38, 0.2)' : COLORS.inputBg,
                                    border: `2px solid ${sel ? COLORS.red : COLORS.border}`,
                                    color: sel ? COLORS.red : COLORS.textPrimary,
                                    fontSize: '0.8rem', fontWeight: sel ? 800 : 600,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                    minWidth: 75,
                                  }}
                                >
                                  <span style={{ fontSize: '0.65rem', color: sel ? COLORS.red : COLORS.textMuted, fontWeight: 600 }}>{film.abbreviation || film.name}</span>
                                  <span>${price}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ) : (
              /* ============ DESKTOP: Original table layout ============ */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 2, background: COLORS.cardBg, minWidth: 160 }}>Service</th>
                    {films.map(film => (
                      <th key={film.id} style={{ ...thStyle, minWidth: 100, textAlign: 'center' }}>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{film.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTintServices.map(svc => {
                    const anySelected = selectedRows.some(r => r.serviceKey === svc.service_key);
                    return (
                    <tr key={svc.service_key}>
                      <td
                        onClick={() => {
                          if (!optionsMode || !priceMatrix) return;
                          if (anySelected) {
                            setSelectedRows(prev => prev.filter(r => r.serviceKey !== svc.service_key));
                          } else {
                            const newRows: SelectedRow[] = [];
                            for (const film of films) {
                              const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                              if (price > 0) newRows.push({ serviceKey: svc.service_key, label: svc.label, filmId: film.id, filmName: film.name, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null });
                            }
                            setSelectedRows(prev => [...prev.filter(r => r.serviceKey !== svc.service_key), ...newRows]);
                          }
                        }}
                        style={{
                          ...tdStyle, position: 'sticky', left: 0, zIndex: 1,
                          background: optionsMode && anySelected ? 'rgba(220, 38, 38, 0.08)' : COLORS.cardBg,
                          fontWeight: FONT.weightMedium, color: COLORS.textSecondary,
                          cursor: optionsMode ? 'pointer' : 'default',
                        }}
                      >
                        <div>{svc.label}</div>
                        {svc.service_key === 'FULL_SIDES' && addFee > 0 && <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow }}>incl. +${addFee} add fee</div>}
                        {optionsMode && <div style={{ fontSize: '0.6rem', color: anySelected ? COLORS.red : COLORS.textMuted, marginTop: 2 }}>{anySelected ? 'Click to deselect row' : 'Click to select all'}</div>}
                      </td>
                      {films.map(film => {
                        const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                        const sel = isSelected(svc.service_key, film.id);
                        return (
                          <td key={film.id} onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                            style={{ ...tdStyle, textAlign: 'center', cursor: price > 0 ? 'pointer' : 'default', background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent', borderColor: sel ? COLORS.red : COLORS.border, transition: 'background 0.15s' }}
                            onMouseEnter={e => { if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg; }}
                            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                            {price > 0 ? <span style={{ fontSize: FONT.sizeBase, fontWeight: sel ? FONT.weightBold : FONT.weightMedium, color: sel ? COLORS.red : COLORS.textPrimary }}>${price}</span>
                              : <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                  })}
                  {/* Removal Services */}
                  {visibleRemovalServices.length > 0 && (
                    <>
                      <tr><td colSpan={films.length + 1} style={{
                        padding: `${SPACING.sm}px ${SPACING.lg}px`, fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightSemibold, color: '#f59e0b',
                        textTransform: 'uppercase', letterSpacing: '1px',
                        borderBottom: `1px solid ${COLORS.border}`, borderTop: `2px solid ${COLORS.border}`,
                        background: COLORS.inputBg,
                      }}>Removal Services</td></tr>
                      {visibleRemovalServices.map(svc => {
                        const price = priceMatrix[svc.service_key]?.[0] ?? 0;
                        const sel = isSelected(svc.service_key, 0);
                        return (
                          <tr key={svc.service_key}>
                            <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 1, background: COLORS.cardBg, fontWeight: FONT.weightMedium, color: COLORS.textSecondary }}>{svc.label}</td>
                            <td colSpan={films.length} onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, 0, 'N/A', price)}
                              style={{ ...tdStyle, cursor: 'pointer', background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent', transition: 'background 0.15s' }}
                              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = COLORS.hoverBg; }}
                              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                              <span style={{ fontSize: FONT.sizeBase, fontWeight: sel ? FONT.weightBold : FONT.weightMedium, color: sel ? COLORS.red : COLORS.textPrimary }}>${price}</span>
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: 6 }}>flat rate</span>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* Ala Carte Services */}
                  {visibleAlaCarteServices.length > 0 && (
                    <>
                      <tr><td colSpan={films.length + 1} style={{
                        padding: `${SPACING.sm}px ${SPACING.lg}px`, fontSize: FONT.sizeXs,
                        fontWeight: FONT.weightSemibold, color: '#8b5cf6',
                        textTransform: 'uppercase', letterSpacing: '1px',
                        borderBottom: `1px solid ${COLORS.border}`, borderTop: `2px solid ${COLORS.border}`,
                        background: COLORS.inputBg,
                      }}>Ala Carte -- Single Window</td></tr>
                      {visibleAlaCarteServices.map(svc => {
                        const anySelected = selectedRows.some(r => r.serviceKey === svc.service_key);
                        return (
                          <tr key={svc.service_key}>
                            <td
                              onClick={() => {
                                if (!optionsMode || !priceMatrix) return;
                                if (anySelected) {
                                  setSelectedRows(prev => prev.filter(r => r.serviceKey !== svc.service_key));
                                } else {
                                  const newRows: SelectedRow[] = [];
                                  for (const film of films) {
                                    const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                                    if (price > 0) newRows.push({ serviceKey: svc.service_key, label: svc.label, filmId: film.id, filmName: film.name, price, originalPrice: price, priceNote: null, shadeFront: null, shadeRear: null });
                                  }
                                  setSelectedRows(prev => [...prev.filter(r => r.serviceKey !== svc.service_key), ...newRows]);
                                }
                              }}
                              style={{
                                ...tdStyle, position: 'sticky', left: 0, zIndex: 1,
                                background: optionsMode && anySelected ? 'rgba(220, 38, 38, 0.08)' : COLORS.cardBg,
                                fontWeight: FONT.weightMedium, color: COLORS.textSecondary,
                                cursor: optionsMode ? 'pointer' : 'default',
                              }}
                            >
                              <div>{svc.label}</div>
                              {optionsMode && <div style={{ fontSize: '0.6rem', color: anySelected ? COLORS.red : COLORS.textMuted, marginTop: 2 }}>{anySelected ? 'Click to deselect row' : 'Click to select all'}</div>}
                            </td>
                            {films.map(film => {
                              const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                              const sel = isSelected(svc.service_key, film.id);
                              return (
                                <td key={film.id} onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                                  style={{ ...tdStyle, textAlign: 'center', cursor: price > 0 ? 'pointer' : 'default', background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent', borderColor: sel ? COLORS.red : COLORS.border, transition: 'background 0.15s' }}
                                  onMouseEnter={e => { if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg; }}
                                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                                  {price > 0 ? <span style={{ fontSize: FONT.sizeBase, fontWeight: sel ? FONT.weightBold : FONT.weightMedium, color: sel ? COLORS.red : COLORS.textPrimary }}>${price}</span>
                                    : <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            )}
          </DashboardCard>
        </div>
      )}

      {/* Choose Shades (collapsible) */}
      {selectedRows.length > 0 && config && vehicle && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard>
            <button
              onClick={() => setShadesExpanded(!shadesExpanded)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: COLORS.textPrimary, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                marginBottom: shadesExpanded ? SPACING.md : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: shadesExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Choose Shades
              </div>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{selectedRows.length} selection{selectedRows.length !== 1 ? 's' : ''}</span>
            </button>
            {shadesExpanded && selectedRows.map((row, i) => {
              const shades = row.filmId > 0 ? getAllowedShades(row.serviceKey, row.filmId, config.filmShades, config.serviceShades, config.films) : [];
              const splitShade = row.filmId > 0 && needsSplitShades(vehicle, config.classRules, row.serviceKey);
              return (
                <div key={i} style={{
                  padding: isMobile ? '10px 12px' : SPACING.md, borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.02)',
                  display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? 6 : SPACING.md, marginBottom: SPACING.sm,
                }}>
                  {/* Row 1 on mobile: service + film + price + X */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: isMobile ? '0.85rem' : FONT.sizeSm }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize: isMobile ? '0.75rem' : FONT.sizeXs, color: COLORS.textMuted, marginLeft: 6 }}>
                        {row.filmName !== 'N/A' ? row.filmName : ''}
                        {row.shadeFront ? ` ${row.shadeFront}${row.shadeRear ? `/${row.shadeRear}` : ''}` : ''}
                      </span>
                    </div>
                    <PriceEditor
                      price={row.price}
                      originalPrice={row.originalPrice}
                      priceNote={row.priceNote}
                      onChange={(p) => updateRowPrice(row.serviceKey, row.filmId, p)}
                      onNoteChange={(n) => updateRowPriceNote(row.serviceKey, row.filmId, n)}
                      isMobile={isMobile}
                    />
                    <button onClick={() => toggleRow(row.serviceKey, row.label, row.filmId, row.filmName, row.price)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4, flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  {/* Shade selectors */}
                  {shades.length > 0 && (
                    <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: isMobile ? 'wrap' : undefined }}>
                      {splitShade ? (<>
                        <ShadeGroup label="Front" shades={shades} selected={row.shadeFront} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', v)} />
                        <ShadeGroup label="Rear" shades={shades} selected={row.shadeRear} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeRear', v)} />
                      </>) : (
                        <ShadeGroup label="Shade" shades={shades} selected={row.shadeFront} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', v)} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {shadesExpanded && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.md, paddingTop: SPACING.md, borderTop: `1px solid ${COLORS.border}`, fontSize: isMobile ? '1.1rem' : FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                Total: <span style={{ color: COLORS.success, marginLeft: SPACING.sm }}>${totalSelected.toLocaleString()}</span>
              </div>
            )}
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* SCHEDULING -- appointment type, date, time, MiniTimeline */}
      {/* ============================================================ */}
      {selectedRows.length > 0 && config && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Schedule (optional)">
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Set a date and time to book directly, or leave blank to let the customer choose.
            </div>
            <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: isMobile ? 10 : SPACING.md, flexWrap: 'wrap', marginBottom: SPACING.md }}>
              <div style={{ width: isMobile ? undefined : 140 }}>
                <FormField label="Type"><SelectInput value={appointmentType} onChange={e => setAppointmentType(e.target.value)}>
                  {appointmentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectInput></FormField>
              </div>
              <div style={{ width: isMobile ? undefined : 170 }}>
                <FormField label="Date"><TextInput type="date" value={selectedDate} min={today} onChange={e => setSelectedDate(e.target.value)} style={{ cursor: 'pointer' }} /></FormField>
              </div>
              <div style={{ width: isMobile ? undefined : 140, gridColumn: isMobile ? '1 / -1' : undefined }}>
                <FormField label="Time"><SelectInput value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
                  <option value="">Select Time</option>
                  {timeSlots.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectInput></FormField>
              </div>
            </div>

            {selectedDate && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textSecondary }}>
                  Schedule for {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <button
                  onClick={() => setShowScheduleModal(true)}
                  title="Expand schedule"
                  style={{
                    padding: '4px 10px', borderRadius: RADIUS.sm,
                    border: `1px solid ${COLORS.borderInput}`, background: 'transparent',
                    color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                  Expand
                </button>
              </div>
              <MiniTimeline
                appointments={dayAppointments} loading={loadingDay}
                summary={daySummary} height={360}
                ghostCards={ghostCards}
              />
            </>)}
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* ACTION BUTTONS */}
      {/* ============================================================ */}
      {selectedRows.length > 0 && vehicle && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard>
            {optionsMode ? (
              /* Options Mode */
              optionsSent ? (
                /* Success state */
                <div style={{ textAlign: 'center', padding: SPACING.lg }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>
                    {optionsSentVia.length > 0 ? `Options Sent via ${optionsSentVia.join(' + ')}` : 'Options Link Ready'}
                  </div>
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
                    {optionsSentVia.length > 0 ? `Sent to ${[optionsSentVia.includes('SMS') ? customerPhone : '', optionsSentVia.includes('Email') ? customerEmail : ''].filter(Boolean).join(' and ')}. ` : ''}
                    Customer will choose their preferred option per service and book.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
                    <input readOnly value={optionsLink} style={{ flex: 1, background: 'none', border: 'none', color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', fontFamily: 'monospace' }}
                      onClick={e => (e.target as HTMLInputElement).select()} />
                    <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(optionsLink); }}>Copy</Button>
                  </div>
                  <Button variant="primary" onClick={onExit}>Done</Button>
                </div>
              ) : (
                /* Options send form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                    {(() => {
                      const groups = new Set(selectedRows.map(r => r.serviceKey));
                      const totalOptions = selectedRows.length;
                      return `${groups.size} service${groups.size !== 1 ? 's' : ''} with ${totalOptions} option${totalOptions !== 1 ? 's' : ''} selected`;
                    })()}
                  </div>

                  {/* Send toggles: SMS + Email both on by default */}
                  <div style={{ display: 'flex', gap: SPACING.lg, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: customerPhone ? 'pointer' : 'not-allowed', opacity: customerPhone ? 1 : 0.4 }}>
                      <input type="checkbox" checked={optionsSendSms && !!customerPhone} disabled={!customerPhone}
                        onChange={e => setOptionsSendSms(e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'inherit' }} />
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>Send via SMS</span>
                      {customerPhone && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{customerPhone}</span>}
                      {!customerPhone && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>No phone entered</span>}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: customerEmail ? 'pointer' : 'not-allowed', opacity: customerEmail ? 1 : 0.4 }}>
                      <input type="checkbox" checked={optionsSendEmail && !!customerEmail} disabled={!customerEmail}
                        onChange={e => setOptionsSendEmail(e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: COLORS.red, cursor: 'inherit' }} />
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>Send via Email</span>
                      {customerEmail && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{customerEmail}</span>}
                      {!customerEmail && <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>No email entered</span>}
                    </label>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    <button onClick={() => setShowOptionsPreview(true)} style={{
                      padding: `${SPACING.md}px ${SPACING.lg}px`, background: COLORS.inputBg,
                      border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                      color: COLORS.textPrimary, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                    }}>
                      Preview
                    </button>
                    <button onClick={handleCopyOptionsLink} disabled={creating} style={{
                      padding: `${SPACING.md}px ${SPACING.lg}px`, background: COLORS.inputBg,
                      border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.md,
                      color: optionsCopied ? COLORS.success : COLORS.textPrimary,
                      fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                    }}>
                      {optionsCopied ? 'Copied' : 'Copy Link'}
                    </button>
                    <button onClick={handleSendOptions} disabled={creating} style={{
                      flex: 1, padding: `${SPACING.md}px ${SPACING.xl}px`,
                      background: COLORS.red, color: '#fff', border: 'none',
                      borderRadius: RADIUS.md, cursor: 'pointer',
                      fontSize: FONT.sizeSm, fontWeight: FONT.weightBold,
                    }}>
                      {creating ? 'Sending...' : 'Send Options'}
                    </button>
                  </div>

                  {/* Multi-Service fallback */}
                  <button onClick={handleCreateQuote} disabled={creating} style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, background: 'transparent',
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                    color: COLORS.textMuted, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    Customer needs more than tint? Switch to Multi-Service Quote
                  </button>
                </div>
              )
            ) : (
              /* Normal Mode: Book / When Ready / Multi-Service */
              <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* Book Appointment -- only enabled when date + time are set */}
                <button
                  onClick={() => { if (hasSchedule && customerName) setShowBookConfirm(true); }}
                  disabled={!hasSchedule || !customerName}
                  style={{
                    flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                    background: hasSchedule && customerName ? COLORS.red : COLORS.inputBg,
                    color: hasSchedule && customerName ? '#fff' : COLORS.textMuted,
                    border: `1px solid ${hasSchedule && customerName ? COLORS.red : COLORS.borderInput}`,
                    borderRadius: RADIUS.md, cursor: hasSchedule && customerName ? 'pointer' : 'not-allowed',
                    fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>Book Appointment</div>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, opacity: 0.8 }}>
                    {hasSchedule && customerName
                      ? 'Add to schedule or send for approval'
                      : !customerName && !hasSchedule
                        ? 'Enter customer name and select a date and time to enable'
                        : !customerName
                          ? 'Enter customer name to enable'
                          : 'Select a date and time above to enable'
                    }
                  </div>
                </button>

                {/* When Ready -- no date/time needed */}
                <button
                  onClick={() => setShowSendModal(true)}
                  style={{
                    flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                    background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderAccentSolid}`,
                    borderRadius: RADIUS.md, cursor: 'pointer',
                    fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>When Ready</div>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, color: COLORS.textMuted }}>
                    Send personalized booking link
                  </div>
                </button>

                {/* Multi-Service Quote */}
                <button
                  onClick={handleCreateQuote}
                  disabled={creating}
                  style={{
                    flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                    background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${COLORS.borderInput}`,
                    borderRadius: RADIUS.md, cursor: 'pointer',
                    fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>{creating ? 'Creating...' : 'Multi-Service Quote'}</div>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, color: COLORS.textMuted }}>
                    Customer needs more than tint
                  </div>
                </button>
              </div>
            )}
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* BOOK APPOINTMENT CONFIRMATION MODAL -- two choices */}
      {/* ============================================================ */}
      {showBookConfirm && config && vehicle && (
        <Modal title="Book Appointment" onClose={() => { setShowBookConfirm(false); setGeneratedLink(''); setOverrideDeposit(false); setDepositOverride(null); }}>
          {bookingSuccess ? (
            <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>Appointment Added to Schedule</div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: SPACING.sm }}>
                {customerName} -- {selectedYear} {selectedMake} {selectedModel} -- {selectedDate}
              </div>
              <div style={{ marginTop: SPACING.lg }}><Button variant="primary" onClick={onExit}>Done</Button></div>
            </div>
          ) : generatedLink ? (
            <div style={{ textAlign: 'center', padding: SPACING.lg }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>
                {tailoredSentVia === 'sms' ? 'Quote Sent via SMS' : tailoredSentVia === 'email' ? 'Quote Sent via Email' : 'Tailored Quote Ready'}
              </div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
                {tailoredSentVia ? `Sent to ${tailoredSentVia === 'sms' ? customerPhone : customerEmail}. ` : ''}
                Customer approves and books at {selectedDate} {selectedTime ? `at ${selectedTime}` : ''}.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
                <input readOnly value={generatedLink} style={{ flex: 1, background: 'none', border: 'none', color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', fontFamily: 'monospace' }}
                  onClick={e => (e.target as HTMLInputElement).select()} />
                <Button variant={copied ? 'primary' : 'secondary'} onClick={handleCopyLink}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <Button variant="primary" onClick={onExit}>Done</Button>
            </div>
          ) : showPreview ? (
            /* ---- PREVIEW: what the customer will see ---- */
            <div>
              <div style={{ padding: SPACING.lg, background: '#ffffff', borderRadius: RADIUS.md, color: '#1a1a1a', marginBottom: SPACING.lg }}>
                <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: SPACING.md, color: '#1a1a1a' }}>Your Window Tint Quote</div>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: SPACING.md }}>
                  {selectedYear} {selectedMake} {selectedModel}
                </div>
                {selectedRows.map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < selectedRows.length - 1 ? '1px solid #eee' : 'none', fontSize: '14px' }}>
                    <span style={{ color: '#1a1a1a' }}>{row.label}{row.filmName !== 'N/A' ? ` (${row.filmName})` : ''}{row.shadeFront ? ` - ${row.shadeFront}` : ''}</span>
                    <span style={{ fontWeight: 600, color: '#1a1a1a' }}>${row.price}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: '8px', borderTop: '2px solid #1a1a1a', fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
                  <span>Total</span><span>${totalSelected.toLocaleString()}</span>
                </div>
                {(() => {
                  const dep = overrideDeposit ? (depositOverride || 0) : (config.shopConfig.deposit_amount || 50);
                  const chargeDep = overrideDeposit ? dep > 0 : config.shopConfig.require_deposit;
                  return chargeDep ? (
                    <div style={{ marginTop: SPACING.md, padding: SPACING.md, background: '#f0fdf4', borderRadius: '8px', fontSize: '14px', color: '#166534' }}>
                      <strong>${dep} deposit</strong> required to confirm your appointment.
                    </div>
                  ) : (
                    <div style={{ marginTop: SPACING.md, padding: SPACING.md, background: '#f0fdf4', borderRadius: '8px', fontSize: '14px', color: '#166534' }}>
                      No deposit required -- pay in full at your appointment.
                    </div>
                  );
                })()}
                <div style={{ marginTop: SPACING.lg, textAlign: 'center' }}>
                  <div style={{ display: 'inline-block', padding: '14px 32px', background: '#dc2626', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '16px' }}>
                    View Quote &amp; Book
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'center' }}>
                <Button variant="secondary" onClick={() => setShowPreview(false)}>Back</Button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{customerName} -- {selectedYear} {selectedMake} {selectedModel}</div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
                  {selectedRows.length} service{selectedRows.length !== 1 ? 's' : ''} -- ${totalSelected.toLocaleString()}
                  {' -- '}{selectedDate} at {selectedTime}
                </div>
              </div>

              {/* Step 1: Choose path (selection, not action) */}
              <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                What would you like to do?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                <button onClick={() => setBookPath('schedule')}
                  style={{
                    padding: `${SPACING.md}px ${SPACING.lg}px`, textAlign: 'left', cursor: 'pointer',
                    background: bookPath === 'schedule' ? COLORS.activeBg : 'transparent',
                    border: bookPath === 'schedule' ? `2px solid ${COLORS.red}` : `1px solid ${COLORS.borderInput}`,
                    borderRadius: RADIUS.md,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: bookPath === 'schedule' ? `5px solid ${COLORS.red}` : `2px solid ${COLORS.borderInput}`,
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>Add to Schedule</div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Book directly. No deposit, no customer approval needed.</div>
                    </div>
                  </div>
                </button>

                <button onClick={() => setBookPath('tailored')}
                  style={{
                    padding: `${SPACING.md}px ${SPACING.lg}px`, textAlign: 'left', cursor: 'pointer',
                    background: bookPath === 'tailored' ? COLORS.activeBg : 'transparent',
                    border: bookPath === 'tailored' ? `2px solid ${COLORS.red}` : `1px solid ${COLORS.borderInput}`,
                    borderRadius: RADIUS.md,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: bookPath === 'tailored' ? `5px solid ${COLORS.red}` : `2px solid ${COLORS.borderInput}`,
                      flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>Send as Tailored Quote</div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Customer receives a personalized link to review, approve, and book.</div>
                    </div>
                  </div>
                </button>
              </div>

              {/* Step 2: Options for tailored path */}
              {bookPath === 'tailored' && (
                <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.md, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
                  {/* Deposit */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
                    <div>
                      <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Deposit</div>
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                        {overrideDeposit
                          ? (depositOverride && depositOverride > 0 ? `$${depositOverride}` : 'No deposit')
                          : (config.shopConfig.require_deposit ? `$${config.shopConfig.deposit_amount || 50} (shop default)` : 'No deposit (shop default)')
                        }
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={overrideDeposit} onChange={e => setOverrideDeposit(e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: COLORS.red, cursor: 'pointer' }} />
                        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Override</span>
                      </label>
                      {overrideDeposit && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>$</span>
                          <TextInput type="number" value={depositOverride !== null ? String(depositOverride) : ''}
                            onChange={e => setDepositOverride(Number(e.target.value) || 0)}
                            placeholder="0" style={{ width: 70, minHeight: 26, fontSize: FONT.sizeSm }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Send method */}
                  <div>
                    <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, marginBottom: SPACING.xs, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Send via</div>
                    <div style={{ display: 'flex', gap: SPACING.sm }}>
                      {[
                        { key: 'sms' as const, label: 'SMS', disabled: !customerPhone },
                        { key: 'email' as const, label: 'Email', disabled: !customerEmail },
                        { key: 'copy' as const, label: 'Copy Link Only', disabled: false },
                      ].map(opt => (
                        <button key={opt.key} onClick={() => !opt.disabled && setTailoredSendMethod(opt.key)}
                          style={{
                            flex: 1, padding: `${SPACING.sm}px ${SPACING.sm}px`, borderRadius: RADIUS.sm,
                            cursor: opt.disabled ? 'not-allowed' : 'pointer', opacity: opt.disabled ? 0.4 : 1,
                            background: tailoredSendMethod === opt.key ? COLORS.activeBg : 'transparent',
                            color: tailoredSendMethod === opt.key ? COLORS.red : COLORS.textMuted,
                            border: `1px solid ${tailoredSendMethod === opt.key ? COLORS.red : COLORS.borderInput}`,
                            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Action buttons */}
              <div style={{ display: 'flex', gap: SPACING.sm, justifyContent: 'flex-end' }}>
                {bookPath === 'tailored' && (
                  <Button variant="secondary" onClick={() => setShowPreview(true)}>
                    Preview
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={bookPath === 'schedule' ? handleDirectBook : handleSendTailoredQuote}
                  disabled={bookingDirect || sendingQuote}
                >
                  {bookPath === 'schedule'
                    ? (bookingDirect ? 'Adding...' : 'Add to Schedule')
                    : (sendingQuote ? 'Sending...' : tailoredSendMethod === 'copy' ? 'Generate Link' : `Send via ${tailoredSendMethod === 'sms' ? 'SMS' : 'Email'}`)
                  }
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* When Ready modal (tailored booking link, no date/time) */}
      {/* Schedule Expand Modal */}
      {showScheduleModal && selectedDate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowScheduleModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: COLORS.cardBg, borderRadius: RADIUS.xxl, width: '90%', maxWidth: 600,
            maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{
              padding: `${SPACING.lg}px ${SPACING.xl}px`, borderBottom: `1px solid ${COLORS.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontSize: FONT.sizeLg }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <button onClick={() => setShowScheduleModal(false)} style={{
                background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: '20px',
              }}>x</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: SPACING.md }}>
              <MiniTimeline
                appointments={dayAppointments} loading={loadingDay}
                summary={daySummary} height={600}
                ghostCards={ghostCards}
              />
            </div>
          </div>
        </div>
      )}

      {showSendModal && config && vehicle && (
        <SendToCustomerModal
          config={config} vehicle={vehicle}
          year={selectedYear} make={selectedMake} model={selectedModel}
          selectedServices={selectedRows} total={totalSelected}
          onClose={() => setShowSendModal(false)}
          onComplete={onExit}
          prefillName={customerName} prefillPhone={customerPhone} prefillEmail={customerEmail}
        />
      )}

      {/* Options Mode Preview Lightbox */}
      {showOptionsPreview && vehicle && (
        <>
          <div onClick={() => setShowOptionsPreview(false)} style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9999, width: '90%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto',
            borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            {/* Mock customer page */}
            <div style={{ background: '#ffffff', borderRadius: 16, padding: 24, color: '#1a1a1a' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>Your Tint Options</div>
                <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
                  Choose your preferred option for each service, then pick a date and time to book.
                </div>
              </div>

              <div style={{ padding: 12, background: '#f9fafb', borderRadius: 10, marginBottom: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {selectedYear} {selectedMake} {selectedModel}
                </div>
              </div>

              {/* Service groups */}
              {(() => {
                const groups = new Map<string, typeof selectedRows>();
                for (const row of selectedRows) {
                  if (!groups.has(row.serviceKey)) groups.set(row.serviceKey, []);
                  groups.get(row.serviceKey)!.push(row);
                }
                return Array.from(groups.entries()).map(([key, rows], gi) => (
                  <div key={key} style={{ marginBottom: gi < groups.size - 1 ? 20 : 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#333' }}>
                      {rows[0].label}
                    </div>
                    {rows.map((opt, oi) => (
                      <div key={oi} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 8, marginBottom: 6,
                        background: oi === 0 ? '#fef2f2' : '#f9fafb',
                        border: oi === 0 ? '2px solid #dc2626' : '2px solid #e5e7eb',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%',
                            border: oi === 0 ? '5px solid #dc2626' : '2px solid #d1d5db',
                          }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.filmName}</div>
                            {opt.shadeFront && <div style={{ fontSize: 12, color: '#666' }}>Shade: {opt.shadeFront}</div>}
                          </div>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: oi === 0 ? '#dc2626' : '#1a1a1a' }}>
                          ${opt.price}
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}

              {/* Mock schedule section */}
              <div style={{ marginTop: 20, padding: 16, background: '#f9fafb', borderRadius: 10, textAlign: 'center', color: '#999', fontSize: 13 }}>
                Appointment type, date &amp; time picker, contact form, and booking button appear here
              </div>

              {/* Deposit info */}
              {config?.shopConfig.require_deposit && (
                <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534', textAlign: 'center' }}>
                  ${config.shopConfig.deposit_amount || 50} deposit required to confirm
                </div>
              )}
            </div>

            {/* Close button */}
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button onClick={() => setShowOptionsPreview(false)} style={{
                padding: '10px 24px', background: 'rgba(255,255,255,0.9)', border: 'none',
                borderRadius: 8, color: '#1a1a1a', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
                Close Preview
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Small shade button group
// Inline price editor -- click to edit, Enter/blur to save, optional note
function PriceEditor({ price, originalPrice, priceNote, onChange, onNoteChange, isMobile }: {
  price: number; originalPrice: number; priceNote: string | null;
  onChange: (p: number) => void; onNoteChange: (n: string | null) => void; isMobile: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(price));
  const [noteDraft, setNoteDraft] = useState(priceNote || '');
  const isOverridden = price !== originalPrice;

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <input
          type="number"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setDraft(String(price)); setEditing(false); }
          }}
          onBlur={() => {
            const val = parseFloat(draft);
            if (!isNaN(val) && val >= 0) onChange(val);
            else setDraft(String(price));
          }}
          style={{
            width: 80, padding: '2px 6px', textAlign: 'right',
            background: COLORS.inputBg, border: `1px solid ${COLORS.red}`,
            borderRadius: RADIUS.sm, color: COLORS.textPrimary,
            fontSize: isMobile ? '0.9rem' : FONT.sizeBase, fontWeight: 700, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onBlur={() => onNoteChange(noteDraft.trim() || null)}
            onKeyDown={e => { if (e.key === 'Enter') { onNoteChange(noteDraft.trim() || null); setEditing(false); } }}
            placeholder="Reason (optional)"
            style={{
              width: 130, padding: '2px 6px',
              background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm, color: COLORS.textMuted,
              fontSize: FONT.sizeXs, outline: 'none',
            }}
          />
          <button onClick={() => setEditing(false)} style={{
            background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: FONT.sizeXs,
          }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
      <span
        onClick={() => { setDraft(String(price)); setNoteDraft(priceNote || ''); setEditing(true); }}
        title="Click to override price"
        style={{
          fontWeight: FONT.weightBold,
          color: isOverridden ? COLORS.red : COLORS.success,
          fontSize: isMobile ? '0.9rem' : FONT.sizeBase,
          cursor: 'pointer',
          borderBottom: `1px dashed ${isOverridden ? COLORS.red : COLORS.textMuted}`,
          paddingBottom: 1,
        }}
      >
        ${price}
        {isOverridden && (
          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginLeft: 4, textDecoration: 'line-through' }}>
            ${originalPrice}
          </span>
        )}
      </span>
      {isOverridden && priceNote && (
        <span style={{ fontSize: '0.6rem', color: COLORS.warning, marginTop: 1 }}>
          {priceNote}
        </span>
      )}
    </div>
  );
}

function ShadeGroup({ label, shades, selected, onSelect }: {
  label: string;
  shades: { id: number; shade_value: string }[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {shades.map(s => (
          <button key={s.id} onClick={() => onSelect(s.shade_value)} style={{
            padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem',
            fontWeight: selected === s.shade_value ? 700 : 500,
            background: selected === s.shade_value ? COLORS.activeBg : 'transparent',
            color: selected === s.shade_value ? COLORS.red : COLORS.textMuted,
            border: `1px solid ${selected === s.shade_value ? COLORS.red : COLORS.borderInput}`,
          }}>{s.shade_value}</button>
        ))}
      </div>
    </div>
  );
}
