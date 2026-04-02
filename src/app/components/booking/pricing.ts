// ============================================================================
// PRICING ENGINE
// Ported from legacy Apps Script + fwt-booking.js PricingCalculator
// Handles: class-key resolution, ADD_FEE, discounts, duration calc
// ============================================================================

import type {
  AutoVehicle, AutoPricing, AutoFilm, AutoService,
  AutoDiscount, AutoVehicleClass, AutoClassRule,
  GCValidation, SelectedService,
} from './types';

// --------------------------------------------------------------------------
// Class-key priority resolution
// Vehicle has an array of class_keys. Pricing table has rows per class_key.
// First class_key in the array that has a matching pricing row wins.
// Wildcard '*' matches any vehicle (used for sunroofs, removals, etc.)
// --------------------------------------------------------------------------

export function resolveClassKey(
  vehicle: AutoVehicle,
  serviceKey: string,
  filmId: number | null,
  pricing: AutoPricing[]
): string | null {
  // Try each class key in order (first match wins)
  for (const ck of vehicle.class_keys) {
    const match = pricing.find(p =>
      p.class_key === ck &&
      p.service_key === serviceKey &&
      (filmId === null ? p.film_id === null : p.film_id === filmId)
    );
    if (match) return ck;
  }

  // Fall back to wildcard
  const wildcard = pricing.find(p =>
    p.class_key === '*' &&
    p.service_key === serviceKey &&
    (filmId === null ? p.film_id === null : p.film_id === filmId)
  );
  if (wildcard) return '*';

  return null;
}

// --------------------------------------------------------------------------
// Look up price for a specific service + film + vehicle combo
// --------------------------------------------------------------------------

export function lookupPrice(
  vehicle: AutoVehicle,
  serviceKey: string,
  filmId: number | null,
  pricing: AutoPricing[]
): { price: number; duration: number | null; classKey: string | null } {
  const classKey = resolveClassKey(vehicle, serviceKey, filmId, pricing);
  if (!classKey) return { price: 0, duration: null, classKey: null };

  const row = pricing.find(p =>
    p.class_key === classKey &&
    p.service_key === serviceKey &&
    (filmId === null ? p.film_id === null : p.film_id === filmId)
  );

  return {
    price: row ? Number(row.price) : 0,
    duration: row?.duration_minutes ?? null,
    classKey,
  };
}

// --------------------------------------------------------------------------
// Calculate ADD_FEE for FULL_SIDES
// ADD_FEE surcharges are cumulative based on vehicle class
// --------------------------------------------------------------------------

export function getAddFee(
  vehicle: AutoVehicle,
  vehicleClasses: AutoVehicleClass[]
): number {
  let totalFee = 0;
  for (const ck of vehicle.class_keys) {
    const vc = vehicleClasses.find(c => c.class_key === ck);
    if (vc && vc.add_fee > 0) {
      totalFee += Number(vc.add_fee);
    }
  }
  return totalFee;
}

// --------------------------------------------------------------------------
// Calculate total price for a selected service
// Handles: base price + ADD_FEE (FULL_SIDES only)
// --------------------------------------------------------------------------

export function calculateServicePrice(
  vehicle: AutoVehicle,
  serviceKey: string,
  filmId: number | null,
  pricing: AutoPricing[],
  vehicleClasses: AutoVehicleClass[],
  vehiclePricingOverrides?: { vehicle_id: number; service_key: string; film_id: number | null; price: number }[]
): number {
  // Priority 1: Per-vehicle pricing override (highest priority)
  if (vehiclePricingOverrides && vehicle.id) {
    const override = vehiclePricingOverrides.find(o =>
      o.vehicle_id === vehicle.id &&
      o.service_key === serviceKey &&
      (filmId === null ? o.film_id === null : o.film_id === filmId)
    );
    if (override) return Number(override.price);
  }

  // Priority 2: Class-level pricing from auto_pricing
  const { price } = lookupPrice(vehicle, serviceKey, filmId, pricing);

  // ADD_FEE only applies to FULL_SIDES
  if (serviceKey === 'FULL_SIDES') {
    const addFee = getAddFee(vehicle, vehicleClasses);
    return price + addFee;
  }

  return price;
}

// --------------------------------------------------------------------------
// A la carte pricing: single door = half of TWO_FRONT_DOORS price
// --------------------------------------------------------------------------

export function calculateAlaCartePrice(
  vehicle: AutoVehicle,
  serviceKey: string,
  filmId: number | null,
  pricing: AutoPricing[],
): number {
  // A la carte door services derive from TWO_FRONT_DOORS price
  const doorServices = ['ALACARTE_DFD', 'ALACARTE_PFD', 'ALACARTE_DRD', 'ALACARTE_PRD'];
  if (doorServices.includes(serviceKey)) {
    const { price: twoFrontPrice } = lookupPrice(vehicle, 'TWO_FRONT_DOORS', filmId, pricing);
    return Math.round(twoFrontPrice / 2);
  }

  // Quarter windows and rear window use wildcard pricing
  const { price } = lookupPrice(vehicle, serviceKey, filmId, pricing);
  return price;
}

// --------------------------------------------------------------------------
// Calculate discount for a service (10% add-on, etc.)
// Returns the discount AMOUNT (positive number to subtract)
// --------------------------------------------------------------------------

export function calculateDiscount(
  serviceKey: string,
  servicePrice: number,
  filmName: string | null,
  hasPrimaryService: boolean,
  discounts: AutoDiscount[],
  gcValidation: GCValidation | null,
): number {
  // If percent promo is active, it disables default discounts
  if (gcValidation?.disableDefaultDiscounts) return 0;

  let totalDiscount = 0;

  for (const discount of discounts) {
    // Skip multi-vehicle discounts (not applicable in single-vehicle flow)
    if (discount.applies_when_multi_vehicle) continue;

    // Check if discount applies to this service
    if (discount.applies_to_services.length > 0 &&
        !discount.applies_to_services.includes(serviceKey)) continue;

    // Check if primary service required
    if (discount.requires_primary && !hasPrimaryService) continue;

    // Check excluded films (Black film excluded from add-on discount)
    if (discount.excluded_films.length > 0 && filmName &&
        discount.excluded_films.includes(filmName)) continue;

    totalDiscount += servicePrice * (discount.percentage / 100);
  }

  return Math.round(totalDiscount);
}

// --------------------------------------------------------------------------
// Calculate total duration for all selected services
// Priority: pricing table duration > vehicle override > service default
// --------------------------------------------------------------------------

export function calculateDuration(
  vehicle: AutoVehicle,
  selectedServices: SelectedService[],
  services: AutoService[],
  pricing: AutoPricing[]
): number {
  let total = 0;

  for (const selected of selectedServices) {
    // Check pricing table for specific duration
    const { duration: pricingDuration } = lookupPrice(
      vehicle, selected.serviceKey, selected.filmId, pricing
    );

    if (pricingDuration) {
      total += pricingDuration;
    } else if (vehicle.duration_override_minutes) {
      // Vehicle-level override
      total += vehicle.duration_override_minutes;
    } else {
      // Service default
      const svc = services.find(s => s.service_key === selected.serviceKey);
      total += svc?.duration_minutes || 30;
    }
  }

  return total;
}

// --------------------------------------------------------------------------
// Build full price summary from booking state
// Returns: line items, subtotal, discount, deposit, balance
// --------------------------------------------------------------------------

export interface PriceSummary {
  lineItems: SelectedService[];
  subtotal: number;
  promoDiscount: number;
  defaultDiscountTotal: number;
  gcCredit: number;
  depositAmount: number;
  balanceDue: number;
  totalDuration: number;
}

export function buildPriceSummary(
  selectedServices: SelectedService[],
  gcValidation: GCValidation | null,
  depositAmount: number,
  chargeDeposit: boolean,
): PriceSummary {
  const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const defaultDiscountTotal = selectedServices.reduce((sum, s) => sum + s.discountAmount, 0);

  let promoDiscount = 0;
  let gcCredit = 0;

  if (gcValidation?.valid) {
    if (gcValidation.discountType === 'percent') {
      promoDiscount = Math.round(subtotal * (gcValidation.amount / 100));
    } else {
      gcCredit = gcValidation.amount;
    }
  }

  const afterDiscounts = subtotal - defaultDiscountTotal - promoDiscount - gcCredit;
  const finalDeposit = chargeDeposit ? depositAmount : 0;
  const balanceDue = Math.max(0, afterDiscounts - finalDeposit);

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);

  return {
    lineItems: selectedServices,
    subtotal,
    promoDiscount,
    defaultDiscountTotal,
    gcCredit,
    depositAmount: finalDeposit,
    balanceDue,
    totalDuration,
  };
}

// --------------------------------------------------------------------------
// Get allowed shades for a service + film combo
// Filters based on auto_service_shades restrictions
// --------------------------------------------------------------------------

export function getAllowedShades<T extends { id: number; film_id: number; shade_value: string; shade_numeric: number | null; sort_order: number }>(
  serviceKey: string,
  filmId: number,
  allShades: T[],
  serviceShades: { service_key: string; film_key: string; shade_value: string }[],
  films?: { id: number; name: string }[]
): T[] {
  // Get all shades for this film, sorted lowest percentage first
  const filmShades = allShades
    .filter(s => s.film_id === filmId)
    .sort((a, b) => (a.shade_numeric || 0) - (b.shade_numeric || 0));

  // Resolve film name for matching against service_shades.film_key
  const filmName = films?.find(f => f.id === filmId)?.name;

  // Check if this service has ANY shade rules at all
  const serviceHasRules = serviceShades.some(ss => ss.service_key === serviceKey);

  // If the service has no rules at all, all shades are allowed (unrestricted)
  if (!serviceHasRules) return filmShades;

  // Service has rules — find entries for this specific film + wildcards
  const restrictions = serviceShades.filter(ss =>
    ss.service_key === serviceKey &&
    (ss.film_key === filmName || ss.film_key === '*')
  );

  // If no entries for this film, the film is NOT available for this service
  if (restrictions.length === 0) return [];

  // Only return shades that are explicitly listed
  const allowedValues = new Set(restrictions.map(r => r.shade_value));
  return filmShades.filter(s => allowedValues.has(s.shade_value));
}

// --------------------------------------------------------------------------
// Check if vehicle is Tesla Model 3 (needs special handling)
// --------------------------------------------------------------------------

export function isTeslaModel3(vehicle: AutoVehicle): boolean {
  return vehicle.make === 'Tesla' && vehicle.model === 'Model 3';
}

// --------------------------------------------------------------------------
// Check if vehicle is Lucid Air (restricted film options)
// --------------------------------------------------------------------------

export function isLucidAir(vehicle: AutoVehicle): boolean {
  return vehicle.make === 'Lucid' && vehicle.model === 'Air';
}

// --------------------------------------------------------------------------
// Get films available for a vehicle (filters out restricted films)
// --------------------------------------------------------------------------

export function getAvailableFilms(
  vehicle: AutoVehicle,
  films: AutoFilm[]
): AutoFilm[] {
  if (isLucidAir(vehicle)) {
    // Lucid Air only gets Ceramic i3 and i3+
    return films.filter(f => f.name === 'Ceramic i3' || f.name === 'Ceramic i3+');
  }
  return films;
}

// --------------------------------------------------------------------------
// Determine if split front/rear shade pickers are needed
// Split only applies to primary "full" services (FULL_SIDES, etc.)
// NOT for TWO_FRONT_DOORS, windshield, sun strip, removal, or add-ons
// --------------------------------------------------------------------------

const SPLIT_ELIGIBLE_SERVICES = new Set([
  'FULL_SIDES', 'FULL_SIDES_AND_REAR', 'FULL',
]);

export function needsSplitShades(
  vehicle: AutoVehicle,
  classRules: AutoClassRule[],
  serviceKey?: string
): boolean {
  // If a service key is provided, only split for eligible full-vehicle services
  if (serviceKey && !SPLIT_ELIGIBLE_SERVICES.has(serviceKey)) return false;

  for (const ck of vehicle.class_keys) {
    const rule = classRules.find(r => r.class_key === ck);
    if (rule?.full_requires_split_front_rear) return true;
  }
  return false;
}

// --------------------------------------------------------------------------
// Build shade display string without trailing slash
// --------------------------------------------------------------------------
export function buildShadeDisplay(front: string | null, rear: string | null, isSplit: boolean): string | null {
  if (!front && !rear) return null;
  if (!isSplit) return front;
  if (front && rear) return `${front}/${rear}`;
  return front || rear || null;
}
