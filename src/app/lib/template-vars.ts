// ============================================================================
// TEMPLATE VARIABLE SUBSTITUTION
// Runs client-side before sending to the message API
// ============================================================================

export interface TemplateContext {
  customer_name: string;
  customer_first_name: string;
  vehicle_year: string;
  vehicle_make: string;
  vehicle_model: string;
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  invoice_link: string;
  appointment_date: string;
  appointment_time: string;
  review_link: string;
}

/**
 * Replace {variable} tokens in a template string with values from context.
 * Unknown variables are replaced with empty string.
 */
export function substituteTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = (ctx as unknown as Record<string, unknown>)[key];
    return val != null ? String(val) : '';
  });
}

/**
 * Build a TemplateContext from appointment data and shop config.
 * Used on the client side before sending messages.
 */
export function buildTemplateContext(
  appointment: {
    customer_name?: string;
    vehicle_year?: number | null;
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    appointment_date?: string | null;
    appointment_time?: string | null;
  },
  shopConfig: {
    shop_name?: string;
    shop_phone?: string;
    shop_address?: string;
    review_link?: string;
  },
  invoiceLink?: string | null
): TemplateContext {
  const fullName = appointment.customer_name || '';
  const firstName = fullName.split(' ')[0] || fullName;

  // Format date for display (e.g., "Monday, April 14")
  let dateDisplay = '';
  if (appointment.appointment_date) {
    dateDisplay = new Date(appointment.appointment_date + 'T12:00:00')
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // Format time for display (e.g., "8:30 AM")
  let timeDisplay = '';
  if (appointment.appointment_time) {
    try {
      timeDisplay = new Date(`2000-01-01T${appointment.appointment_time}`)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch { timeDisplay = appointment.appointment_time; }
  }

  return {
    customer_name: fullName,
    customer_first_name: firstName,
    vehicle_year: appointment.vehicle_year ? String(appointment.vehicle_year) : '',
    vehicle_make: appointment.vehicle_make || '',
    vehicle_model: appointment.vehicle_model || '',
    shop_name: shopConfig.shop_name || '',
    shop_phone: shopConfig.shop_phone || '',
    shop_address: shopConfig.shop_address || '',
    invoice_link: invoiceLink || '',
    appointment_date: dateDisplay,
    appointment_time: timeDisplay,
    review_link: shopConfig.review_link || '',
  };
}
