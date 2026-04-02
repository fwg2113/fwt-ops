'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  BulkConfig, BookingState, ServiceType, AppointmentType,
  GCValidation, SelectedService, AutoVehicle,
} from './types';
import {
  calculateServicePrice, calculateAlaCartePrice, calculateDiscount,
  lookupPrice, buildPriceSummary, needsSplitShades,
  isTeslaModel3, getAvailableFilms, getAllowedShades,
  type PriceSummary,
} from './pricing';

const INITIAL_STATE: BookingState = {
  gcValidation: null,
  selectedYear: '',
  selectedMake: '',
  selectedModel: '',
  selectedVehicle: null,
  serviceType: 'tint',
  primaryServiceKey: null,
  selectedFilmId: null,
  shadeFront: null,
  shadeRear: null,
  shadeUniform: false,
  selectedAddons: new Set(),
  addonConfigs: {},
  teslaClassKey: null,
  selectedRemovals: new Set(),
  selectedAlaCarteWindows: new Set(),
  alaCarteConfigs: {},
  windowStatus: '',
  hasAftermarketTint: '',
  windshieldReplaced: '',
  windshield72hrAck: false,
  policyCheckbox: false,
  priceAckCheckbox: false,
  appointmentType: 'dropoff',
  selectedDate: '',
  selectedTime: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  additionalInterests: new Set(),
};

export function useBookingState(config: BulkConfig | null) {
  const [state, setState] = useState<BookingState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config) setLoading(false);
  }, [config]);

  // --- Derived data ---

  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const allYears = new Set<number>();
    config.vehicles.forEach(v => {
      for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) {
        allYears.add(y);
      }
    });
    return Array.from(allYears).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !state.selectedYear) return [];
    const year = parseInt(state.selectedYear);
    const matchingMakes = new Set<string>();
    config.vehicles.forEach(v => {
      if (year >= v.year_start && year <= v.year_end) {
        matchingMakes.add(v.make);
      }
    });
    return Array.from(matchingMakes).sort();
  }, [config, state.selectedYear]);

  const models = useMemo(() => {
    if (!config || !state.selectedYear || !state.selectedMake) return [];
    const year = parseInt(state.selectedYear);
    const matchingModels = new Set<string>();
    config.vehicles.forEach(v => {
      if (year >= v.year_start && year <= v.year_end && v.make === state.selectedMake) {
        matchingModels.add(v.model);
      }
    });
    return Array.from(matchingModels).sort();
  }, [config, state.selectedYear, state.selectedMake]);

  const selectedVehicle = useMemo(() => {
    if (!config || !state.selectedYear || !state.selectedMake || !state.selectedModel) return null;
    const year = parseInt(state.selectedYear);
    return config.vehicles.find(v =>
      v.make === state.selectedMake &&
      v.model === state.selectedModel &&
      year >= v.year_start &&
      year <= v.year_end
    ) || null;
  }, [config, state.selectedYear, state.selectedMake, state.selectedModel]);

  const availableFilms = useMemo(() => {
    if (!config || !selectedVehicle) return config?.films || [];
    return getAvailableFilms(selectedVehicle, config.films);
  }, [config, selectedVehicle]);

  const requiresSplitShades = useMemo(() => {
    if (!config || !selectedVehicle) return false;
    return needsSplitShades(selectedVehicle, config.classRules, state.primaryServiceKey || undefined);
  }, [config, selectedVehicle, state.primaryServiceKey]);

  const isTesla3 = useMemo(() => {
    if (!selectedVehicle) return false;
    return isTeslaModel3(selectedVehicle);
  }, [selectedVehicle]);

  // --- Build selected services list for pricing ---

  const selectedServices = useMemo((): SelectedService[] => {
    if (!config || !selectedVehicle) return [];
    const services: SelectedService[] = [];
    // Respect addon discount toggle -- if off, pass empty discounts so no discounts apply
    // If on, override the percentage and excluded films from shop-level settings
    const shopDiscountPercent = config.shopConfig.addon_discount_percent || 10;
    const shopExcludedFilms = config.shopConfig.addon_discount_excluded_films || [];
    const activeDiscounts = config.shopConfig.addon_discount_enabled !== false
      ? config.discounts.map(d => ({ ...d, percentage: shopDiscountPercent, excluded_films: shopExcludedFilms }))
      : [];

    if (state.serviceType === 'tint') {
      // Primary service
      if (state.primaryServiceKey && state.selectedFilmId) {
        const film = config.films.find(f => f.id === state.selectedFilmId);
        const price = calculateServicePrice(
          selectedVehicle, state.primaryServiceKey, state.selectedFilmId,
          config.pricing, config.vehicleClasses, config.vehiclePricingOverrides
        );
        const discount = calculateDiscount(
          state.primaryServiceKey, price, film?.name || null,
          true, activeDiscounts, state.gcValidation
        );
        const { duration } = lookupPrice(selectedVehicle, state.primaryServiceKey, state.selectedFilmId, config.pricing);
        const svc = config.services.find(s => s.service_key === state.primaryServiceKey);

        services.push({
          module: 'auto_tint',
          serviceKey: state.primaryServiceKey,
          label: svc?.label || state.primaryServiceKey,
          filmId: state.selectedFilmId,
          filmName: film?.name || null,
          filmAbbrev: film?.abbreviation || null,
          shadeFront: state.shadeFront,
          shadeRear: requiresSplitShades ? state.shadeRear : null,
          shade: requiresSplitShades
            ? (state.shadeFront && state.shadeRear ? `${state.shadeFront}/${state.shadeRear}` : state.shadeFront || state.shadeRear)
            : state.shadeFront,
          price,
          discountAmount: discount,
          duration: duration || svc?.duration_minutes || 60,
        });
      }

      // Add-on services
      for (const addonKey of state.selectedAddons) {
        const addonConfig = state.addonConfigs[addonKey];
        if (!addonConfig?.filmId) continue;

        const film = config.films.find(f => f.id === addonConfig.filmId);
        const price = calculateServicePrice(
          selectedVehicle, addonKey, addonConfig.filmId,
          config.pricing, config.vehicleClasses, config.vehiclePricingOverrides
        );
        const hasPrimary = !!state.primaryServiceKey;
        const discount = calculateDiscount(
          addonKey, price, film?.name || null,
          hasPrimary, activeDiscounts, state.gcValidation
        );
        const { duration } = lookupPrice(selectedVehicle, addonKey, addonConfig.filmId, config.pricing);
        const svc = config.services.find(s => s.service_key === addonKey);

        services.push({
          module: 'auto_tint',
          serviceKey: addonKey,
          label: svc?.label || addonKey,
          filmId: addonConfig.filmId,
          filmName: film?.name || null,
          filmAbbrev: film?.abbreviation || null,
          shadeFront: addonConfig.shade,
          shadeRear: null,
          shade: addonConfig.shade,
          price,
          discountAmount: discount,
          duration: duration || svc?.duration_minutes || 30,
        });
      }
    } else if (state.serviceType === 'removal') {
      for (const removalKey of state.selectedRemovals) {
        const price = calculateServicePrice(
          selectedVehicle, removalKey, null,
          config.pricing, config.vehicleClasses, config.vehiclePricingOverrides
        );
        const svc = config.services.find(s => s.service_key === removalKey);

        services.push({
          module: 'auto_tint',
          serviceKey: removalKey,
          label: svc?.label || removalKey,
          filmId: null,
          filmName: null,
          filmAbbrev: null,
          shadeFront: null,
          shadeRear: null,
          shade: null,
          price,
          discountAmount: 0,
          duration: svc?.duration_minutes || 30,
        });
      }
    } else if (state.serviceType === 'alacarte') {
      for (const windowKey of state.selectedAlaCarteWindows) {
        const windowConfig = state.alaCarteConfigs[windowKey];
        if (!windowConfig?.filmId) continue;

        const film = config.films.find(f => f.id === windowConfig.filmId);
        const price = calculateAlaCartePrice(
          selectedVehicle, windowKey, windowConfig.filmId, config.pricing
        );
        const svc = config.services.find(s => s.service_key === windowKey);

        services.push({
          module: 'auto_tint',
          serviceKey: windowKey,
          label: svc?.label || windowKey,
          filmId: windowConfig.filmId,
          filmName: film?.name || null,
          filmAbbrev: film?.abbreviation || null,
          shadeFront: windowConfig.shade,
          shadeRear: null,
          shade: windowConfig.shade,
          price,
          discountAmount: 0,
          duration: svc?.duration_minutes || 20,
        });
      }
    }

    return services;
  }, [config, selectedVehicle, state, requiresSplitShades]);

  // --- Price summary ---

  const priceSummary = useMemo((): PriceSummary => {
    const chargeDeposit = state.gcValidation ? state.gcValidation.chargeDeposit : true;
    const depositAmt = config?.shopConfig.deposit_amount || 50;
    return buildPriceSummary(selectedServices, state.gcValidation, depositAmt, chargeDeposit);
  }, [selectedServices, state.gcValidation, config]);

  // --- State updaters ---

  const setGCValidation = useCallback((gc: GCValidation | null) => {
    setState(s => ({ ...s, gcValidation: gc }));
  }, []);

  const setYear = useCallback((year: string) => {
    setState(s => ({
      ...s,
      selectedYear: year,
      selectedMake: '',
      selectedModel: '',
      selectedVehicle: null,
      primaryServiceKey: null,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
      selectedRemovals: new Set(),
      selectedAlaCarteWindows: new Set(),
      alaCarteConfigs: {},
      teslaClassKey: null,
    }));
  }, []);

  const setMake = useCallback((make: string) => {
    setState(s => ({
      ...s,
      selectedMake: make,
      selectedModel: '',
      selectedVehicle: null,
      primaryServiceKey: null,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
      selectedRemovals: new Set(),
      selectedAlaCarteWindows: new Set(),
      alaCarteConfigs: {},
      teslaClassKey: null,
    }));
  }, []);

  const setModel = useCallback((model: string) => {
    setState(s => ({
      ...s,
      selectedModel: model,
      primaryServiceKey: null,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
      selectedRemovals: new Set(),
      selectedAlaCarteWindows: new Set(),
      alaCarteConfigs: {},
      teslaClassKey: null,
    }));
  }, []);

  const setServiceType = useCallback((type: ServiceType) => {
    setState(s => ({
      ...s,
      serviceType: type,
      primaryServiceKey: null,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
      selectedRemovals: new Set(),
      selectedAlaCarteWindows: new Set(),
      alaCarteConfigs: {},
    }));
  }, []);

  const setPrimaryService = useCallback((key: string | null) => {
    setState(s => ({
      ...s,
      primaryServiceKey: key,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
    }));
  }, []);

  const setFilm = useCallback((filmId: number | null) => {
    setState(s => ({
      ...s,
      selectedFilmId: filmId,
      shadeFront: null,
      shadeRear: null,
    }));
  }, []);

  const setShadeFront = useCallback((shade: string | null) => {
    setState(s => {
      const next = { ...s, shadeFront: shade };
      if (s.shadeUniform) next.shadeRear = shade;
      return next;
    });
  }, []);

  const setShadeRear = useCallback((shade: string | null) => {
    setState(s => ({ ...s, shadeRear: shade }));
  }, []);

  const setShadeUniform = useCallback((uniform: boolean) => {
    setState(s => {
      const next = { ...s, shadeUniform: uniform };
      if (uniform && s.shadeFront) next.shadeRear = s.shadeFront;
      return next;
    });
  }, []);

  const toggleAddon = useCallback((key: string) => {
    setState(s => {
      const next = new Set(s.selectedAddons);
      const configs = { ...s.addonConfigs };
      if (next.has(key)) {
        next.delete(key);
        delete configs[key];
      } else {
        next.add(key);
        // Sun strip defaults to Black film, 5% shade
        if (key === 'SUN_STRIP' && config) {
          const blackFilm = config.films.find(f => f.name === 'Black');
          if (blackFilm) {
            configs[key] = { filmId: blackFilm.id, shade: '5%' };
          }
        } else {
          configs[key] = { filmId: null, shade: null };
        }
      }
      return { ...s, selectedAddons: next, addonConfigs: configs };
    });
  }, [config]);

  const setAddonFilm = useCallback((addonKey: string, filmId: number | null) => {
    setState(s => ({
      ...s,
      addonConfigs: {
        ...s.addonConfigs,
        [addonKey]: { ...s.addonConfigs[addonKey], filmId, shade: null },
      },
    }));
  }, []);

  const setAddonShade = useCallback((addonKey: string, shade: string | null) => {
    setState(s => ({
      ...s,
      addonConfigs: {
        ...s.addonConfigs,
        [addonKey]: { ...s.addonConfigs[addonKey], shade },
      },
    }));
  }, []);

  const toggleRemoval = useCallback((key: string) => {
    setState(s => {
      const next = new Set(s.selectedRemovals);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...s, selectedRemovals: next };
    });
  }, []);

  const toggleAlaCarteWindow = useCallback((key: string) => {
    setState(s => {
      const next = new Set(s.selectedAlaCarteWindows);
      const configs = { ...s.alaCarteConfigs };
      if (next.has(key)) {
        next.delete(key);
        delete configs[key];
      } else {
        next.add(key);
        configs[key] = { filmId: null, shade: null };
      }
      return { ...s, selectedAlaCarteWindows: next, alaCarteConfigs: configs };
    });
  }, []);

  const setAlaCarteFilm = useCallback((windowKey: string, filmId: number | null) => {
    setState(s => ({
      ...s,
      alaCarteConfigs: {
        ...s.alaCarteConfigs,
        [windowKey]: { ...s.alaCarteConfigs[windowKey], filmId, shade: null },
      },
    }));
  }, []);

  const setAlaCarteShade = useCallback((windowKey: string, shade: string | null) => {
    setState(s => ({
      ...s,
      alaCarteConfigs: {
        ...s.alaCarteConfigs,
        [windowKey]: { ...s.alaCarteConfigs[windowKey], shade },
      },
    }));
  }, []);

  const setTeslaClassKey = useCallback((key: string | null) => {
    setState(s => ({ ...s, teslaClassKey: key }));
  }, []);

  const setAppointmentType = useCallback((type: AppointmentType) => {
    setState(s => ({ ...s, appointmentType: type, selectedTime: '' }));
  }, []);

  const setField = useCallback((field: keyof BookingState, value: string | boolean) => {
    setState(s => ({ ...s, [field]: value }));
  }, []);

  const toggleInterest = useCallback((interest: string) => {
    setState(s => {
      const next = new Set(s.additionalInterests);
      if (next.has(interest)) next.delete(interest);
      else next.add(interest);
      return { ...s, additionalInterests: next };
    });
  }, []);

  // Bulk pre-fill YMM (used by lead links to set all three at once)
  const prefillVehicle = useCallback((year: string, make: string, model: string) => {
    setState(s => ({
      ...s,
      selectedYear: year,
      selectedMake: make,
      selectedModel: model,
      primaryServiceKey: null,
      selectedFilmId: null,
      shadeFront: null,
      shadeRear: null,
      selectedAddons: new Set(),
      addonConfigs: {},
      selectedRemovals: new Set(),
      selectedAlaCarteWindows: new Set(),
      alaCarteConfigs: {},
      teslaClassKey: null,
    }));
  }, []);

  return {
    state,
    loading,
    // Derived data
    years,
    makes,
    models,
    selectedVehicle,
    availableFilms,
    requiresSplitShades,
    isTesla3,
    selectedServices,
    priceSummary,
    // Actions
    setGCValidation,
    setYear,
    setMake,
    setModel,
    setServiceType,
    setPrimaryService,
    setFilm,
    setShadeFront,
    setShadeRear,
    setShadeUniform,
    toggleAddon,
    setAddonFilm,
    setAddonShade,
    toggleRemoval,
    toggleAlaCarteWindow,
    setAlaCarteFilm,
    setAlaCarteShade,
    setTeslaClassKey,
    setAppointmentType,
    setField,
    toggleInterest,
    prefillVehicle,
  };
}
