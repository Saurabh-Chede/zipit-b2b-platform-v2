import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  LifeBuoy,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { formatDateTime } from '../../utils/formatters.ts';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { Modal } from '../ui/Modal.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../ui/States.tsx';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  UserRole,
  type Booking,
  type PaginatedResponse,
  type SupportTicket,
  type SupportTicketListResponse,
} from '../../types/index.ts';

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  [SupportTicketCategory.SHIPMENT_DELAY]: 'Shipment Delay',
  [SupportTicketCategory.BILLING_WALLET]: 'Billing & Wallet',
  [SupportTicketCategory.PICKUP_DELIVERY]: 'Pickup & Delivery',
  [SupportTicketCategory.POD_DOCUMENTS]: 'POD & Documents',
  [SupportTicketCategory.ACCOUNT_TECHNICAL]: 'Account & Technical',
  [SupportTicketCategory.OTHER]: 'General Query',
};

const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  [SupportTicketPriority.LOW]: 'Low',
  [SupportTicketPriority.MEDIUM]: 'Medium',
  [SupportTicketPriority.HIGH]: 'High',
  [SupportTicketPriority.URGENT]: 'Urgent',
};

const PRIORITY_TEXT_CLASS: Record<SupportTicketPriority, string> = {
  [SupportTicketPriority.LOW]: 'text-slate-600',
  [SupportTicketPriority.MEDIUM]: 'text-slate-700',
  [SupportTicketPriority.HIGH]: 'text-amber-700 font-medium',
  [SupportTicketPriority.URGENT]: 'text-red-700 font-semibold',
};

const STATUS_FILTERS: { id: 'ALL' | SupportTicketStatus; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: SupportTicketStatus.OPEN, label: 'Open' },
  { id: SupportTicketStatus.IN_PROGRESS, label: 'In Progress' },
  { id: SupportTicketStatus.RESOLVED, label: 'Resolved' },
  { id: SupportTicketStatus.CLOSED, label: 'Closed' },
];

export function SupportView() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.role === UserRole.ADMIN;
  const isTransporter = user?.role === UserRole.TRANSPORTER;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | SupportTicketStatus>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole.SELLER | UserRole.TRANSPORTER>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Recent LR suggestions for seller/transporter ticket creation
  const [recentLrs, setRecentLrs] = useState<string[]>([]);

  // New ticket modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>(
    SupportTicketCategory.PICKUP_DELIVERY
  );
  const [priority, setPriority] = useState<SupportTicketPriority>(SupportTicketPriority.MEDIUM);
  const [lrNumber, setLrNumber] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  // Reply / status state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadTickets = useCallback(
    async (preserveSelection = true) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<{ success: boolean; data: SupportTicketListResponse }>(
          '/support',
          {
            params: {
              limit: 50,
              status: statusFilter === 'ALL' ? undefined : statusFilter,
              role: isAdmin && roleFilter !== 'ALL' ? roleFilter : undefined,
              search: debouncedSearch || undefined,
            },
          }
        );
        const items = res.data.data.items;
        setTickets(items);
        setSummary(res.data.data.summary);

        if (items.length === 0) {
          setSelectedId(null);
        } else if (!preserveSelection || !items.some((t) => t._id === selectedId)) {
          setSelectedId(items[0]._id);
        }
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to load support tickets.'));
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, roleFilter, debouncedSearch, isAdmin, selectedId]
  );

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (isAdmin) return;
    apiClient
      .get<{ success: boolean; data: PaginatedResponse<Booking> }>('/bookings', {
        params: { page: 1, limit: 15 },
      })
      .then((res) => {
        setRecentLrs(res.data.data.items.map((b) => b.lrNumber));
      })
      .catch(() => {
        setRecentLrs([]);
      });
  }, [isAdmin]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t._id === selectedId) || null,
    [tickets, selectedId]
  );

  const openQuickTicketModal = (defaultCat: SupportTicketCategory) => {
    setCategory(defaultCat);
    setModalOpen(true);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: SupportTicket }>('/support', {
        subject: subject.trim(),
        category,
        priority,
        lrNumber: lrNumber.trim() || undefined,
        message: message.trim(),
      });
      const created = res.data.data;
      showToast(`Ticket ${created.ticketNumber} created.`, 'success');
      setSubject('');
      setLrNumber('');
      setMessage('');
      setPriority(SupportTicketPriority.MEDIUM);
      setModalOpen(false);
      setStatusFilter('ALL');
      setSelectedId(created._id);
      await loadTickets(true);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to create support ticket.'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: SupportTicket }>(
        `/support/${selectedTicket._id}/messages`,
        { message: replyText.trim() }
      );
      const updated = res.data.data;
      setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      setReplyText('');
      showToast('Reply sent.', 'success');
      await loadTickets(true);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to send reply.'), 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (nextStatus: SupportTicketStatus) => {
    if (!selectedTicket) return;
    setUpdatingStatus(true);
    try {
      const res = await apiClient.patch<{ success: boolean; data: SupportTicket }>(
        `/support/${selectedTicket._id}/status`,
        { status: nextStatus }
      );
      const updated = res.data.data;
      setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      showToast(`Ticket updated to ${nextStatus.replace('_', ' ').toLowerCase()}.`, 'success');
      await loadTickets(true);
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to update ticket status.'), 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const pageTitle = isAdmin
    ? 'Support Desk'
    : isTransporter
      ? 'Transporter Support'
      : 'Seller Support & Help Desk';

  const pageSubtitle = isAdmin
    ? 'Review and respond to operational, billing, and shipment tickets from sellers and transporters'
    : isTransporter
      ? 'Raise dispatch, POD upload, detention, or payout queries directly with ZIPIT Operations'
      : 'Get help with shipments, pickups, wallet & invoicing, or LR documents';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{pageTitle}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{pageSubtitle}</p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => loadTickets(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
        <div className="px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-slate-500">Total Tickets</p>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {summary.total}
          </p>
        </div>
        <div className="px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-slate-500">Open</p>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-1">
            {summary.open}
          </p>
        </div>
        <div className="px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-slate-500">In Progress</p>
          <p className="text-2xl font-bold text-blue-700 font-mono tabular-nums mt-1">
            {summary.inProgress}
          </p>
        </div>
        <div className="px-4 py-3.5 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-slate-500">Resolved &amp; Closed</p>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {summary.resolved + summary.closed}
          </p>
        </div>
      </div>

      {/* Operations Escalation Strip for Seller & Transporter */}
      {!isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3.5 sm:px-5 sm:py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
              <LifeBuoy className="w-4 h-4 text-blue-600 shrink-0" />
              Operations Desk
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              +91 20 4850 2200
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              support@zipitlogistics.in
            </span>
            <span className="text-slate-500">Mon–Sat · 08:00–20:00 IST</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openQuickTicketModal(SupportTicketCategory.SHIPMENT_DELAY)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Report Delay
            </button>
            <button
              type="button"
              onClick={() => openQuickTicketModal(SupportTicketCategory.BILLING_WALLET)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {isTransporter ? 'Payout / Billing' : 'Wallet / Invoice'}
            </button>
            <button
              type="button"
              onClick={() => openQuickTicketModal(SupportTicketCategory.POD_DOCUMENTS)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              {isTransporter ? 'POD Upload Issue' : 'LR / POD Issue'}
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto scrollbar-none max-w-full">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'All Partners' },
                  { id: UserRole.SELLER, label: 'Sellers' },
                  { id: UserRole.TRANSPORTER, label: 'Transporters' },
                ] as const
              ).map((rf) => (
                <button
                  key={rf.id}
                  type="button"
                  onClick={() => setRoleFilter(rf.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    roleFilter === rf.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {rf.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search ticket #, subject, LR..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Main Split Workspace */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => loadTickets(true)} />
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No support tickets found"
          description={
            isAdmin
              ? 'No seller or transporter tickets match your current filter.'
              : 'Need help with a shipment, LR document, or billing? Raise a ticket and our ops team will respond.'
          }
          action={
            !isAdmin ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Ticket</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Ticket Queue */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[42dvh] lg:max-h-[680px] overflow-y-auto">
            {tickets.map((t) => {
              const active = t._id === selectedTicket?._id;
              return (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => setSelectedId(t._id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors ${
                    active ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-blue-700 tabular-nums">
                          {t.ticketNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={PRIORITY_TEXT_CLASS[t.priority]}>
                          {PRIORITY_LABELS[t.priority]}
                        </span>
                        {t.lrNumber && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {t.lrNumber}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                        {t.subject}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 mt-1">
                        {isAdmin && (
                          <>
                            <span className="font-medium text-slate-700">
                              {t.createdByName} ({t.createdByRole === UserRole.SELLER ? 'Seller' : 'Transporter'})
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span>{CATEGORY_LABELS[t.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDateTime(t.lastMessageAt)}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Active Ticket Conversation */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            {!selectedTicket ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Select a ticket from the list to view the conversation.
              </div>
            ) : (
              <>
                <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-blue-700 tabular-nums">
                        {selectedTicket.ticketNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{CATEGORY_LABELS[selectedTicket.category]}</span>
                      <span aria-hidden="true">·</span>
                      <span className={PRIORITY_TEXT_CLASS[selectedTicket.priority]}>
                        {PRIORITY_LABELS[selectedTicket.priority]} Priority
                      </span>
                      {selectedTicket.lrNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-slate-700">
                            LR: {selectedTicket.lrNumber}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-base font-semibold text-slate-900 mt-1">
                      {selectedTicket.subject}
                    </h2>
                    {isAdmin && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Raised by {selectedTicket.createdByName} ({selectedTicket.createdByRole})
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={selectedTicket.status} />

                    {isAdmin ? (
                      <select
                        value={selectedTicket.status}
                        disabled={updatingStatus}
                        onChange={(e) => handleStatusChange(e.target.value as SupportTicketStatus)}
                        aria-label="Update ticket status"
                        className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value={SupportTicketStatus.OPEN}>Open</option>
                        <option value={SupportTicketStatus.IN_PROGRESS}>In Progress</option>
                        <option value={SupportTicketStatus.RESOLVED}>Resolved</option>
                        <option value={SupportTicketStatus.CLOSED}>Closed</option>
                      </select>
                    ) : selectedTicket.status === SupportTicketStatus.CLOSED ? (
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleStatusChange(SupportTicketStatus.OPEN)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reopen</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleStatusChange(SupportTicketStatus.CLOSED)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Close Ticket</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Thread */}
                <div className="p-4 sm:p-5 space-y-4 max-h-[55dvh] sm:max-h-[440px] overflow-y-auto bg-slate-50/40">
                  {selectedTicket.messages.map((msg) => {
                    const isSelf = msg.senderUserId === user?.id;
                    const isAdminMsg = msg.senderRole === UserRole.ADMIN;
                    return (
                      <div
                        key={msg._id}
                        className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                          <span className="font-medium text-slate-700">{msg.senderName}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isAdminMsg
                              ? 'ZIPIT Support'
                              : msg.senderRole === UserRole.SELLER
                                ? 'Seller'
                                : 'Transporter'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDateTime(msg.createdAt)}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                            isSelf
                              ? 'bg-blue-600 text-white'
                              : isAdminMsg
                                ? 'bg-white border border-slate-200 text-slate-800'
                                : 'bg-white border border-slate-200 text-slate-800'
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Reply Composer */}
                <form
                  onSubmit={handleSendReply}
                  className="p-4 border-t border-slate-200 bg-white space-y-3"
                >
                  {selectedTicket.status === SupportTicketStatus.RESOLVED && !isAdmin && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        This ticket is marked resolved. Sending a reply will reopen it for the
                        operations team.
                      </span>
                    </div>
                  )}
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={
                      isAdmin
                        ? 'Write a response to the partner...'
                        : 'Add an update or reply to ZIPIT Support...'
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    required
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="tabular-nums">
                        {selectedTicket.messages.length}{' '}
                        {selectedTicket.messages.length === 1 ? 'message' : 'messages'} in thread
                      </span>
                    </span>
                    <button
                      type="submit"
                      disabled={sendingReply || replyText.trim().length < 2}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Support Ticket"
        subtitle="Our operations team typically responds within 2 business hours."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Subject*</label>
            <input
              type="text"
              required
              minLength={4}
              maxLength={160}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={
                isTransporter
                  ? 'e.g. Consignee dock closed / POD upload failure'
                  : 'e.g. Pickup delayed or freight charge query'
              }
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category*</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {Object.values(SupportTicketCategory).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Priority*</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {Object.values(SupportTicketPriority).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Linked LR Number <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              list="zipit-recent-lrs"
              value={lrNumber}
              onChange={(e) => setLrNumber(e.target.value.toUpperCase())}
              placeholder="e.g. ZIPIT-LR-100001"
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {recentLrs.length > 0 && (
              <datalist id="zipit-recent-lrs">
                {recentLrs.map((lr) => (
                  <option key={lr} value={lr} />
                ))}
              </datalist>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Issue Details*
            </label>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the shipment, route, or billing issue clearly so operations can resolve it quickly..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {creating ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
