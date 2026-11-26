import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from '../layouts/DashboardLayout.tsx';
import { ProtectedRoute, RoleRedirect } from './ProtectedRoute.tsx';
import { LoginPage } from '../pages/LoginPage.tsx';
import { SellerRegisterPage } from '../pages/SellerRegisterPage.tsx';
import { TransporterRegisterPage } from '../pages/TransporterRegisterPage.tsx';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.tsx';
import { PublicTrackingPage } from '../pages/PublicTrackingPage.tsx';
import { NotificationsPage } from '../components/shared/NotificationsPage.tsx';
import { UserRole } from '../types/index.ts';

// Admin pages
import { AdminDashboardPage } from '../modules/admin/AdminDashboardPage.tsx';
import { AdminSellersPage } from '../modules/admin/AdminSellersPage.tsx';
import { AdminTransportersPage } from '../modules/admin/AdminTransportersPage.tsx';
import { AdminRoutesPage } from '../modules/admin/AdminRoutesPage.tsx';
import { AdminRatesPage } from '../modules/admin/AdminRatesPage.tsx';
import { AdminBookingsPage } from '../modules/admin/AdminBookingsPage.tsx';
import { AdminBookingDetailsPage } from '../modules/admin/AdminBookingDetailsPage.tsx';
import { AdminTrackingPage } from '../modules/admin/AdminTrackingPage.tsx';
import { AdminSupportPage } from '../modules/admin/AdminSupportPage.tsx';
import { AdminKycPage } from '../modules/admin/AdminKycPage.tsx';
import { AdminSettlementsPage } from '../modules/admin/AdminSettlementsPage.tsx';
import { AdminAlertsPage } from '../modules/admin/AdminAlertsPage.tsx';
import { AdminProfilePage } from '../modules/admin/AdminProfilePage.tsx';
import { AdminPlatformChargesPage } from '../modules/admin/AdminPlatformChargesPage.tsx';
import { AdminWhatsAppPage } from '../modules/admin/AdminWhatsAppPage.tsx';

// Seller pages
import { SellerDashboardPage } from '../modules/seller/SellerDashboardPage.tsx';
import { CreateBookingPage } from '../modules/seller/CreateBookingPage.tsx';
import { BulkBookingPage } from '../modules/seller/BulkBookingPage.tsx';
import { RateCalculatorPage } from '../modules/seller/RateCalculatorPage.tsx';
import { AvailableTransportersPage } from '../modules/seller/AvailableTransportersPage.tsx';
import { MyShipmentsPage } from '../modules/seller/MyShipmentsPage.tsx';
import { SellerShipmentDetailsPage } from '../modules/seller/SellerShipmentDetailsPage.tsx';
import { SellerTrackingPage } from '../modules/seller/SellerTrackingPage.tsx';
import { SellerProfilePage } from '../modules/seller/SellerProfilePage.tsx';
import { SellerPickupAddressesPage } from '../modules/seller/SellerPickupAddressesPage.tsx';
import { SellerSupportPage } from '../modules/seller/SellerSupportPage.tsx';

// Transporter pages
import { TransporterDashboardPage } from '../modules/transporter/TransporterDashboardPage.tsx';
import { AssignedBookingsPage } from '../modules/transporter/AssignedBookingsPage.tsx';
import { TransporterBookingDetailsPage } from '../modules/transporter/TransporterBookingDetailsPage.tsx';
import { UpdateShipmentStatusPage } from '../modules/transporter/UpdateShipmentStatusPage.tsx';
import { TransporterTrackingPage } from '../modules/transporter/TransporterTrackingPage.tsx';
import { TransporterSupportPage } from '../modules/transporter/TransporterSupportPage.tsx';
import { CartonScannerPage } from '../modules/transporter/CartonScannerPage.tsx';
import { TransporterServiceAreasPage } from '../modules/transporter/TransporterServiceAreasPage.tsx';
import { TransporterEarningsPage } from '../modules/transporter/TransporterEarningsPage.tsx';
import { TransporterProfilePage } from '../modules/transporter/TransporterProfilePage.tsx';
import { TransporterRoutesPage } from '../modules/transporter/TransporterRoutesPage.tsx';
import { CreatePersonalBookingPage } from '../modules/transporter/CreatePersonalBookingPage.tsx';
import { TransporterBookedOrdersPage } from '../modules/transporter/TransporterBookedOrdersPage.tsx';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/register-seller" element={<SellerRegisterPage />} />
        <Route path="/register-transporter" element={<TransporterRegisterPage />} />
        <Route path="/track" element={<PublicTrackingPage />} />
        <Route path="/track/:lrNumber" element={<PublicTrackingPage />} />

        {/* Admin Workspace */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="sellers" element={<AdminSellersPage />} />
          <Route path="transporters" element={<AdminTransportersPage />} />
          <Route path="routes" element={<AdminRoutesPage />} />
          <Route path="rates" element={<AdminRatesPage />} />
          <Route path="platform-charges" element={<AdminPlatformChargesPage />} />
          <Route path="bookings" element={<AdminBookingsPage />} />
          <Route path="bookings/:id" element={<AdminBookingDetailsPage />} />
          <Route path="tracking" element={<AdminTrackingPage />} />
          <Route path="kyc" element={<AdminKycPage />} />
          <Route path="settlements" element={<AdminSettlementsPage />} />
          <Route path="whatsapp" element={<AdminWhatsAppPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="alerts" element={<AdminAlertsPage />} />
          <Route path="profile" element={<AdminProfilePage />} />
          <Route path="support" element={<AdminSupportPage />} />
        </Route>

        {/* Seller Workspace */}
        <Route
          path="/seller"
          element={
            <ProtectedRoute allowedRoles={[UserRole.SELLER]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SellerDashboardPage />} />
          <Route path="create-booking" element={<CreateBookingPage />} />
          <Route path="create-shipment" element={<Navigate to="/seller/create-booking" replace />} />
          <Route path="bulk-booking" element={<BulkBookingPage />} />
          <Route path="rate-calculator" element={<RateCalculatorPage />} />
          <Route path="shipments" element={<MyShipmentsPage />} />
          <Route path="shipments/:id" element={<SellerShipmentDetailsPage />} />
          <Route path="pickup-addresses" element={<SellerPickupAddressesPage />} />
          <Route path="tracking" element={<SellerTrackingPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<SellerProfilePage />} />
          <Route path="support" element={<SellerSupportPage />} />
        </Route>

        {/* Transporter Workspace */}
        <Route
          path="/transporter"
          element={
            <ProtectedRoute allowedRoles={[UserRole.TRANSPORTER]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<TransporterDashboardPage />} />
          <Route path="assigned-bookings" element={<AssignedBookingsPage />} />
          <Route path="booked-orders" element={<TransporterBookedOrdersPage />} />
          <Route path="create-order" element={<CreatePersonalBookingPage />} />
          <Route path="routes" element={<TransporterRoutesPage />} />
          <Route path="bookings/:id" element={<TransporterBookingDetailsPage />} />
          <Route path="update-status" element={<UpdateShipmentStatusPage />} />
          <Route path="scanner" element={<CartonScannerPage />} />
          <Route path="service-areas" element={<TransporterServiceAreasPage />} />
          <Route path="earnings" element={<TransporterEarningsPage />} />
          <Route path="tracking" element={<TransporterTrackingPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<TransporterProfilePage />} />
          <Route path="support" element={<TransporterSupportPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
