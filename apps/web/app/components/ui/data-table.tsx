import type { ReactNode } from 'react';
import { EmptyState, Skeleton } from './feedback';

export interface DataTableColumn<T> {
  /** Stable column key, also used for React reconciliation. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  isLoading?: boolean;
  loadingRows?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}

/**
 * Accessible table primitive. Keep data fetching, sorting and pagination in the owning feature.
 * Loading keeps the table structure stable; empty results are explicit and actionable.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  isLoading = false,
  loadingRows = 4,
  emptyTitle = 'No results yet',
  emptyDescription = 'Try adjusting your filters or check back later.',
  emptyAction,
  className = '',
}: DataTableProps<T>) {
  const requestedLoadingRows = Number.isFinite(loadingRows) ? Math.trunc(loadingRows) : 4;
  const safeLoadingRows = Math.max(1, Math.min(requestedLoadingRows, 10));

  // A table without columns cannot represent its rows. Fail visibly instead of
  // rendering an apparently blank table when a feature has a configuration bug.
  if (columns.length === 0) {
    return (
      <EmptyState
        className={className}
        title="Table unavailable"
        description="This table has no columns configured. Refresh the page or contact your workspace administrator."
      />
    );
  }

  return (
    <div className={['jn-table-wrap', className].filter(Boolean).join(' ')} aria-busy={isLoading}>
      <table className="jn-table">
        <caption className="jn-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className} data-align={column.align ?? 'start'}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? Array.from({ length: safeLoadingRows }, (_, rowIndex) => (
            <tr key={`loading-${rowIndex}`} aria-hidden="true">
              {columns.map((column) => (
                <td key={column.key}><Skeleton width={rowIndex % 2 ? '62%' : '78%'} height="0.85rem" /></td>
              ))}
            </tr>
          )) : rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(columns.length, 1)}>
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className} data-align={column.align ?? 'start'}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <span className="jn-sr-only" role="status" aria-live="polite">
        {isLoading ? 'Loading table data' : rows.length === 0 ? 'No rows to display' : `${rows.length} rows loaded`}
      </span>
    </div>
  );
}
