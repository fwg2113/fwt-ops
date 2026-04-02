'use client';

import { COLORS, RADIUS, SPACING, FONT } from './theme';

interface Column<T> {
  key: string;
  label: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  render?: (row: T, index: number) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  compact?: boolean;
}

export default function DataTable<T>({
  columns, data, rowKey, onRowClick, emptyMessage = 'No data', compact = false,
}: Props<T>) {
  const cellPadding = compact ? `${SPACING.sm}px ${SPACING.md}px` : `${SPACING.md}px ${SPACING.lg}px`;

  if (data.length === 0) {
    return (
      <div style={{
        padding: `${SPACING.xxxl}px ${SPACING.xxl}px`,
        textAlign: 'center',
        color: COLORS.textMuted,
        fontSize: FONT.sizeBase,
      }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: FONT.sizeBase,
      }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: cellPadding,
                textAlign: col.align || 'left',
                fontSize: FONT.sizeXs,
                fontWeight: FONT.weightSemibold,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: COLORS.textMuted,
                borderBottom: `1px solid ${COLORS.border}`,
                width: col.width,
                whiteSpace: 'nowrap',
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (onRowClick) (e.currentTarget as HTMLElement).style.background = COLORS.hoverBg;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: cellPadding,
                  textAlign: col.align || 'left',
                  color: COLORS.textSecondary,
                  borderBottom: `1px solid ${COLORS.border}`,
                  verticalAlign: 'middle',
                }}>
                  {col.render
                    ? col.render(row, i)
                    : String((row as Record<string, unknown>)[col.key] ?? '')
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
