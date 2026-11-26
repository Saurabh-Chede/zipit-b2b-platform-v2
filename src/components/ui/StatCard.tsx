import React from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  subtext?: string;
}

export function StatCard({ label, value, subtext }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="text-2xl font-semibold text-slate-900 font-mono tabular-nums tracking-tight">
        {value}
      </div>
      {subtext && <span className="text-xs text-slate-500">{subtext}</span>}
    </div>
  );
}
