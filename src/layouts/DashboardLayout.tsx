// import React, { useEffect, useState } from 'react';
// import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
// import {
//   LayoutDashboard,
//   PackagePlus,
//   Calculator,
//   Truck,
//   Package,
//   Search,
//   UserCircle,
//   Users,
//   Map,
//   IndianRupee,
//   ClipboardCheck,
//   ClipboardList,
//   LogOut,
//   Menu,
//   PanelLeftClose,
//   PanelLeftOpen,
//   Plus,
//   Wallet,
//   LifeBuoy,
//   MapPin,
//   ScanLine,
//   Bell,
//   ShieldAlert,
//   ShieldCheck,
//   Landmark,
//   FileSpreadsheet,
//   SlidersHorizontal,
//   Route,
//   MessageSquare,
//   X,
//   ChevronDown,
// } from 'lucide-react';
// import { useAuth } from '../context/AuthContext.tsx';
// import { useNotifications } from '../context/NotificationContext.tsx';
// import { UserRole, type SellerProfile } from '../types/index.ts';
// import { formatINR } from '../utils/formatters.ts';
// import { WalletRechargeModal } from '../components/shared/WalletRechargeModal.tsx';
// import { NotificationBell } from '../components/shared/NotificationBell.tsx';
// import { ProfileMenu } from '../components/shared/ProfileMenu.tsx';

// const LOGO_COLLAPSED =
//   'https://zipit.co.in/__l5e/assets-v1/f4a93292-c5de-43a9-9804-5a139f08f535/zipit-logo-dark.png';
// const LOGO_EXPANDED =
//   'https://zipit.co.in/__l5e/assets-v1/57ebba31-7bf0-44fc-91f3-015b261cea40/zipit-horizontal-white.png';

// interface NavChildItem {
//   to: string;
//   label: string;
//   icon: React.ComponentType<{ className?: string }>;
//   end?: boolean;
// }

// interface NavItem {
//   id?: string;
//   to?: string;
//   label: string;
//   icon: React.ComponentType<{ className?: string }>;
//   end?: boolean;
//   children?: NavChildItem[];
// }

// const ROLE_NAV: Record<UserRole, NavItem[]> = {
//   [UserRole.ADMIN]: [
//     { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
//     { to: '/admin/sellers', label: 'Sellers', icon: Users },
//     { to: '/admin/transporters', label: 'Transporters', icon: Truck },
//     { to: '/admin/kyc', label: 'KYC Review', icon: ShieldCheck },
//     { to: '/admin/settlements', label: 'Payout Settlements', icon: Landmark },
//     { to: '/admin/routes', label: 'Master Routes & Rates', icon: Map },
//     { to: '/admin/platform-charges', label: 'Platform Charges', icon: SlidersHorizontal },
//     { to: '/admin/bookings', label: 'All Bookings', icon: Package },
//     { to: '/admin/tracking', label: 'Track LR', icon: Search },
//     { to: '/admin/whatsapp', label: 'WhatsApp Alerts', icon: MessageSquare },
//     { to: '/admin/notifications', label: 'Notifications', icon: Bell },
//     { to: '/admin/alerts', label: 'Incident Alerts', icon: ShieldAlert },
//     { to: '/admin/support', label: 'Support Desk', icon: LifeBuoy },
//   ],
//   [UserRole.SELLER]: [
//     { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
//     { to: '/seller/create-booking', label: 'Create Booking', icon: ClipboardList },
//     { to: '/seller/shipments', label: 'My Bookings', icon: Package },
//     // { to: '/seller/bulk-booking', label: 'Bulk Booking', icon: FileSpreadsheet },
//     { to: '/seller/pickup-addresses', label: 'Pickup Addresses', icon: MapPin },
//     { to: '/seller/rate-calculator', label: 'Rate Calculator', icon: Calculator },
//     // { to: '/seller/transporters', label: 'Transporters', icon: Truck },
//     { to: '/seller/tracking', label: 'Tracking', icon: Search },
//     { to: '/seller/notifications', label: 'Notifications', icon: Bell },
//     { to: '/seller/profile', label: 'Profile', icon: UserCircle },
//     { to: '/seller/support', label: 'Support', icon: LifeBuoy },
//   ],
//   [UserRole.TRANSPORTER]: [
//     { to: '/transporter', label: 'Dashboard', icon: LayoutDashboard, end: true },
//     { to: '/transporter/assigned-bookings', label: 'Assigned Bookings', icon: Package },
//     {
//       id: 'personal-orders',
//       label: 'Personal Orders',
//       icon: ClipboardList,
//       children: [
//         { to: '/transporter/booked-orders', label: 'Booked Orders', icon: ClipboardList },
//         { to: '/transporter/create-order', label: 'New Order', icon: PackagePlus },
//       ],
//     },
//     { to: '/transporter/routes', label: 'Routes & Rates', icon: Route },
//     // { to: '/transporter/update-status', label: 'Pickup & Delivery', icon: ClipboardCheck },
//     { to: '/transporter/scanner', label: 'Carton Scanner', icon: ScanLine },
//     // { to: '/transporter/service-areas', label: 'Service Areas', icon: MapPin },
//     // { to: '/transporter/earnings', label: 'Earnings', icon: IndianRupee },
//     { to: '/transporter/tracking', label: 'Track LR', icon: Search },
//     { to: '/transporter/notifications', label: 'Notifications', icon: Bell },
//     { to: '/transporter/profile', label: 'Profile', icon: UserCircle },
//     { to: '/transporter/support', label: 'Support', icon: LifeBuoy },
//   ],
// };

// function getPageTitle(pathname: string): string {
//   const segment = pathname.split('/').filter(Boolean).pop() || 'dashboard';
//   return segment
//     .replace(/-/g, ' ')
//     .replace(/\b\w/g, (c) => c.toUpperCase());
// }

// export function DashboardLayout() {
//   const { user, profile, logout } = useAuth();
//   const { unreadCount } = useNotifications();
//   const navigate = useNavigate();
//   const location = useLocation();
//   const [mobileOpen, setMobileOpen] = useState(false);
//   const [walletModalOpen, setWalletModalOpen] = useState(false);
//   const [hovered, setHovered] = useState(false);
//   const [collapsed, setCollapsed] = useState<boolean>(() => {
//     try {
//       const saved = localStorage.getItem('zipit_sidebar_collapsed');
//       return saved === null ? true : saved === 'true';
//     } catch {
//       return true;
//     }
//   });

//   const isPersonalOrderRoute =
//     location.pathname.startsWith('/transporter/booked-orders') ||
//     location.pathname.startsWith('/transporter/create-order') ||
//     location.pathname.startsWith('/transporter/personal-booking');

//   const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
//     'personal-orders': isPersonalOrderRoute,
//   }));

//   useEffect(() => {
//     setOpenGroups({ 'personal-orders': isPersonalOrderRoute });
//   }, [isPersonalOrderRoute, location.pathname]);

//   useEffect(() => {
//     const handleOpenWallet = () => setWalletModalOpen(true);
//     window.addEventListener('zipit:open-wallet-modal', handleOpenWallet);
//     return () => window.removeEventListener('zipit:open-wallet-modal', handleOpenWallet);
//   }, []);

//   if (!user) return null;

//   const sellerProfile = user.role === UserRole.SELLER ? (profile as SellerProfile | null) : null;
//   const walletBalance = Number(sellerProfile?.walletBalance ?? 0);

//   const toggleSidebar = () => {
//     setHovered(false);
//     setCollapsed((prev) => {
//       const next = !prev;
//       try {
//         localStorage.setItem('zipit_sidebar_collapsed', String(next));
//       } catch {
//         // Ignore storage errors
//       }
//       return next;
//     });
//   };

//   const navItems = ROLE_NAV[user.role] || [];
//   const roleLabel =
//     user.role === UserRole.ADMIN
//       ? 'Admin Console'
//       : user.role === UserRole.SELLER
//         ? 'Seller Portal'
//         : 'Transporter Portal';

//   const handleLogout = async () => {
//     await logout();
//     navigate('/login');
//   };

//   const isDesktopExpanded = !collapsed || hovered;
//   const isHoverFloating = collapsed && hovered;

//   const renderSidebar = (isExpanded: boolean) => (
//     <div className="flex flex-col w-full h-full bg-slate-900 text-slate-100 overflow-hidden select-none">
//       <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800 shrink-0">
//         <div className="relative flex items-center h-full min-w-0 flex-1">
//           {/* Collapsed logo */}
//           <img
//             src={LOGO_COLLAPSED}
//             alt="ZIPIT"
//             className={`absolute left-0 top-1/2 -translate-y-1/2 h-7 w-7 object-contain shrink-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//               isExpanded ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
//             }`}
//           />
//           {/* Expanded logo */}
//           <img
//             src={LOGO_EXPANDED}
//             alt="ZIPIT B2B"
//             className={`h-7 w-auto max-w-[160px] object-contain transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//               isExpanded
//                 ? 'opacity-100 translate-x-0'
//                 : 'opacity-0 -translate-x-2 pointer-events-none'
//             }`}
//           />
//         </div>
//         <button
//           type="button"
//           onClick={() => setMobileOpen(false)}
//           className="lg:hidden text-slate-400 hover:text-white p-1"
//           aria-label="Close navigation menu"
//         >
//           <X className="w-5 h-5" />
//         </button>
//       </div>

//       <nav
//         className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-1 scrollbar-none"
//         aria-label="Main navigation"
//       >
//         {navItems.map((item) => {
//           const Icon = item.icon;
//           if (item.children && item.children.length > 0) {
//             const groupKey = item.id || item.label;
//             const hasActiveChild = item.children.some((c) =>
//               location.pathname.startsWith(c.to)
//             );
//             const isOpen = Boolean(openGroups[groupKey]);
//             return (
//               <div key={groupKey}>
//                 <button
//                   type="button"
//                   title={!isExpanded ? item.label : undefined}
//                   aria-label={item.label}
//                   aria-expanded={isExpanded ? isOpen : false}
//                   onClick={() =>
//                     setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
//                   }
//                   className={`w-full relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
//                     hasActiveChild && !isExpanded
//                       ? 'bg-blue-600 text-white'
//                       : hasActiveChild
//                         ? 'bg-slate-800 text-white'
//                         : 'text-slate-300 hover:bg-slate-800 hover:text-white'
//                   }`}
//                 >
//                   <span className="relative shrink-0">
//                     <Icon className="w-4 h-4" />
//                   </span>
//                   <span
//                     className={`flex-1 flex items-center justify-between gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//                       isExpanded
//                         ? 'opacity-100 translate-x-0 max-w-[180px]'
//                         : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
//                     }`}
//                   >
//                     <span className="truncate">{item.label}</span>
//                     <ChevronDown
//                       className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
//                         isOpen ? 'rotate-180' : ''
//                       }`}
//                     />
//                   </span>
//                 </button>

//                 <div
//                   className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//                     isExpanded && isOpen
//                       ? 'grid-rows-[1fr] opacity-100 mt-1'
//                       : 'grid-rows-[0fr] opacity-0 pointer-events-none'
//                   }`}
//                 >
//                   <div className="overflow-hidden pl-4 ml-5 border-l border-slate-800 space-y-1">
//                     {item.children.map((child) => {
//                       const ChildIcon = child.icon;
//                       return (
//                         <NavLink
//                           key={child.to}
//                           to={child.to}
//                           end={child.end}
//                           onClick={() => setMobileOpen(false)}
//                           className={({ isActive }) =>
//                             `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors duration-150 whitespace-nowrap ${
//                               isActive
//                                 ? 'bg-blue-600 text-white'
//                                 : 'text-slate-400 hover:bg-slate-800 hover:text-white'
//                             }`
//                           }
//                         >
//                           <ChildIcon className="w-3.5 h-3.5 shrink-0" />
//                           <span className="truncate">{child.label}</span>
//                         </NavLink>
//                       );
//                     })}
//                   </div>
//                 </div>
//               </div>
//             );
//           }

//           if (!item.to) return null;
//           const isNotificationsItem = item.to.endsWith('/notifications');
//           return (
//             <NavLink
//               key={item.to}
//               to={item.to}
//               end={item.end}
//               title={!isExpanded ? item.label : undefined}
//               aria-label={item.label}
//               onClick={() => {
//                 setMobileOpen(false);
//                 setOpenGroups({});
//               }}
//               className={({ isActive }) =>
//                 `relative flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 whitespace-nowrap ${
//                   isActive
//                     ? 'bg-blue-600 text-white'
//                     : 'text-slate-300 hover:bg-slate-800 hover:text-white'
//                 }`
//               }
//             >
//               <span className="relative shrink-0">
//                 <Icon className="w-4 h-4" />
//                 {isNotificationsItem && unreadCount > 0 && !isExpanded && (
//                   <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-slate-900" />
//                 )}
//               </span>
//               <span
//                 className={`flex-1 flex items-center justify-between gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//                   isExpanded
//                     ? 'opacity-100 translate-x-0 max-w-[180px]'
//                     : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
//                 }`}
//               >
//                 <span className="truncate">{item.label}</span>
//                 {isNotificationsItem && unreadCount > 0 && (
//                   <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-blue-500 text-white rounded-md leading-none tabular-nums">
//                     {unreadCount > 99 ? '99+' : unreadCount}
//                   </span>
//                 )}
//               </span>
//             </NavLink>
//           );
//         })}
//       </nav>

//       <div className="border-t border-slate-800 p-3 shrink-0">
//         <button
//           type="button"
//           onClick={handleLogout}
//           title={!isExpanded ? 'Sign Out' : undefined}
//           aria-label="Sign Out"
//           className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors duration-200 whitespace-nowrap"
//         >
//           <LogOut className="w-4 h-4 shrink-0" />
//           <span
//             className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//               isExpanded
//                 ? 'opacity-100 translate-x-0 max-w-[140px]'
//                 : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
//             }`}
//           >
//             Sign Out
//           </span>
//         </button>
//       </div>
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-slate-50 flex">
//       {/* Layout spacer preserves main content width so hover expansion never shrinks content */}
//       <div
//         aria-hidden="true"
//         className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//           collapsed ? 'w-[68px]' : 'w-64'
//         }`}
//       />

//       {/* Desktop Sidebar (expands smoothly on hover over main content via z-40) */}
//       <aside
//         onMouseEnter={() => {
//           if (collapsed) setHovered(true);
//         }}
//         onMouseLeave={() => setHovered(false)}
//         className={`hidden lg:flex fixed inset-y-0 left-0 z-40 transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
//           isDesktopExpanded ? 'w-64' : 'w-[68px]'
//         } ${
//           isHoverFloating
//             ? 'shadow-2xl shadow-slate-950/35 ring-1 ring-slate-800/80'
//             : ''
//         }`}
//       >
//         {renderSidebar(isDesktopExpanded)}
//       </aside>

//       {/* Mobile Drawer */}
//       {mobileOpen && (
//         <div className="fixed inset-0 z-40 lg:hidden flex">
//           <div
//             className="fixed inset-0 bg-slate-900/50"
//             onClick={() => setMobileOpen(false)}
//             aria-hidden="true"
//           />
//           <div className="relative z-50 flex w-64 max-w-[82vw]">{renderSidebar(true)}</div>
//         </div>
//       )}

//       {/* Main Content */}
//       <div className="flex-1 flex flex-col min-w-0">
//         <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20">
//           <div className="flex items-center gap-2 sm:gap-3 min-w-0">
//             <button
//               type="button"
//               onClick={() => setMobileOpen(true)}
//               className="lg:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
//               aria-label="Open navigation menu"
//             >
//               <Menu className="w-5 h-5" />
//             </button>
//             <button
//               type="button"
//               onClick={toggleSidebar}
//               className="hidden lg:inline-flex p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
//               aria-label={collapsed ? 'Pin sidebar open' : 'Collapse sidebar (hover to expand)'}
//               title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar (hover to expand)'}
//             >
//               {collapsed ? (
//                 <PanelLeftOpen className="w-5 h-5" />
//               ) : (
//                 <PanelLeftClose className="w-5 h-5" />
//               )}
//             </button>
//             <div className="flex items-center gap-2 text-sm min-w-0">
//               <span className="text-slate-400 hidden sm:inline shrink-0">{roleLabel}</span>
//               <span className="text-slate-300 hidden sm:inline shrink-0" aria-hidden="true">/</span>
//               <span className="font-semibold text-slate-900 truncate">
//                 {getPageTitle(location.pathname)}
//               </span>
//             </div>
//           </div>

//           <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
//             {user.role === UserRole.SELLER && (
//               <button
//                 type="button"
//                 onClick={() => setWalletModalOpen(true)}
//                 aria-label="Open wallet and recharge"
//                 className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 h-9 text-xs font-medium text-slate-800 hover:bg-slate-100 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
//               >
//                 <Wallet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
//                 <span className="font-mono font-semibold tabular-nums text-slate-900">
//                   {formatINR(walletBalance)}
//                 </span>
//                 <span className="hidden sm:inline-flex items-center gap-0.5 text-blue-600 font-semibold border-l border-slate-200 pl-2">
//                   <Plus className="w-3 h-3 shrink-0" />
//                   <span>Recharge</span>
//                 </span>
//               </button>
//             )}
//             <ProfileMenu />
//             <NotificationBell />
//           </div>
//         </header>

//         <main className="flex-1 px-3.5 py-4 sm:p-5 lg:p-6 max-w-[1600px] w-full mx-auto">
//           <Outlet />
//         </main>
//       </div>

//       {user.role === UserRole.SELLER && (
//         <WalletRechargeModal
//           open={walletModalOpen}
//           onClose={() => setWalletModalOpen(false)}
//         />
//       )}
//     </div>
//   );
// }


import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PackagePlus,
  Calculator,
  Truck,
  Package,
  Search,
  UserCircle,
  Users,
  Map,
  IndianRupee,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Wallet,
  LifeBuoy,
  MapPin,
  ScanLine,
  Bell,
  ShieldAlert,
  ShieldCheck,
  Landmark,
  FileSpreadsheet,
  SlidersHorizontal,
  Route,
  MessageSquare,
  X,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import { UserRole, type SellerProfile } from '../types/index.ts';
import { formatINR } from '../utils/formatters.ts';
import { WalletRechargeModal } from '../components/shared/WalletRechargeModal.tsx';
import { NotificationBell } from '../components/shared/NotificationBell.tsx';
import { ProfileMenu } from '../components/shared/ProfileMenu.tsx';

const LOGO_COLLAPSED =
  'https://zipit.co.in/__l5e/assets-v1/f4a93292-c5de-43a9-9804-5a139f08f535/zipit-logo-dark.png';
const LOGO_EXPANDED =
  'https://zipit.co.in/__l5e/assets-v1/57ebba31-7bf0-44fc-91f3-015b261cea40/zipit-horizontal-white.png';

interface NavChildItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface NavItem {
  id?: string;
  to?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  children?: NavChildItem[];
}

const ROLE_NAV: Record<UserRole, NavItem[]> = {
  [UserRole.ADMIN]: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/sellers', label: 'Sellers', icon: Users },
    { to: '/admin/transporters', label: 'Transporters', icon: Truck },
    { to: '/admin/kyc', label: 'KYC Review', icon: ShieldCheck },
    { to: '/admin/settlements', label: 'Payout Settlements', icon: Landmark },
    { to: '/admin/routes', label: 'Master Routes & Rates', icon: Map },
    { to: '/admin/platform-charges', label: 'Platform Charges', icon: SlidersHorizontal },
    { to: '/admin/bookings', label: 'All Bookings', icon: Package },
    { to: '/admin/tracking', label: 'Track LR', icon: Search },
    { to: '/admin/whatsapp', label: 'WhatsApp Alerts', icon: MessageSquare },
    { to: '/admin/notifications', label: 'Notifications', icon: Bell },
    { to: '/admin/alerts', label: 'Incident Alerts', icon: ShieldAlert },
    { to: '/admin/support', label: 'Support Desk', icon: LifeBuoy },
  ],
  [UserRole.SELLER]: [
    { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/seller/create-booking', label: 'Create Booking', icon: ClipboardList },
    { to: '/seller/shipments', label: 'My Bookings', icon: Package },
    // { to: '/seller/bulk-booking', label: 'Bulk Booking', icon: FileSpreadsheet },
    { to: '/seller/pickup-addresses', label: 'Pickup Addresses', icon: MapPin },
    { to: '/seller/rate-calculator', label: 'Rate Calculator', icon: Calculator },
    // { to: '/seller/transporters', label: 'Transporters', icon: Truck },
    { to: '/seller/tracking', label: 'Tracking', icon: Search },
    { to: '/seller/notifications', label: 'Notifications', icon: Bell },
    { to: '/seller/profile', label: 'Profile', icon: UserCircle },
    { to: '/seller/support', label: 'Support', icon: LifeBuoy },
  ],
  [UserRole.TRANSPORTER]: [
    { to: '/transporter', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/transporter/assigned-bookings', label: 'Assigned Bookings', icon: Package },
    {
      id: 'personal-orders',
      label: 'Personal Orders',
      icon: ClipboardList,
      children: [
        { to: '/transporter/booked-orders', label: 'Booked Orders', icon: ClipboardList },
        { to: '/transporter/create-order', label: 'New Order', icon: PackagePlus },
      ],
    },
    { to: '/transporter/routes', label: 'Routes & Rates', icon: Route },
    // { to: '/transporter/update-status', label: 'Pickup & Delivery', icon: ClipboardCheck },
    { to: '/transporter/scanner', label: 'Carton Scanner', icon: ScanLine },
    // { to: '/transporter/service-areas', label: 'Service Areas', icon: MapPin },
    // { to: '/transporter/earnings', label: 'Earnings', icon: IndianRupee },
    { to: '/transporter/tracking', label: 'Track LR', icon: Search },
    { to: '/transporter/notifications', label: 'Notifications', icon: Bell },
    { to: '/transporter/profile', label: 'Profile', icon: UserCircle },
    { to: '/transporter/support', label: 'Support', icon: LifeBuoy },
  ],
};

function getPageTitle(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean).pop() || 'dashboard';
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DashboardLayout() {
  const { user, profile, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('zipit_sidebar_collapsed');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const isPersonalOrderRoute =
    location.pathname.startsWith('/transporter/booked-orders') ||
    location.pathname.startsWith('/transporter/create-order') ||
    location.pathname.startsWith('/transporter/personal-booking');

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    'personal-orders': isPersonalOrderRoute,
  }));

  useEffect(() => {
    setOpenGroups({ 'personal-orders': isPersonalOrderRoute });
  }, [isPersonalOrderRoute, location.pathname]);

  useEffect(() => {
    const handleOpenWallet = () => setWalletModalOpen(true);
    window.addEventListener('zipit:open-wallet-modal', handleOpenWallet);
    return () => window.removeEventListener('zipit:open-wallet-modal', handleOpenWallet);
  }, []);

  if (!user) return null;

  const sellerProfile = user.role === UserRole.SELLER ? (profile as SellerProfile | null) : null;
  const walletBalance = Number(sellerProfile?.walletBalance ?? 0);

  const toggleSidebar = () => {
    setHovered(false);
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('zipit_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const navItems = ROLE_NAV[user.role] || [];
  const roleLabel =
    user.role === UserRole.ADMIN
      ? 'Admin Console'
      : user.role === UserRole.SELLER
        ? 'Seller Portal'
        : 'Transporter Portal';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isDesktopExpanded = !collapsed || hovered;
  const isHoverFloating = collapsed && hovered;

  const renderSidebar = (isExpanded: boolean) => (
    <div
      className="flex flex-col w-full h-full bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 text-gray-100 border-r border-gray-800/90 overflow-hidden select-none antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800/80 shrink-0">
        <div className="relative flex items-center h-full min-w-0 flex-1 pl-1">
          {/* Collapsed logo */}
          <img
            src={LOGO_COLLAPSED}
            alt="ZIPIT"
            className={`absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 object-contain shrink-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
            }`}
          />
          {/* Expanded logo */}
          <img
            src={LOGO_EXPANDED}
            alt="ZIPIT B2B"
            className={`h-7 w-auto max-w-[156px] object-contain transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded
                ? 'opacity-100 translate-x-0'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-gray-400 hover:text-white hover:bg-gray-800/70 rounded-lg p-1.5 transition-colors"
          aria-label="Close navigation menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2.5 space-y-1 scrollbar-none"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          if (item.children && item.children.length > 0) {
            const groupKey = item.id || item.label;
            const hasActiveChild = item.children.some((c) =>
              location.pathname.startsWith(c.to)
            );
            const isOpen = Boolean(openGroups[groupKey]);
            return (
              <div key={groupKey}>
                <button
                  type="button"
                  title={!isExpanded ? item.label : undefined}
                  aria-label={item.label}
                  aria-expanded={isExpanded ? isOpen : false}
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
                  }
                  className={`group w-full relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium border transition-all duration-200 whitespace-nowrap ${
                    hasActiveChild && !isExpanded
                      ? 'bg-gradient-to-b from-gray-800 to-gray-800/80 text-white border-gray-700/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_1px_2px_0_rgba(0,0,0,0.3)]'
                      : hasActiveChild
                        ? 'bg-gray-800/55 text-white border-gray-800'
                        : 'text-gray-400 border-transparent hover:bg-gray-800/55 hover:text-gray-100'
                  }`}
                >
                  {hasActiveChild && !isExpanded && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-white"
                    />
                  )}
                  <span className="relative shrink-0">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        hasActiveChild ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'
                      }`}
                    />
                  </span>
                  <span
                    className={`flex-1 flex items-center justify-between gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isExpanded
                        ? 'opacity-100 translate-x-0 max-w-[180px]'
                        : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-gray-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-gray-300' : ''
                      }`}
                    />
                  </span>
                </button>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    isExpanded && isOpen
                      ? 'grid-rows-[1fr] opacity-100 mt-1'
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="overflow-hidden pl-3.5 ml-5 border-l border-gray-800/90 space-y-1">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          end={child.end}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            `group relative overflow-hidden flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
                              isActive
                                ? 'bg-gradient-to-b from-gray-800 to-gray-800/80 text-white border-gray-700/75 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
                                : 'text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-gray-100'
                            }`
                          }
                        >
                          <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          if (!item.to) return null;
          const isNotificationsItem = item.to.endsWith('/notifications');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={!isExpanded ? item.label : undefined}
              aria-label={item.label}
              onClick={() => {
                setMobileOpen(false);
                setOpenGroups({});
              }}
              className={({ isActive }) =>
                `group relative overflow-hidden flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium border transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'bg-gradient-to-b from-gray-800 to-gray-800/80 text-white border-gray-700/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_1px_2px_0_rgba(0,0,0,0.3)]'
                    : 'text-gray-400 border-transparent hover:bg-gray-800/55 hover:text-gray-100'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-white"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                  />
                  <span className="relative z-10 shrink-0">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'
                      }`}
                    />
                    {isNotificationsItem && unreadCount > 0 && !isExpanded && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white ring-2 ring-gray-950" />
                    )}
                  </span>
                  <span
                    className={`relative z-10 flex-1 flex items-center justify-between gap-2 min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isExpanded
                        ? 'opacity-100 translate-x-0 max-w-[180px]'
                        : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {isNotificationsItem && unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-gray-200 text-gray-950 rounded-md leading-none tabular-nums">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / Sign Out */}
      <div className="border-t border-gray-800/80 p-2.5 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          title={!isExpanded ? 'Sign Out' : undefined}
          aria-label="Sign Out"
          className="group relative overflow-hidden w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-gray-400 hover:bg-gray-800/65 hover:text-white border border-transparent hover:border-gray-800 transition-all duration-200 whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
          />
          <LogOut className="relative z-10 w-4 h-4 shrink-0 text-gray-400 group-hover:text-white transition-colors" />
          <span
            className={`relative z-10 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isExpanded
                ? 'opacity-100 translate-x-0 max-w-[140px]'
                : 'opacity-0 -translate-x-2 max-w-0 pointer-events-none'
            }`}
          >
            Sign Out
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Layout spacer preserves main content width so hover expansion never shrinks content */}
      <div
        aria-hidden="true"
        className={`hidden lg:block shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      />

      {/* Desktop Sidebar (expands smoothly on hover over main content via z-40) */}
      <aside
        onMouseEnter={() => {
          if (collapsed) setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        className={`hidden lg:flex fixed inset-y-0 left-0 z-40 transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDesktopExpanded ? 'w-64' : 'w-[68px]'
        } ${
          isHoverFloating
            ? 'shadow-2xl shadow-black/45 ring-1 ring-gray-800/90'
            : ''
        }`}
      >
        {renderSidebar(isDesktopExpanded)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-gray-950/60 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 flex w-64 max-w-[82vw]">{renderSidebar(true)}</div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-9 h-9 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:inline-flex p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              aria-label={collapsed ? 'Pin sidebar open' : 'Collapse sidebar (hover to expand)'}
              title={collapsed ? 'Pin sidebar open' : 'Collapse sidebar (hover to expand)'}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline shrink-0">{roleLabel}</span>
              <span className="text-slate-300 hidden sm:inline shrink-0" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {getPageTitle(location.pathname)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {user.role === UserRole.SELLER && (
              <button
                type="button"
                onClick={() => setWalletModalOpen(true)}
                aria-label="Open wallet and recharge"
                className="inline-flex items-center gap-1.5 sm:gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 h-9 text-xs font-medium text-slate-800 hover:bg-slate-100 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
              >
                <Wallet className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {formatINR(walletBalance)}
                </span>
                <span className="hidden sm:inline-flex items-center gap-0.5 text-blue-600 font-semibold border-l border-slate-200 pl-2">
                  <Plus className="w-3 h-3 shrink-0" />
                  <span>Recharge</span>
                </span>
              </button>
            )}
            <ProfileMenu />
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 px-3.5 py-4 sm:p-5 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {user.role === UserRole.SELLER && (
        <WalletRechargeModal
          open={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
        />
      )}
    </div>
  );
}
