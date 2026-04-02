'use client';

import { useState } from 'react';
import { DashboardCard, Button, DataTable, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface ClosedDate { id: number; closed_date: string; reason: string | null; }

interface Props {
  data: Record<string, unknown>;
  onAdd: (table: string, data: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  onDelete: (table: string, id: number) => Promise<boolean>;
  onRefresh: () => void;
}

export default function ClosedDatesTab({ data, onAdd, onDelete, onRefresh }: Props) {
  const closedDates = (data.closedDates || []) as ClosedDate[];
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [localDates, setLocalDates] = useState(closedDates);

  async function handleAdd() {
    if (!newDate) return;
    setAdding(true);
    const result = await onAdd('auto_closed_dates', { closed_date: newDate, reason: newReason || null });
    if (result) {
      setLocalDates(prev => [...prev, result as unknown as ClosedDate].sort((a, b) => a.closed_date.localeCompare(b.closed_date)));
      setNewDate(''); setNewReason('');
    }
    setAdding(false);
  }

  async function handleDelete(id: number) {
    const success = await onDelete('auto_closed_dates', id);
    if (success) setLocalDates(prev => prev.filter(d => d.id !== id));
  }

  // Split into upcoming and past
  const today = new Date().toISOString().split('T')[0];
  const upcoming = localDates.filter(d => d.closed_date >= today);
  const past = localDates.filter(d => d.closed_date < today);

  const columns = [
    {
      key: 'date', label: 'Date', width: 140,
      render: (d: ClosedDate) => {
        const formatted = new Date(d.closed_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        return <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{formatted}</span>;
      },
    },
    {
      key: 'reason', label: 'Reason',
      render: (d: ClosedDate) => <span style={{ color: COLORS.textSecondary }}>{d.reason || '—'}</span>,
    },
    {
      key: 'actions', label: '', width: 80, align: 'right' as const,
      render: (d: ClosedDate) => (
        <button onClick={() => handleDelete(d.id)} style={{
          background: COLORS.dangerBg, color: COLORS.danger,
          border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
        }}>
          Remove
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Add New */}
      <DashboardCard title="Add Closed Date">
        <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <FormField label="Date" required>
            <TextInput type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ minWidth: 180 }} />
          </FormField>
          <FormField label="Reason">
            <TextInput value={newReason} onChange={e => setNewReason(e.target.value)} placeholder="e.g., Christmas" style={{ minWidth: 250 }} />
          </FormField>
          <div style={{ paddingBottom: SPACING.lg }}>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={adding || !newDate}>
              {adding ? 'Adding...' : 'Add Date'}
            </Button>
          </div>
        </div>
      </DashboardCard>

      {/* Upcoming */}
      <DashboardCard title={`Upcoming (${upcoming.length})`} noPadding>
        <DataTable columns={columns} data={upcoming} rowKey={d => d.id} emptyMessage="No upcoming closed dates." compact />
      </DashboardCard>

      {/* Past */}
      {past.length > 0 && (
        <DashboardCard title={`Past (${past.length})`} noPadding>
          <DataTable columns={columns} data={past} rowKey={d => d.id} compact />
        </DashboardCard>
      )}
    </div>
  );
}
