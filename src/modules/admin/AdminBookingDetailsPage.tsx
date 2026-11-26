import React from 'react';
import { useParams } from 'react-router-dom';
import { ShipmentDetailView } from '../../components/shared/ShipmentDetailView.tsx';

export function AdminBookingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <ShipmentDetailView bookingId={id} backPath="/admin/bookings" />;
}
