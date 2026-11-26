import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ShieldAlert,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { UserRole } from '../../types/index.ts';

interface QuickLink {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  if (!user) return null;

  const roleLabel =
    user.role === UserRole.ADMIN
      ? 'Admin Console'
      : user.role === UserRole.SELLER
        ? 'Seller Portal'
        : 'Transporter Portal';

  const quickLinks: QuickLink[] =
    user.role === UserRole.ADMIN
      ? [
          { label: 'Operations Dashboard', to: '/admin', icon: LayoutDashboard },
          { label: 'Account & Security', to: '/admin/profile', icon: UserCircle },
          { label: 'Incident Alerts', to: '/admin/alerts', icon: ShieldAlert },
          { label: 'Notifications', to: '/admin/notifications', icon: Bell },
        ]
      : user.role === UserRole.SELLER
        ? [
            { label: 'My Profile & KYC', to: '/seller/profile', icon: UserCircle },
            { label: 'Notifications', to: '/seller/notifications', icon: Bell },
            { label: 'Support', to: '/seller/support', icon: LifeBuoy },
          ]
        : [
            { label: 'Company Profile & KYC', to: '/transporter/profile', icon: UserCircle },
            { label: 'Notifications', to: '/transporter/notifications', icon: Bell },
            { label: 'Support', to: '/transporter/support', icon: LifeBuoy },
          ];

  const handleNavigate = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      setOpen(false);
      navigate('/login');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        className="inline-flex items-center gap-2 h-9 pl-1.5 pr-2 sm:pr-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
      >
        <span className="w-6 h-6 rounded-md bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
          {getInitials(user.name)}
        </span>
        <span className="hidden sm:inline text-xs font-medium text-slate-800 max-w-[130px] truncate">
          {user.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile menu"
          className="fixed right-3 top-16 sm:top-auto sm:absolute sm:right-0 sm:mt-2 w-64 max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-500 truncate mt-0.5">{user.email}</p>
            <p className="text-[11px] font-medium text-slate-500 mt-1">{roleLabel}</p>
          </div>

          <div className="py-1.5 px-1.5">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  type="button"
                  role="menuitem"
                  onClick={() => handleNavigate(item.to)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-200 p-1.5">
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => void handleLogout()}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
