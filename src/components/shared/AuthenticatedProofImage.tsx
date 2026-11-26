import React, { useEffect, useState } from 'react';
import { apiClient } from '../../services/api.ts';
import { FileImage } from 'lucide-react';

export function AuthenticatedProofImage({
  bookingId,
  alt,
}: {
  bookingId: string;
  alt: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    apiClient
      .get(`/bookings/${bookingId}/delivery-proof/image`, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        url = URL.createObjectURL(res.data as Blob);
        setObjectUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bookingId]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-xs gap-2">
        <FileImage className="w-6 h-6" />
        <span>Unable to load delivery proof image</span>
      </div>
    );
  }

  if (!objectUrl) {
    return <div className="h-48 bg-slate-100 rounded-lg animate-pulse" />;
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className="max-h-64 w-auto rounded-lg border border-slate-200 object-contain bg-slate-50"
    />
  );
}
