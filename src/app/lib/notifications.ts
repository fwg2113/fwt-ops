// ============================================================================
// AUTOMATED NOTIFICATION SYSTEM
// Server-side only. Sends SMS/email notifications for key events:
// - New online booking confirmed
// - Quote approved by customer
// - Payment received
// ============================================================================

import { sendSms, sendEmailRaw } from './messaging';
import { supabaseAdmin } from './supabase-server';

interface BookingData {
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  services_json: unknown[];
  subtotal: number;
  deposit_paid: number;
  balance_due: number;
  module: string;
}

interface ShopNotificationConfig {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  notification_phone: string | null; // team phone for alerts (defaults to shop_phone)
  notification_email: string | null; // team email for alerts
  notify_team_new_booking: boolean;
  notify_team_quote_approved: boolean;
  notify_team_payment_received: boolean;
  notify_customer_booking_confirmed: boolean;
  customer_booking_confirmation_template: string;
}

const DEFAULT_CUSTOMER_CONFIRMATION = 'Hi {customer_first_name}, your appointment at {shop_name} has been confirmed for {appointment_date} at {appointment_time}. {vehicle_year} {vehicle_make} {vehicle_model}. We look forward to seeing you!';

function formatDate(date: string | null): string {
  if (!date) return '';
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { return date; }
}

function formatTime(time: string | null): string {
  if (!time) return '';
  try {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return time; }
}

function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function wrapEmailHtml(shopName: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:20px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<div style="background:#1a1a1a;padding:20px;text-align:center;color:#fff;font-size:18px;font-weight:600;">${escapeHtml(shopName)}</div>
<div style="padding:24px;color:#333;font-size:14px;line-height:1.6;">${body}</div>
</div></body></html>`;
}

async function getShopNotificationConfig(shopId: number): Promise<ShopNotificationConfig | null> {
  const { data } = await supabaseAdmin
    .from('shop_config')
    .select('shop_name, shop_phone, shop_address, notification_phone, notification_email, notify_team_new_booking, notify_team_quote_approved, notify_team_payment_received, notify_customer_booking_confirmed, customer_booking_confirmation_template')
    .eq('id', shopId)
    .single();

  if (!data) return null;

  return {
    shop_name: data.shop_name || '',
    shop_phone: data.shop_phone || '',
    shop_address: data.shop_address || '',
    notification_phone: data.notification_phone || data.shop_phone || null,
    notification_email: data.notification_email || null,
    notify_team_new_booking: data.notify_team_new_booking !== false, // default true
    notify_team_quote_approved: data.notify_team_quote_approved !== false,
    notify_team_payment_received: data.notify_team_payment_received !== false,
    notify_customer_booking_confirmed: data.notify_customer_booking_confirmed !== false,
    customer_booking_confirmation_template: data.customer_booking_confirmation_template || DEFAULT_CUSTOMER_CONFIRMATION,
  };
}

// ---- NEW BOOKING CONFIRMED ----
export async function notifyNewBooking(shopId: number, booking: BookingData) {
  const config = await getShopNotificationConfig(shopId);
  if (!config) return;

  const vehicle = [booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(' ');
  const dateDisplay = formatDate(booking.appointment_date);
  const timeDisplay = formatTime(booking.appointment_time);

  // Team notification
  if (config.notify_team_new_booking && config.notification_phone) {
    const teamMsg = `New Booking: ${booking.customer_name} - ${vehicle}. ${dateDisplay} at ${timeDisplay}. Deposit: $${booking.deposit_paid}. Balance: $${booking.balance_due}.`;
    await sendSms(config.notification_phone, teamMsg);
  }

  // Also send team email if configured
  if (config.notify_team_new_booking && config.notification_email) {
    const subject = `New Booking: ${booking.customer_name} - ${vehicle}`;
    const html = wrapEmailHtml(config.shop_name, `
      <h2>New Online Booking</h2>
      <p><strong>Customer:</strong> ${booking.customer_name}</p>
      <p><strong>Phone:</strong> ${booking.customer_phone || 'N/A'}</p>
      <p><strong>Vehicle:</strong> ${vehicle}</p>
      <p><strong>Date:</strong> ${dateDisplay} at ${timeDisplay}</p>
      <p><strong>Deposit Paid:</strong> $${booking.deposit_paid}</p>
      <p><strong>Balance Due:</strong> $${booking.balance_due}</p>
    `);
    await sendEmailRaw(config.notification_email, subject, html, config.shop_name);
  }

  // Customer confirmation
  if (config.notify_customer_booking_confirmed && booking.customer_phone) {
    const vars: Record<string, string> = {
      customer_name: booking.customer_name,
      customer_first_name: booking.customer_name.split(' ')[0] || booking.customer_name,
      vehicle_year: booking.vehicle_year ? String(booking.vehicle_year) : '',
      vehicle_make: booking.vehicle_make || '',
      vehicle_model: booking.vehicle_model || '',
      shop_name: config.shop_name,
      shop_phone: config.shop_phone,
      shop_address: config.shop_address,
      appointment_date: dateDisplay,
      appointment_time: timeDisplay,
    };
    const customerMsg = substituteVars(config.customer_booking_confirmation_template, vars);
    await sendSms(booking.customer_phone, customerMsg);
  }

  // Customer confirmation email
  if (config.notify_customer_booking_confirmed && booking.customer_email) {
    const e = escapeHtml;
    const html = wrapEmailHtml(config.shop_name, `
      <h2>Appointment Confirmed</h2>
      <p>Hi ${e(booking.customer_name.split(' ')[0])},</p>
      <p>Your appointment at <strong>${e(config.shop_name)}</strong> has been confirmed.</p>
      <p><strong>Date:</strong> ${e(dateDisplay)} at ${e(timeDisplay)}</p>
      <p><strong>Vehicle:</strong> ${e([booking.vehicle_year, booking.vehicle_make, booking.vehicle_model].filter(Boolean).join(' '))}</p>
      <p><strong>Deposit Paid:</strong> $${booking.deposit_paid}</p>
      <p><strong>Balance Due:</strong> $${booking.balance_due}</p>
      <p>We look forward to seeing you!</p>
      <p>${e(config.shop_name)}<br>${e(config.shop_phone)}<br>${e(config.shop_address)}</p>
    `);
    await sendEmailRaw(booking.customer_email, `Appointment Confirmed - ${escapeHtml(config.shop_name)}`, html, config.shop_name);
  }
}

// ---- QUOTE APPROVED ----
export async function notifyQuoteApproved(shopId: number, customerName: string, vehicle: string, total: number) {
  const config = await getShopNotificationConfig(shopId);
  if (!config) return;

  if (config.notify_team_quote_approved && config.notification_phone) {
    const msg = `Quote Approved: ${customerName} - ${vehicle}. Total: $${total}.`;
    await sendSms(config.notification_phone, msg);
  }

  if (config.notify_team_quote_approved && config.notification_email) {
    const html = wrapEmailHtml(config.shop_name, `
      <h2>Quote Approved</h2>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Vehicle:</strong> ${vehicle}</p>
      <p><strong>Total:</strong> $${total}</p>
    `);
    await sendEmailRaw(config.notification_email, `Quote Approved: ${customerName} - ${vehicle}`, html, config.shop_name);
  }
}

// ---- PAYMENT RECEIVED ----
export async function notifyPaymentReceived(shopId: number, customerName: string, amount: number, method: string, vehicle: string) {
  const config = await getShopNotificationConfig(shopId);
  if (!config) return;

  if (config.notify_team_payment_received && config.notification_phone) {
    const msg = `Payment Received: $${amount} from ${customerName} (${vehicle}) via ${method}.`;
    await sendSms(config.notification_phone, msg);
  }

  if (config.notify_team_payment_received && config.notification_email) {
    const html = wrapEmailHtml(config.shop_name, `
      <h2>Payment Received</h2>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Vehicle:</strong> ${vehicle}</p>
      <p><strong>Amount:</strong> $${amount}</p>
      <p><strong>Method:</strong> ${method}</p>
    `);
    await sendEmailRaw(config.notification_email, `Payment: $${amount} from ${customerName}`, html, config.shop_name);
  }
}
