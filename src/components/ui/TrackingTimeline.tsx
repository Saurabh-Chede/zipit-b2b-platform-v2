import React from 'react';
import { formatDateTime } from '../../utils/formatters.ts';
import { StatusBadge } from './StatusBadge.tsx';
import type { TrackingEvent } from '../../types/index.ts';

export function TrackingTimeline({ events }: { events: TrackingEvent[] }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-slate-500">No tracking events recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-5 pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
      {events.map((ev, index) => {
        const isLatest = index === events.length - 1;
        return (
          <li key={ev._id} className="relative">
            <span
              className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                isLatest
                  ? 'bg-blue-600 border-blue-200'
                  : 'bg-white border-slate-400'
              }`}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <StatusBadge status={ev.status} />
                <span className="text-sm font-medium text-slate-900">{ev.location}</span>
              </div>
              <time className="text-xs font-mono tabular-nums text-slate-500">
                {formatDateTime(ev.eventTimestamp)}
              </time>
            </div>
            <p className="text-sm text-slate-600 mt-1">{ev.description}</p>
            {ev.remarks && (
              <p className="text-xs text-slate-500 mt-1">Remarks: {ev.remarks}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
