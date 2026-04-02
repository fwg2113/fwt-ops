import { Suspense } from 'react';
import { supabaseAdmin } from '@/app/lib/supabase-server';
import InvoiceView from './InvoiceView';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ============================================================================
// BRAND RESOLUTION — determines which brand(s) to display on the invoice
// ============================================================================
type Brand = {
  id: number;
  name: string;
  short_name: string | null;
  logo_square_url: string | null;
  logo_wide_url: string | null;
  primary_color: string;
  secondary_color: string;
  is_default: boolean;
};

type ShopModuleRaw = {
  id: number;
  module_id: number;
  brand_id: number | null;
  service_modules: {
    module_key: string;
    label: string;
    color: string;
  } | { module_key: string; label: string; color: string }[] | null;
};

type ShopModule = {
  id: number;
  module_id: number;
  brand_id: number | null;
  service_modules: {
    module_key: string;
    label: string;
    color: string;
  } | null;
};

function normalizeShopModules(raw: ShopModuleRaw[]): ShopModule[] {
  return raw.map(sm => ({
    ...sm,
    service_modules: Array.isArray(sm.service_modules)
      ? sm.service_modules[0] || null
      : sm.service_modules,
  }));
}

function resolveBrands(
  doc: any,
  shopConfig: any,
  brands: Brand[],
  shopModules: ShopModule[],
): Brand[] {
  if (!brands || brands.length === 0) return [];

  // 1. Document-level fixed override
  if (doc.brand_display_mode === 'fixed' && Array.isArray(doc.brand_display_ids) && doc.brand_display_ids.length > 0) {
    const fixed = doc.brand_display_ids
      .map((id: number) => brands.find(b => b.id === id))
      .filter(Boolean) as Brand[];
    if (fixed.length > 0) return fixed;
  }

  // 2. Document-level auto OR null fallback to shop default
  const useAuto = doc.brand_display_mode === 'auto' ||
    (doc.brand_display_mode == null && shopConfig?.invoice_brand_mode === 'auto');

  if (useAuto) {
    // Derive from line items: module -> shop_modules -> brand_id -> brand
    const lineItems = Array.isArray(doc.document_line_items) ? doc.document_line_items : [];
    const moduleKeys = [...new Set(lineItems.map((li: any) => li.module || 'auto_tint'))];
    const brandIds = new Set<number>();
    for (const mk of moduleKeys) {
      const sm = shopModules.find(m => m.service_modules?.module_key === mk);
      if (sm?.brand_id) brandIds.add(sm.brand_id);
    }
    if (brandIds.size > 0) {
      const resolved = [...brandIds]
        .map(id => brands.find(b => b.id === id))
        .filter(Boolean) as Brand[];
      if (resolved.length > 0) return resolved;
    }
  }

  // 3. Document-level null + shop fixed
  if (doc.brand_display_mode == null && shopConfig?.invoice_brand_mode === 'fixed' && shopConfig?.invoice_brand_fixed_id) {
    const fixed = brands.find(b => b.id === shopConfig.invoice_brand_fixed_id);
    if (fixed) return [fixed];
  }

  // Fallback: default brand or first brand
  const defaultBrand = brands.find(b => b.is_default) || brands[0];
  return defaultBrand ? [defaultBrand] : [];
}

function buildModuleMaps(shopModules: ShopModule[]): { moduleColors: Record<string, string>; moduleLabels: Record<string, string> } {
  const moduleColors: Record<string, string> = {};
  const moduleLabels: Record<string, string> = {};
  for (const sm of shopModules) {
    if (sm.service_modules) {
      moduleColors[sm.service_modules.module_key] = sm.service_modules.color;
      moduleLabels[sm.service_modules.module_key] = sm.service_modules.label;
    }
  }
  return { moduleColors, moduleLabels };
}

export default async function InvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Query from new documents table with normalized line items
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, document_line_items(*)')
    .eq('public_token', token)
    .single();

  if (!document) {
    // Fallback: try legacy auto_invoices table for any tokens not yet migrated
    const { data: legacyInvoice } = await supabaseAdmin
      .from('auto_invoices')
      .select('*')
      .eq('public_token', token)
      .single();

    if (!legacyInvoice) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6',
          fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: '#1a1a1a', fontSize: '24px', marginBottom: '8px' }}>Invoice Not Found</h1>
            <p style={{ color: '#6b7280' }}>This invoice may have been removed or the link is invalid.</p>
          </div>
        </div>
      );
    }

    // Transform legacy invoice to new format for InvoiceView
    const legacyLineItems = Array.isArray(legacyInvoice.line_items_json) ? legacyInvoice.line_items_json : [];
    const transformedDoc = {
      ...legacyInvoice,
      doc_number: legacyInvoice.invoice_number,
      doc_type: 'invoice',
      document_line_items: legacyLineItems.map((item: any, idx: number) => ({
        id: `legacy-${idx}`,
        document_id: legacyInvoice.id,
        module: 'auto_tint',
        description: item.label || 'Service',
        quantity: 1,
        unit_price: item.price || 0,
        line_total: item.price || 0,
        sort_order: idx,
        custom_fields: {
          filmId: item.filmId,
          filmName: item.filmName,
          filmAbbrev: item.filmAbbrev,
          shade: item.shade,
          shadeFront: item.shadeFront,
          shadeRear: item.shadeRear,
          rollId: item.rollId,
          serviceKey: item.serviceKey,
        },
      })),
    };

    const legacyShopId = legacyInvoice.shop_id || 1;

    const [shopConfigRes, brandsRes, shopModulesRes] = await Promise.all([
      supabaseAdmin
        .from('shop_config')
        .select('shop_name, shop_phone, shop_email, shop_address, cc_fee_percent, cc_fee_flat, cash_discount_percent, payment_methods, checkout_flow_config, module_invoice_content, quote_approval_config, invoice_brand_mode, invoice_brand_fixed_id')
        .eq('id', legacyShopId)
        .single(),
      supabaseAdmin
        .from('brands')
        .select('id, name, short_name, logo_square_url, logo_wide_url, primary_color, secondary_color, is_default, active')
        .eq('shop_id', legacyShopId)
        .eq('active', true)
        .order('sort_order'),
      supabaseAdmin
        .from('shop_modules')
        .select('id, module_id, brand_id, service_modules(module_key, label, color)')
        .eq('shop_id', legacyShopId)
        .order('sort_order'),
    ]);

    const shopConfig = shopConfigRes.data;
    const brands = (brandsRes.data || []) as Brand[];
    const shopModules = normalizeShopModules((shopModulesRes.data || []) as ShopModuleRaw[]);
    const resolvedBrands = resolveBrands(transformedDoc, shopConfig, brands, shopModules);
    const { moduleColors, moduleLabels } = buildModuleMaps(shopModules);

    return <Suspense><InvoiceView document={transformedDoc} shop={shopConfig} resolvedBrands={resolvedBrands} moduleColors={moduleColors} moduleLabels={moduleLabels} /></Suspense>;
  }

  const shopId = document.shop_id || 1;

  const [shopConfigRes, brandsRes, shopModulesRes] = await Promise.all([
    supabaseAdmin
      .from('shop_config')
      .select('shop_name, shop_phone, shop_email, shop_address, cc_fee_percent, cc_fee_flat, cash_discount_percent, payment_methods, checkout_flow_config, module_invoice_content, quote_approval_config, invoice_brand_mode, invoice_brand_fixed_id')
      .eq('id', shopId)
      .single(),
    supabaseAdmin
      .from('brands')
      .select('id, name, short_name, logo_square_url, logo_wide_url, primary_color, secondary_color, is_default, active')
      .eq('shop_id', shopId)
      .eq('active', true)
      .order('sort_order'),
    supabaseAdmin
      .from('shop_modules')
      .select('id, module_id, brand_id, service_modules(module_key, label, color)')
      .eq('shop_id', shopId)
      .order('sort_order'),
  ]);

  const shopConfig = shopConfigRes.data;
  const brands = (brandsRes.data || []) as Brand[];
  const shopModules = normalizeShopModules((shopModulesRes.data || []) as ShopModuleRaw[]);
  const resolvedBrands = resolveBrands(document, shopConfig, brands, shopModules);
  const { moduleColors, moduleLabels } = buildModuleMaps(shopModules);

  // Mark as viewed on first access
  if (!document.viewed_at && (document.status === 'sent' || document.status === 'draft')) {
    await supabaseAdmin
      .from('documents')
      .update({ viewed_at: new Date().toISOString(), status: document.status === 'sent' ? 'viewed' : document.status })
      .eq('id', document.id);
  }

  return <Suspense><InvoiceView document={document} shop={shopConfig} resolvedBrands={resolvedBrands} moduleColors={moduleColors} moduleLabels={moduleLabels} /></Suspense>;
}
