import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  hideBelow?: 'md' | 'lg' | 'xl';
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  renderMobileCard?: (row: T) => React.ReactNode;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

function getHideBelowClass(hideBelow?: 'md' | 'lg' | 'xl'): string {
  if (hideBelow === 'md') return 'hidden md:table-cell';
  if (hideBelow === 'lg') return 'hidden lg:table-cell';
  if (hideBelow === 'xl') return 'hidden xl:table-cell';
  return '';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  renderMobileCard,
  pagination,
}: DataTableProps<T>) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Mobile & Portrait Tablet Card View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 md:hidden bg-slate-50/40">
        {rows.map((row) => {
          const key = rowKey(row);
          if (renderMobileCard) {
            return (
              <div
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`bg-white border border-slate-200 rounded-xl p-3.5 ${
                  onRowClick
                    ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/70 transition-colors'
                    : ''
                }`}
              >
                {renderMobileCard(row)}
              </div>
            );
          }

          return (
            <div
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 ${
                onRowClick
                  ? 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/70 transition-colors'
                  : ''
              }`}
            >
              {columns.map((col, idx) => (
                <div
                  key={col.key}
                  className={`flex items-start justify-between gap-3 ${
                    idx > 0 ? 'pt-2 border-t border-slate-100' : ''
                  }`}
                >
                  {col.header ? (
                    <span className="text-[11px] font-medium text-slate-500 shrink-0 pt-0.5">
                      {col.header}
                    </span>
                  ) : null}
                  <div
                    className={`text-xs text-slate-700 min-w-0 ${
                      col.header ? 'text-right' : 'w-full'
                    }`}
                  >
                    {col.render(row)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Landscape Tablet, Laptop & Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  } ${getHideBelowClass(col.hideBelow)} ${col.headerClassName || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`text-sm text-slate-700 ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-slate-50 transition-colors'
                    : 'hover:bg-slate-50/60'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 align-middle ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${getHideBelowClass(col.hideBelow)} ${col.cellClassName || ''}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 sm:px-4 py-3 border-t border-slate-200 bg-slate-50/50 text-xs text-slate-600">
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="inline-flex items-center gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="inline-flex items-center gap-1 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
