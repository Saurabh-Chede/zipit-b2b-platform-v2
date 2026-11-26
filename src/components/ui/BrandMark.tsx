import React from 'react';

export function BrandMark({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <img
      src="https://zipit.co.in/__l5e/assets-v1/fcd52a27-9bc8-4c27-84b3-8484ebfce3f6/zipit-horizontal.png"
      alt="Zipit"
      draggable={false}
      className={`object-contain ${className}`}
    />
  );
}
