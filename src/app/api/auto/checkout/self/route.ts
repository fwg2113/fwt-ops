import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createInvoiceFromBooking } from '@/app/lib/invoice-utils';

// ============================================================================
// GET /api/auto/checkout/self
// Returns items available for self-checkout based on shop config
// Phone numbers are masked (last 4 digits only) for privacy
// ============================================================================
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Fetch shop config for checkout flow settings
    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('shop_name, checkout_flow_config, self_checkout_enabled, self_checkout_heading, self_checkout_subtext')
      .eq('id', 1)
      .single();

    // If self-checkout is disabled, return disabled flag
    if (!shopConfig?.self_checkout_enabled) {
      return NextResponse.json({
        enabled: false,
        appointments: [],
        shopName: shopConfig?.shop_name || '',
        heading: '',
        subtext: '',
        date: today,
      });
    }

    const config = shopConfig?.checkout_flow_config as {
      self_checkout_availability?: string;
    } | null;

    const availability = config?.self_checkout_availability || 'after_invoice';

    let results: CheckoutItem[] = [];

    if (availability === 'after_invoice') {
      // Only show invoices that have been explicitly created
      const { data: invoices } = await supabaseAdmin
        .from('documents')
        .select('id, public_token, booking_id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, balance_due, status')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .in('status', ['draft', 'sent', 'viewed'])
        .order('created_at', { ascending: true });

      results = (invoices || []).map(inv => ({
        id: inv.booking_id || inv.id,
        bookingId: inv.booking_id || '',
        customerFirstName: inv.customer_name?.split(' ')[0] || '',
        maskedPhone: maskPhone(inv.customer_phone),
        vehicleYear: inv.vehicle_year,
        vehicleMake: inv.vehicle_make,
        vehicleModel: inv.vehicle_model,
        balanceDue: inv.balance_due,
        status: inv.status,
        invoiceToken: inv.public_token,
        invoiceStatus: inv.status,
      }));
    } else {
      // after_checkin or after_ready — query bookings, cross-reference invoices
      const statusFilter = availability === 'after_ready'
        ? ['completed', 'invoiced']
        : ['in_progress', 'completed', 'invoiced'];

      const { data: appointments } = await supabaseAdmin
        .from('auto_bookings')
        .select('id, booking_id, customer_name, customer_phone, vehicle_year, vehicle_make, vehicle_model, balance_due, status, appointment_type')
        .eq('appointment_date', today)
        .in('status', statusFilter)
        .order('appointment_time', { ascending: true });

      // Fetch existing invoices for these bookings
      const bookingIds = (appointments || []).map(a => a.id);
      const { data: invoices } = bookingIds.length > 0
        ? await supabaseAdmin
            .from('documents')
            .select('booking_id, public_token, status')
            .in('booking_id', bookingIds)
        : { data: [] };

      const invoiceMap = new Map<string, { token: string; status: string }>();
      if (invoices) {
        for (const inv of invoices) {
          if (inv.booking_id) invoiceMap.set(inv.booking_id, { token: inv.public_token, status: inv.status });
        }
      }

      results = (appointments || [])
        .filter(apt => apt.balance_due > 0)
        .map(apt => {
          const invoice = invoiceMap.get(apt.id);
          return {
            id: apt.id,
            bookingId: apt.booking_id,
            customerFirstName: apt.customer_name?.split(' ')[0] || '',
            maskedPhone: maskPhone(apt.customer_phone),
            vehicleYear: apt.vehicle_year,
            vehicleMake: apt.vehicle_make,
            vehicleModel: apt.vehicle_model,
            balanceDue: apt.balance_due,
            status: apt.status,
            invoiceToken: invoice?.token || null,
            invoiceStatus: invoice?.status || null,
          };
        });
    }

    return NextResponse.json({
      enabled: true,
      appointments: results,
      shopName: shopConfig?.shop_name || '',
      heading: shopConfig?.self_checkout_heading || 'Self Checkout',
      subtext: shopConfig?.self_checkout_subtext || 'Find your vehicle below to view your invoice and pay',
      date: today,
    });
  } catch (error) {
    console.error('Self-checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// POST /api/auto/checkout/self
// Creates an invoice on-demand for a self-checkout customer
// ============================================================================
export async function POST(request: NextRequest) {
  try {
    const { bookingId } = await request.json();
    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 });
    }

    const result = await createInvoiceFromBooking(bookingId, 'self_checkout');

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ token: result.document.public_token });
  } catch (error) {
    console.error('Self-checkout create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// HELPERS
// ============================================================================
interface CheckoutItem {
  id: string;
  bookingId: string;
  customerFirstName: string;
  maskedPhone: string;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  balanceDue: number;
  status: string;
  invoiceToken: string | null;
  invoiceStatus: string | null;
}

function maskPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : '';
}
