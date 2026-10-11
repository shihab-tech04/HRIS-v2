import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  isNumeric?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found',
  emptyAction,
  isLoading = false,
  onRowClick,
  className = '',
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="divide-y divide-slate-100 animate-pulse">
          <div className="h-10 bg-slate-50 border-b border-slate-200" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-white flex items-center px-4 gap-4">
              <div className="h-4 bg-slate-100 rounded-sm w-1/4" />
              <div className="h-4 bg-slate-100 rounded-sm w-1/3" />
              <div className="h-4 bg-slate-100 rounded-sm w-1/6 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full bg-white border border-slate-200 rounded-lg p-10 text-center flex flex-col items-center justify-center">
        <p className="text-xs text-slate-500 max-w-sm mb-3">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={`w-full bg-white border border-slate-200 rounded-lg overflow-x-auto shadow-2xs ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 text-[11px] font-semibold tracking-wider">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`py-2.5 px-4 whitespace-nowrap ${
                  col.align === 'right' || col.isNumeric ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
          {data.map((row, index) => (
            <tr
              key={keyExtractor(row, index)}
              onClick={() => onRowClick && onRowClick(row)}
              className={`h-11 transition-colors ${
                onRowClick ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/50'
              }`}
            >
              {columns.map((col) => {
                const cellContent = col.render
                  ? col.render(row, index)
                  : ((row as Record<string, unknown>)[col.key] as React.ReactNode);

                return (
                  <td
                    key={col.key}
                    className={`py-2.5 px-4 whitespace-nowrap ${
                      col.isNumeric ? 'font-mono tabular-nums text-slate-800' : ''
                    } ${
                      col.align === 'right' || col.isNumeric ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
