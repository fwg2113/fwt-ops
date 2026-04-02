import { supabaseAdmin } from '@/app/lib/supabase-server';
import DocumentDetail from './DocumentDetail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch document with line items and payments
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('*, document_line_items(*), document_payments(*)')
    .eq('id', id)
    .single();

  if (!document) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'system-ui, sans-serif',
      }}>
        Document not found
      </div>
    );
  }

  // Fetch supporting data
  const shopId = document.shop_id || 1;

  const [
    { data: customers },
    { data: modules },
    { data: shopConfig },
    { data: brands },
    { data: shopModules },
  ] = await Promise.all([
    supabaseAdmin.from('customers').select('id, first_name, last_name, email, phone, company_name').eq('shop_id', shopId).order('last_name').limit(500),
    supabaseAdmin.from('service_modules').select('*').is('deleted_at', null).order('sort_order'),
    supabaseAdmin.from('shop_config').select('shop_name, shop_phone, shop_email, shop_address, module_invoice_content, enabled_modules, linked_scheduling_default, quote_approval_modes, quote_default_approval_mode').eq('id', shopId).single(),
    supabaseAdmin.from('brands').select('id, name, active').eq('shop_id', shopId).eq('active', true).order('sort_order'),
    supabaseAdmin.from('shop_modules').select('*, service_modules(module_key, label, color)').eq('shop_id', shopId).eq('enabled', true).order('sort_order'),
  ]);

  const lineItems = (document.document_line_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const payments = document.document_payments || [];

  return (
    <DocumentDetail
      document={document}
      lineItems={lineItems}
      customers={customers || []}
      modules={modules || []}
      payments={payments}
      shopConfig={shopConfig}
      brands={brands || []}
      shopModules={shopModules || []}
    />
  );
}
