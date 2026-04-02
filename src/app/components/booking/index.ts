// Shared booking components — used by both public booking page and dashboard Appointment Manager
export { default as FilmCard } from './FilmCard';
export { default as ShadePicker } from './ShadePicker';
export { default as VehicleSelector } from './VehicleSelector';
export { default as ServiceTypeSelector } from './ServiceTypeSelector';

// Re-export types and pricing engine
export * from './types';
export * from './pricing';
