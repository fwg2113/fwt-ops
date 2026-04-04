// ============================================================================
// SQUARE TERMINAL DEVICES
// POST: Create a device code for pairing a new Terminal
// GET: List paired devices / check device code status
// DELETE: Cancel a pending device code
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import { createTenantSquareClient, idempotencyKey } from '@/app/lib/square';

// POST: Create a device code for pairing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, shopId = 1 } = body;

    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token, square_connected')
      .eq('id', shopId)
      .single();

    if (!shopConfig?.square_connected || !shopConfig?.square_access_token) {
      return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
    }

    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    // Get the default location
    const locationsResponse: any = await tenantSquare.locations.list();
    const locations = locationsResponse.locations || locationsResponse.data || [];
    const locationId = locations[0]?.id;
    if (!locationId) {
      return NextResponse.json({ error: 'No Square location found' }, { status: 400 });
    }

    // Create device code
    const response: any = await tenantSquare.devices.codes.create({
      idempotencyKey: idempotencyKey(),
      deviceCode: {
        name: name || 'Counter Terminal',
        productType: 'TERMINAL_API',
        locationId,
      },
    });

    const deviceCode = response.deviceCode || response.data;

    return NextResponse.json({
      id: deviceCode?.id,
      code: deviceCode?.code, // The code the shop enters on the Terminal device
      status: deviceCode?.status, // UNPAIRED initially
      name: deviceCode?.name,
      locationId: deviceCode?.locationId,
    });
  } catch (error: any) {
    console.error('Create device code error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create device code' }, { status: 500 });
  }
}

// GET: List devices or check a specific device code status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const codeId = searchParams.get('codeId');
    const shopId = searchParams.get('shopId') || '1';

    const { data: shopConfig } = await supabaseAdmin
      .from('shop_config')
      .select('square_access_token')
      .eq('id', parseInt(shopId))
      .single();

    if (!shopConfig?.square_access_token) {
      return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
    }

    const tenantSquare = createTenantSquareClient(shopConfig.square_access_token);

    // If checking a specific code, get its status (and device_id if paired)
    if (codeId) {
      const response: any = await tenantSquare.devices.codes.get({ id: codeId });
      const deviceCode = response.deviceCode || response.data;
      return NextResponse.json({
        id: deviceCode?.id,
        code: deviceCode?.code,
        status: deviceCode?.status, // UNPAIRED or PAIRED
        deviceId: deviceCode?.deviceId, // Available once PAIRED
        name: deviceCode?.name,
      });
    }

    // Try listing paired device codes first
    const devices = [];
    try {
      const response: any = await tenantSquare.devices.codes.list({
        status: 'PAIRED',
      });
      const deviceCodes = response.deviceCodes || response.data || [];

      for (const code of deviceCodes) {
        if (code.deviceId) {
          try {
            const deviceRes: any = await tenantSquare.devices.get({ deviceId: code.deviceId });
            const device = deviceRes.device || deviceRes.data;
            devices.push({
              deviceId: code.deviceId,
              name: code.name || device?.attributes?.name || 'Terminal',
              code: code.code,
              status: 'PAIRED',
              model: device?.attributes?.model || null,
              serialNumber: device?.attributes?.serialNumber || null,
            });
          } catch {
            devices.push({
              deviceId: code.deviceId,
              name: code.name || 'Terminal',
              code: code.code,
              status: 'PAIRED',
            });
          }
        }
      }
    } catch (e) {
      console.error('List device codes error:', e);
    }

    // Also try listing devices directly (finds terminals on the account even without API pairing)
    try {
      const devicesResponse: any = await tenantSquare.devices.list();
      const allDevices = devicesResponse.devices || devicesResponse.data || [];
      for (const device of allDevices) {
        const alreadyListed = devices.some(d => d.deviceId === device.id);
        if (!alreadyListed && device.id) {
          devices.push({
            deviceId: device.id,
            name: device.attributes?.name || device.name || 'Square Terminal',
            code: null,
            status: device.status?.category === 'AVAILABLE' ? 'AVAILABLE' : (device.status?.category || 'UNKNOWN'),
            model: device.attributes?.model || device.attributes?.type || null,
            serialNumber: device.attributes?.serialNumber || null,
          });
        }
      }
    } catch (e) {
      console.error('List devices error:', e);
    }

    return NextResponse.json({ devices });
  } catch (error: any) {
    console.error('List devices error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to list devices' }, { status: 500 });
  }
}
