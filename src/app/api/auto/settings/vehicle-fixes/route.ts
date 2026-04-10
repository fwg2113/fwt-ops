// ============================================================================
// VEHICLE DATABASE FIXER API
// GET  — returns all proposed fixes
// POST — apply a fix (update class_keys on a vehicle)
// DELETE — dismiss a fix (mark as rejected, won't show again)
// ============================================================================

import { NextResponse } from 'next/server';
import { withShopAuth, getAdminClient } from '@/app/lib/auth-middleware';

// The proposed fixes from the 2026-04-10 audit. Each has:
//   id: stable identifier
//   vehicleId: auto_vehicles.id in the DB
//   make, model, yearStart, yearEnd: for display
//   category: severity grouping
//   issue: human-readable description
//   currentClassKeys: what the DB currently has
//   proposedClassKeys: what the spreadsheet says it should be
//   impact: what's wrong with current pricing
//   confidence: 'high' | 'medium' | 'needs_review'

interface ProposedFix {
  id: string;
  vehicleId: number;
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number;
  category: 'wrong_body_class' | 'missing_front_door' | 'missing_add_fee' | 'wrong_front_type' | 'missing_vehicle';
  issue: string;
  currentClassKeys: string[];
  proposedClassKeys: string[];
  impact: string;
  confidence: 'high' | 'medium' | 'needs_review';
}

const PROPOSED_FIXES: ProposedFix[] = [
  // === WRONG BODY CLASS (7 vehicles) ===
  { id: 'fix-hrv-861', vehicleId: 861, make: 'Honda', model: 'HR-V', yearStart: 2016, yearEnd: 2022,
    category: 'wrong_body_class', issue: 'Classified as 57_SUV but should be a smaller SUV class (5-7 window SUV, standard front doors)',
    currentClassKeys: ['57_SUV', 'FRONT2'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'Pricing may be correct but category is under review', confidence: 'needs_review' },

  { id: 'fix-prologue-874', vehicleId: 874, make: 'Honda', model: 'Prologue', yearStart: 2024, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Missing front door class and wrong body class (57_SUV instead of 911_SUV)',
    currentClassKeys: ['57_SUV'], proposedClassKeys: ['911_SUV', 'FRONT2_Q'],
    impact: 'Wrong full-sides price tier + no 2-front-door option available', confidence: 'needs_review' },

  { id: 'fix-ridgeline-876', vehicleId: 876, make: 'Honda', model: 'Ridgeline', yearStart: 2017, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Classified as 57_CAR (car) but Ridgeline is a truck/SUV body',
    currentClassKeys: ['57_CAR', 'FRONT2_Q'], proposedClassKeys: ['911_SUV', 'FRONT2_Q'],
    impact: 'Car pricing instead of SUV pricing for full sides', confidence: 'high' },

  { id: 'fix-ioniq9-1276', vehicleId: 1276, make: 'Hyundai', model: 'Ioniq 9', yearStart: 2026, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Classified as 57_CAR (car) but Ioniq 9 is a large electric SUV',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['911_SUV', 'FRONT2_Q'],
    impact: 'Car pricing, no front door option. Should be large SUV pricing', confidence: 'high' },

  { id: 'fix-telluride-1095', vehicleId: 1095, make: 'Kia', model: 'Telluride', yearStart: 2020, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Classified as 57_CAR (car) but Telluride is a midsize SUV',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'Car pricing, no front door option. Should be SUV with standard front doors', confidence: 'high' },

  // === INFINITI QX SUVs AS CARS (12 vehicles) ===
  { id: 'fix-qx56-1034', vehicleId: 1034, make: 'Infiniti', model: 'QX 56', yearStart: 2004, yearEnd: 2010,
    category: 'wrong_body_class', issue: 'Full-size SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option. Same dollar amount but wrong category', confidence: 'high' },
  { id: 'fix-qx56-1035', vehicleId: 1035, make: 'Infiniti', model: 'QX 56', yearStart: 2011, yearEnd: 2013,
    category: 'wrong_body_class', issue: 'Full-size SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx30-1036', vehicleId: 1036, make: 'Infiniti', model: 'QX30', yearStart: 2017, yearEnd: 2019,
    category: 'wrong_body_class', issue: 'Compact crossover classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx4-1037', vehicleId: 1037, make: 'Infiniti', model: 'QX4', yearStart: 2000, yearEnd: 2003,
    category: 'wrong_body_class', issue: 'Compact SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR', 'ADD_FEE_50'], proposedClassKeys: ['57_SUV', 'ADD_FEE_50', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx50-1038', vehicleId: 1038, make: 'Infiniti', model: 'QX50', yearStart: 2014, yearEnd: 2017,
    category: 'wrong_body_class', issue: 'Compact crossover classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx50-1039', vehicleId: 1039, make: 'Infiniti', model: 'QX50', yearStart: 2019, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Compact crossover classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx55-1040', vehicleId: 1040, make: 'Infiniti', model: 'QX55', yearStart: 2022, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Coupe crossover classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx60-1041', vehicleId: 1041, make: 'Infiniti', model: 'QX60', yearStart: 2015, yearEnd: 2020,
    category: 'wrong_body_class', issue: 'Midsize SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx60-1042', vehicleId: 1042, make: 'Infiniti', model: 'QX60', yearStart: 2022, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Midsize SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx70-1043', vehicleId: 1043, make: 'Infiniti', model: 'QX70', yearStart: 2014, yearEnd: 2017,
    category: 'wrong_body_class', issue: 'Sport SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx80-1044', vehicleId: 1044, make: 'Infiniti', model: 'QX80', yearStart: 2014, yearEnd: 2024,
    category: 'wrong_body_class', issue: 'Full-size luxury SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },
  { id: 'fix-qx80-1045', vehicleId: 1045, make: 'Infiniti', model: 'QX80', yearStart: 2025, yearEnd: 2026,
    category: 'wrong_body_class', issue: 'Full-size luxury SUV classified as 57_CAR',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_SUV', 'FRONT2'],
    impact: 'No front door option', confidence: 'high' },

  // === MISSING FRONT DOOR CLASS (17 vehicles) ===
  { id: 'fix-pacifica-770', vehicleId: 770, make: 'Chrysler', model: 'Pacifica', yearStart: 2004, yearEnd: 2008,
    category: 'missing_front_door', issue: 'Missing FRONT2_Q + has stray 911_CAR (should be FULL_SUV_VAN only)',
    currentClassKeys: ['911_CAR', 'FULL_SUV_VAN'], proposedClassKeys: ['FRONT2_Q', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option + wrong body class tier', confidence: 'needs_review' },
  { id: 'fix-pacifica-771', vehicleId: 771, make: 'Chrysler', model: 'Pacifica', yearStart: 2017, yearEnd: 2026,
    category: 'missing_front_door', issue: 'Missing FRONT2_Q + has stray 911_CAR',
    currentClassKeys: ['911_CAR', 'FULL_SUV_VAN'], proposedClassKeys: ['FRONT2_Q', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option + wrong body class tier', confidence: 'needs_review' },
  { id: 'fix-tc-777', vehicleId: 777, make: 'Chrysler', model: 'Town and Country', yearStart: 2000, yearEnd: 2000,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-tc-778', vehicleId: 778, make: 'Chrysler', model: 'Town and Country', yearStart: 2001, yearEnd: 2007,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-tc-779', vehicleId: 779, make: 'Chrysler', model: 'Town and Country', yearStart: 2008, yearEnd: 2016,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-voyager-780', vehicleId: 780, make: 'Chrysler', model: 'Voyager', yearStart: 2020, yearEnd: 2026,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-carnival-1049', vehicleId: 1049, make: 'Kia', model: 'Carnival', yearStart: 2021, yearEnd: 2026,
    category: 'missing_front_door', issue: 'Missing FRONT2_Q + has stray 911_CAR',
    currentClassKeys: ['911_CAR', 'FULL_SUV_VAN'], proposedClassKeys: ['FRONT2_Q', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option + wrong body class', confidence: 'needs_review' },
  { id: 'fix-sedona-1076', vehicleId: 1076, make: 'Kia', model: 'Sedona', yearStart: 2002, yearEnd: 2005,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-sedona-1077', vehicleId: 1077, make: 'Kia', model: 'Sedona', yearStart: 2006, yearEnd: 2012,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-sedona-1078', vehicleId: 1078, make: 'Kia', model: 'Sedona', yearStart: 2014, yearEnd: 2014,
    category: 'missing_front_door', issue: 'Missing FRONT2_Q',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2_Q', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-sedona-1079', vehicleId: 1079, make: 'Kia', model: 'Sedona', yearStart: 2015, yearEnd: 2021,
    category: 'missing_front_door', issue: 'Missing FRONT2_Q',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2_Q', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-savana-1138', vehicleId: 1138, make: 'GMC', model: 'Savana', yearStart: 2000, yearEnd: 2002,
    category: 'missing_front_door', issue: 'Missing FRONT2 + has stray 911_CAR',
    currentClassKeys: ['911_CAR', 'FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option + wrong body class', confidence: 'needs_review' },
  { id: 'fix-savana-1139', vehicleId: 1139, make: 'GMC', model: 'Savana', yearStart: 2003, yearEnd: 2026,
    category: 'missing_front_door', issue: 'Missing FRONT2 + has stray 911_CAR',
    currentClassKeys: ['911_CAR', 'FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option + wrong body class', confidence: 'needs_review' },
  { id: 'fix-navigator-1251', vehicleId: 1251, make: 'Lincoln', model: 'Navigator', yearStart: 2003, yearEnd: 2006,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-navigator-1252', vehicleId: 1252, make: 'Lincoln', model: 'Navigator', yearStart: 2007, yearEnd: 2017,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-navigator-1253', vehicleId: 1253, make: 'Lincoln', model: 'Navigator', yearStart: 2018, yearEnd: 2024,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },
  { id: 'fix-navigator-1254', vehicleId: 1254, make: 'Lincoln', model: 'Navigator', yearStart: 2025, yearEnd: 2026,
    category: 'missing_front_door', issue: 'Missing FRONT2',
    currentClassKeys: ['FULL_SUV_VAN'], proposedClassKeys: ['FRONT2', 'FULL_SUV_VAN'],
    impact: 'No 2-front-door option', confidence: 'high' },

  // === MISSING ADD_FEE (13 vehicles) ===
  { id: 'fix-mdx-809', vehicleId: 809, make: 'Acura', model: 'MDX', yearStart: 2001, yearEnd: 2006,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_50 surcharge',
    currentClassKeys: ['911_SUV', 'FRONT2'], proposedClassKeys: ['911_SUV', 'FRONT2', 'ADD_FEE_50'],
    impact: 'Undercharging $50 on full sides', confidence: 'high' },
  { id: 'fix-elise-1331', vehicleId: 1331, make: 'Lotus', model: 'Elise', yearStart: 2005, yearEnd: 2011,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-esprit-1332', vehicleId: 1332, make: 'Lotus', model: 'Esprit', yearStart: 2000, yearEnd: 2004,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-evora-1333', vehicleId: 1333, make: 'Lotus', model: 'Evora', yearStart: 2010, yearEnd: 2014,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-evora400-1334', vehicleId: 1334, make: 'Lotus', model: 'Evora 400', yearStart: 2017, yearEnd: 2017,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-evoragt-1335', vehicleId: 1335, make: 'Lotus', model: 'Evora GT', yearStart: 2020, yearEnd: 2020,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-exige-1336', vehicleId: 1336, make: 'Lotus', model: 'Exige', yearStart: 2006, yearEnd: 2011,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-emira-1337', vehicleId: 1337, make: 'Lotus', model: 'Emira', yearStart: 2022, yearEnd: 2026,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100 (exotic car surcharge)',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-tc04-1338', vehicleId: 1338, make: 'Scion', model: 'TC', yearStart: 2004, yearEnd: 2010,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-tc11-1339', vehicleId: 1339, make: 'Scion', model: 'TC', yearStart: 2011, yearEnd: 2016,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-xb04-1340', vehicleId: 1340, make: 'Scion', model: 'XB', yearStart: 2004, yearEnd: 2006,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100',
    currentClassKeys: ['911_CAR'], proposedClassKeys: ['911_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-xb08-1341', vehicleId: 1341, make: 'Scion', model: 'XB', yearStart: 2008, yearEnd: 2015,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },
  { id: 'fix-ia-1342', vehicleId: 1342, make: 'Scion', model: 'iA', yearStart: 2016, yearEnd: 2016,
    category: 'missing_add_fee', issue: 'Missing ADD_FEE_100',
    currentClassKeys: ['57_CAR'], proposedClassKeys: ['57_CAR', 'ADD_FEE_100'],
    impact: 'Undercharging $100 on full sides', confidence: 'needs_review' },

  // === WRONG FRONT DOOR TYPE (1 vehicle) ===
  { id: 'fix-ridgeline06-875', vehicleId: 875, make: 'Honda', model: 'Ridgeline', yearStart: 2006, yearEnd: 2014,
    category: 'wrong_front_type', issue: 'Has FRONT2_Q but should be FRONT2 (standard front doors, no quarter windows)',
    currentClassKeys: ['FRONT2_Q', '911_SUV'], proposedClassKeys: ['FRONT2', '911_SUV'],
    impact: 'Overcharging on 2-front-door service ($220 i3 instead of $190)', confidence: 'high' },
];

// Missing vehicles to insert
const MISSING_VEHICLES = [
  { make: 'Chevrolet', model: 'Cobalt', yearStart: 2005, yearEnd: 2010, classKeys: ['57_CAR'] },
  { make: 'Kia', model: 'K4', yearStart: 2025, yearEnd: 2026, classKeys: ['57_CAR'] },
];

export const GET = withShopAuth(async () => {
  const supabase = getAdminClient();

  // Load dismissed fixes from settings
  const { data: dismissed } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'vehicle_fixes_dismissed')
    .single();

  const dismissedIds: string[] = dismissed?.value
    ? (typeof dismissed.value === 'string' ? JSON.parse(dismissed.value) : dismissed.value)
    : [];

  // Load applied fixes from settings
  const { data: applied } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'vehicle_fixes_applied')
    .single();

  const appliedIds: string[] = applied?.value
    ? (typeof applied.value === 'string' ? JSON.parse(applied.value) : applied.value)
    : [];

  // Filter out dismissed and applied
  const pending = PROPOSED_FIXES.filter(f => !dismissedIds.includes(f.id) && !appliedIds.includes(f.id));
  const appliedList = PROPOSED_FIXES.filter(f => appliedIds.includes(f.id));
  const dismissedList = PROPOSED_FIXES.filter(f => dismissedIds.includes(f.id));

  return NextResponse.json({
    pending,
    applied: appliedList,
    dismissed: dismissedList,
    missingVehicles: MISSING_VEHICLES,
    stats: {
      total: PROPOSED_FIXES.length,
      pending: pending.length,
      applied: appliedIds.length,
      dismissed: dismissedIds.length,
    },
  });
});

// POST — apply a fix
export const POST = withShopAuth(async ({ req }) => {
  const supabase = getAdminClient();
  const body = await req.json();
  const { fixId, action } = body; // action: 'apply' | 'dismiss' | 'insert_vehicle'

  if (action === 'insert_vehicle') {
    const { make, model, yearStart, yearEnd, classKeys } = body;
    const { data, error } = await supabase
      .from('auto_vehicles')
      .insert({ make, model, year_start: yearStart, year_end: yearEnd, class_keys: classKeys, active: true })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, vehicleId: data.id });
  }

  const fix = PROPOSED_FIXES.find(f => f.id === fixId);
  if (!fix) return NextResponse.json({ error: 'Fix not found' }, { status: 404 });

  if (action === 'apply') {
    // Update the vehicle's class_keys
    const { error } = await supabase
      .from('auto_vehicles')
      .update({ class_keys: fix.proposedClassKeys })
      .eq('id', fix.vehicleId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Record as applied
    const { data: existing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'vehicle_fixes_applied')
      .single();

    const appliedIds: string[] = existing?.value
      ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
      : [];
    appliedIds.push(fixId);

    await supabase.from('settings').upsert(
      { key: 'vehicle_fixes_applied', value: JSON.stringify(appliedIds) },
      { onConflict: 'key' }
    );

    return NextResponse.json({ success: true, action: 'applied' });
  }

  if (action === 'dismiss') {
    const { data: existing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'vehicle_fixes_dismissed')
      .single();

    const dismissedIds: string[] = existing?.value
      ? (typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value)
      : [];
    dismissedIds.push(fixId);

    await supabase.from('settings').upsert(
      { key: 'vehicle_fixes_dismissed', value: JSON.stringify(dismissedIds) },
      { onConflict: 'key' }
    );

    return NextResponse.json({ success: true, action: 'dismissed' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
});
