import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

interface ImportRow {
  // Customer fields
  first_name?: string;
  last_name?: string;
  name?: string; // combined name fallback
  phone?: string;
  email?: string;
  company?: string;
  // Vehicle (combined or separate fields)
  vehicle?: string; // "2024 Honda Civic" combined format
  vehicle_year?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  // Job fields
  job_date?: string;
  appointment_type?: string;
  full_service?: string;
  two_fd?: string;
  windshield?: string;
  sun_strip?: string;
  sun_roof?: string;
  removal?: string;
  film_type?: string;
  shade_front?: string;
  shade_rear?: string;
  subtotal?: number;
  discount?: number;
  discount_note?: string;
  nfw_amount?: number;
  tip?: number;
  total?: number;
  deposit?: number;
  balance_due?: number;
  starting_total?: number;
  upsell_amount?: number;
  payment_method?: string;
  processor?: string;
  source?: string;
  gc_code?: string;
  invoice_num?: string;
  notes?: string;
  services_summary?: string;
  notes_autoparse?: string;
}

// ---------------------------------------------------------------------------
// Auto-parse notes field to extract vehicle year, model, services, price
// Handles two formats:
//   Modern: "🌐 | 2025 | Sentra | FULL BLK 20% | $245 | #2328"
//   Legacy: "2014 Cherokee S9-20 WFI $175"
// ---------------------------------------------------------------------------
function parseNotesField(notes: string): {
  vehicle_year?: number; vehicle_model?: string;
  services_summary?: string; total?: number; invoice_num?: string;
} {
  const result: ReturnType<typeof parseNotesField> = {};
  const trimmed = notes.trim();

  // Format 1: pipe-delimited (modern)
  if (trimmed.includes(' | ')) {
    const parts = trimmed.split('|').map(s => s.trim());

    for (const part of parts) {
      // Skip empty parts, emoji-only parts, and known skip tokens
      if (!part) continue;
      if (part.length <= 4 && !/[a-zA-Z0-9$#]/.test(part)) continue;

      // Year (4-digit number between 1990-2099)
      const yearMatch = part.match(/^(19|20)\d{2}$/);
      if (yearMatch) { result.vehicle_year = parseInt(part); continue; }

      // Price ($XXX or $X,XXX.XX)
      const priceMatch = part.match(/^\$[\d,.]+$/);
      if (priceMatch) { result.total = parseFloat(part.replace(/[$,]/g, '')); continue; }

      // Invoice number (#XXXX)
      if (part.startsWith('#')) { result.invoice_num = part.replace('#', ''); continue; }

      // GC/promo codes
      if (part.startsWith('GC ') || part === 'Gift Certificate') continue;

      // If we have a year already but no model, this is likely the model
      if (result.vehicle_year && !result.vehicle_model) {
        result.vehicle_model = part;
        continue;
      }

      // Service descriptions (FULL, 2FD, WS, TS, PT, REM, etc.)
      if (/^(FULL|2FD|WS|TS|SR|PT|REM|REMOVAL)/.test(part)) {
        result.services_summary = result.services_summary
          ? `${result.services_summary} | ${part}`
          : part;
        continue;
      }

      // If nothing else matched and it looks like a service (contains film abbreviations)
      if (/\b(BLK|BC|i3|i3\+|AUT)\b/.test(part)) {
        result.services_summary = result.services_summary
          ? `${result.services_summary} | ${part}`
          : part;
      }
    }

    return result;
  }

  // Format 2: space-separated legacy ("2014 Cherokee S9-20 WFI $175")
  const legacyMatch = trimmed.match(/^(\d{4})\s+(.+?)(?:\s+(S\d+-\d+(?:\s+\w+)*))?(?:\s+\$(\d+(?:\.\d+)?))?$/);
  if (legacyMatch) {
    result.vehicle_year = parseInt(legacyMatch[1]);
    // The model is everything between year and service codes or price
    let remaining = legacyMatch[2];
    // Try to separate model from service codes (S5-20, PT, WFI, REM, NFW, NFF, NF2F)
    const svcMatch = remaining.match(/^(.+?)\s+((?:S\d+-\d+|PT|WFI|REM|NFW|NFF|NF2F)(?:\s+.*)?)$/);
    if (svcMatch) {
      result.vehicle_model = svcMatch[1].trim();
      result.services_summary = svcMatch[2].trim();
    } else {
      result.vehicle_model = remaining.trim();
    }
    if (legacyMatch[4]) result.total = parseFloat(legacyMatch[4]);
    return result;
  }

  // Fallback: try to extract just a year
  const yearOnly = trimmed.match(/\b(19|20)\d{2}\b/);
  if (yearOnly) result.vehicle_year = parseInt(yearOnly[0]);

  return result;
}

// POST /api/customers/import
// Bulk import customers + jobs from mapped CSV data
// Receives pre-mapped rows (column mapping done client-side)
export const POST = withShopAuth(async ({ shopId, req }) => {
  try {
    const { rows, batchId } = await req.json() as { rows: ImportRow[]; batchId: string };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const results = {
      customersCreated: 0,
      customersUpdated: 0,
      vehiclesCreated: 0,
      jobsCreated: 0,
      duplicatesSkipped: 0,
      errors: [] as string[],
    };

    // Build model-to-make lookup from YMM database for auto-resolving makes
    const { data: ymmData } = await supabase
      .from('auto_vehicles')
      .select('make, model')
      .eq('active', true);
    const modelToMake = new Map<string, string>();
    if (ymmData) {
      for (const v of ymmData) {
        // Store lowercase model -> make for case-insensitive lookup
        if (!modelToMake.has(v.model.toLowerCase())) {
          modelToMake.set(v.model.toLowerCase(), v.make);
        }
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Resolve name
        let firstName = row.first_name || '';
        let lastName = row.last_name || '';
        if (!firstName && !lastName && row.name) {
          const parts = row.name.trim().split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        }

        if (!firstName && !lastName) {
          results.errors.push(`Row ${i + 1}: No name provided`);
          continue;
        }

        // Auto-parse notes field if mapped -- fills in gaps from other columns
        if (row.notes_autoparse) {
          const parsed = parseNotesField(row.notes_autoparse);
          // Always fill missing fields -- don't skip just because one field (like year) exists
          if (parsed.vehicle_year && !row.vehicle_year) row.vehicle_year = String(parsed.vehicle_year);
          if (parsed.vehicle_model && !row.vehicle_model && !row.vehicle) row.vehicle_model = parsed.vehicle_model;
          if (parsed.vehicle_model && !row.vehicle_make) {
            // Resolve make from YMM database
            row.vehicle_make = modelToMake.get(parsed.vehicle_model.toLowerCase()) || undefined;
          }
          if (parsed.services_summary && !row.services_summary) row.services_summary = parsed.services_summary;
          if (parsed.total && !row.total) row.total = parsed.total;
          if (parsed.invoice_num && !row.invoice_num) row.invoice_num = parsed.invoice_num;
          if (!row.notes) row.notes = row.notes_autoparse;
        }

        // Clean phone
        const phone = row.phone ? String(row.phone).replace(/\D/g, '').replace(/\.0$/, '') : null;

        // Upsert customer by phone first, email second
        let customerId: string | null = null;
        let isNew = false;

        if (phone) {
          const { data: byPhone } = await supabase
            .from('customers')
            .select('id')
            .eq('shop_id', shopId)
            .eq('phone', phone)
            .single();

          if (byPhone) {
            customerId = byPhone.id;
            // Update name/email if better data
            await supabase
              .from('customers')
              .update({
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                email: row.email || undefined,
                company_name: row.company || undefined,
                updated_at: new Date().toISOString(),
              })
              .eq('id', customerId);
            results.customersUpdated++;
          }
        }

        if (!customerId && row.email) {
          const { data: byEmail } = await supabase
            .from('customers')
            .select('id')
            .eq('shop_id', shopId)
            .eq('email', row.email)
            .single();

          if (byEmail) {
            customerId = byEmail.id;
            await supabase
              .from('customers')
              .update({
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                phone: phone || undefined,
                company_name: row.company || undefined,
                updated_at: new Date().toISOString(),
              })
              .eq('id', customerId);
            results.customersUpdated++;
          }
        }

        if (!customerId) {
          // Create new customer
          const { data: newCustomer, error: custErr } = await supabase
            .from('customers')
            .insert({
              shop_id: shopId,
              first_name: firstName,
              last_name: lastName,
              phone,
              email: row.email || null,
              company_name: row.company || null,
            })
            .select('id')
            .single();

          if (custErr || !newCustomer) {
            results.errors.push(`Row ${i + 1}: Failed to create customer - ${custErr?.message}`);
            continue;
          }
          customerId = newCustomer.id;
          isNew = true;
          results.customersCreated++;
        }

        // Parse vehicle from "2024 Civic" or "2024 Honda Civic" format
        let vehicleId: number | null = null;
        let vehicleYear: number | null = null;
        let vehicleMake = '';
        let vehicleModel = '';

        // Prefer separate year/make/model fields, fall back to combined vehicle string
        if (row.vehicle_year || row.vehicle_make || row.vehicle_model) {
          vehicleYear = row.vehicle_year ? parseInt(String(row.vehicle_year).replace(/\.0$/, '')) : null;
          if (vehicleYear && (vehicleYear < 1900 || vehicleYear > 2100)) vehicleYear = null;
          vehicleModel = row.vehicle_model || 'Unknown';
          // Resolve make: use explicit field, or look up from YMM database by model
          vehicleMake = row.vehicle_make || modelToMake.get(vehicleModel.toLowerCase()) || 'Unknown';
        } else if (row.vehicle) {
          const vParts = row.vehicle.trim().split(/\s+/);
          const yearCandidate = parseInt(vParts[0]);
          if (yearCandidate > 1900 && yearCandidate < 2100) {
            vehicleYear = yearCandidate;
            if (vParts.length >= 3) {
              vehicleMake = vParts[1];
              vehicleModel = vParts.slice(2).join(' ');
            } else if (vParts.length === 2) {
              vehicleModel = vParts[1];
              vehicleMake = modelToMake.get(vehicleModel.toLowerCase()) || 'Unknown';
            }
          } else {
            vehicleModel = row.vehicle;
            vehicleMake = modelToMake.get(vehicleModel.toLowerCase()) || 'Unknown';
          }
        }

        // Final make resolution attempt from YMM database
        if (vehicleMake === 'Unknown' && vehicleModel && vehicleModel !== 'Unknown') {
          vehicleMake = modelToMake.get(vehicleModel.toLowerCase()) || 'Unknown';
        }

        if (vehicleModel && vehicleModel !== 'Unknown') {
          // Upsert customer vehicle
          const { data: existingVehicle } = await supabase
            .from('customer_vehicles')
            .select('id')
            .eq('shop_id', shopId)
            .eq('customer_id', customerId)
            .eq('vehicle_make', vehicleMake)
            .eq('vehicle_model', vehicleModel)
            .single();

          if (existingVehicle) {
            vehicleId = Number(existingVehicle.id);
            await supabase
              .from('customer_vehicles')
              .update({
                last_seen: row.job_date || new Date().toISOString().split('T')[0],
              })
              .eq('id', vehicleId);
          } else {
            const { data: newVehicle } = await supabase
              .from('customer_vehicles')
              .insert({
                shop_id: shopId,
                customer_id: customerId,
                vehicle_year: vehicleYear,
                vehicle_make: vehicleMake,
                vehicle_model: vehicleModel,
                first_seen: row.job_date || new Date().toISOString().split('T')[0],
                last_seen: row.job_date || new Date().toISOString().split('T')[0],
              })
              .select('id')
              .single();

            if (newVehicle) {
              vehicleId = Number(newVehicle.id);
              results.vehiclesCreated++;
            }
          }
        }

        // Create job record if we have job data
        const hasJobData = row.job_date || row.total || row.subtotal || row.full_service || row.two_fd || row.windshield || row.film_type || row.services_summary;
        if (hasJobData) {
          const jobTotal = Number(row.total) || 0;
          const vehicleDescBuilt = [vehicleYear, vehicleMake !== 'Unknown' ? vehicleMake : null, vehicleModel !== 'Unknown' ? vehicleModel : null]
            .filter(Boolean).join(' ') || row.vehicle || null;

          const { error: jobErr } = await supabase
            .from('customer_jobs')
            .insert({
              shop_id: shopId,
              customer_id: customerId,
              vehicle_id: vehicleId || null,
              job_date: row.job_date || new Date().toISOString().split('T')[0],
              vehicle_desc: vehicleDescBuilt,
              vehicle_year: vehicleYear,
              vehicle_make: vehicleMake !== 'Unknown' ? vehicleMake : null,
              vehicle_model: vehicleModel !== 'Unknown' ? vehicleModel : null,
              services_summary: row.services_summary || null,
              film_type: row.film_type || null,
              shade_front: row.shade_front || null,
              shade_rear: row.shade_rear || null,
              appointment_type: row.appointment_type || null,
              full_service: row.full_service || null,
              two_fd: row.two_fd || null,
              windshield: row.windshield || null,
              sun_strip: row.sun_strip || null,
              sun_roof: row.sun_roof || null,
              removal: row.removal || null,
              subtotal: Number(row.subtotal) || 0,
              discount: Number(row.discount) || 0,
              discount_note: row.discount_note || null,
              nfw_amount: Number(row.nfw_amount) || 0,
              tip: Number(row.tip) || 0,
              total: jobTotal,
              deposit: Number(row.deposit) || 0,
              balance_due: Number(row.balance_due) || 0,
              starting_total: Number(row.starting_total) || 0,
              upsell_amount: Number(row.upsell_amount) || 0,
              payment_method: row.payment_method || null,
              processor: row.processor || null,
              source: row.source || null,
              gc_code: row.gc_code || null,
              invoice_num: row.invoice_num || null,
              notes: row.notes || null,
              import_batch_id: batchId,
            });

          if (jobErr) {
            results.errors.push(`Row ${i + 1}: Job insert failed - ${jobErr.message}`);
          } else {
            results.jobsCreated++;

            // Lifetime stats updated below
          }
        }

        // Update customer lifetime spend + visit count (manual since RPC may not exist)
        if (isNew || hasJobData) {
          const { data: jobStats } = await supabase
            .from('customer_jobs')
            .select('total, job_date')
            .eq('customer_id', customerId);

          const { data: bookingStats } = await supabase
            .from('auto_bookings')
            .select('subtotal, appointment_date')
            .eq('customer_id', customerId);

          const allTotals = [
            ...(jobStats || []).map(j => Number(j.total) || 0),
            ...(bookingStats || []).map(b => Number(b.subtotal) || 0),
          ];
          const allDates = [
            ...(jobStats || []).map(j => j.job_date),
            ...(bookingStats || []).map(b => b.appointment_date),
          ].filter(Boolean).sort();

          await supabase
            .from('customers')
            .update({
              lifetime_spend: allTotals.reduce((s, t) => s + t, 0),
              visit_count: allTotals.length,
              first_visit_date: allDates[0] || null,
              last_visit_date: allDates[allDates.length - 1] || null,
            })
            .eq('id', customerId);
        }

      } catch (rowError) {
        results.errors.push(`Row ${i + 1}: ${String(rowError)}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
});
