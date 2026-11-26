import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileDown,
  FileSpreadsheet,
  MapPin,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiClient, extractErrorMessage } from '../../services/api.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { EmptyState, ErrorBanner, LoadingSkeleton } from '../../components/ui/States.tsx';
import type { ServiceArea, Transporter } from '../../types/index.ts';

interface ImportParseSummary {
  fileName: string;
  validAreas: ServiceArea[];
  skippedRows: number;
}

function parseSpreadsheetRows(rows: unknown[][]): { valid: ServiceArea[]; skipped: number } {
  const validMap = new Map<string, ServiceArea>();
  let skipped = 0;

  let cityIdx = 0;
  let pinIdx = 1;
  let startRow = 0;

  if (rows.length > 0) {
    const firstRow = rows[0].map((cell) => String(cell ?? '').trim().toLowerCase());
    const foundCityIdx = firstRow.findIndex(
      (h) => h === 'city' || h.includes('city') || h === 'hub' || h === 'location'
    );
    const foundPinIdx = firstRow.findIndex(
      (h) => h === 'pincode' || h === 'pin' || h.includes('pin') || h.includes('zip')
    );

    if (foundCityIdx !== -1 || foundPinIdx !== -1) {
      if (foundCityIdx !== -1) cityIdx = foundCityIdx;
      if (foundPinIdx !== -1) pinIdx = foundPinIdx;
      startRow = 1;
    }
  }

  for (let i = startRow; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) {
      continue;
    }

    const rawCity = String(row[cityIdx] ?? '').trim().replace(/\s+/g, ' ');
    const rawPin = String(row[pinIdx] ?? '').trim().replace(/\.0$/, '');

    if (rawCity.length >= 2 && /^\d{6}$/.test(rawPin)) {
      const key = `${rawCity.toLowerCase()}::${rawPin}`;
      if (!validMap.has(key)) {
        validMap.set(key, { city: rawCity, pincode: rawPin });
      }
    } else {
      skipped += 1;
    }
  }

  return { valid: Array.from(validMap.values()), skipped };
}

export function TransporterServiceAreasPage() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<Transporter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [adding, setAdding] = useState(false);

  const [importPreview, setImportPreview] = useState<ImportParseSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const [search, setSearch] = useState('');
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: Transporter }>(
        '/transporter/profile'
      );
      setProfile(res.data.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load service areas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const serviceAreas = useMemo(() => profile?.serviceAreas || [], [profile]);

  const filteredAreas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return serviceAreas;
    return serviceAreas.filter(
      (a) => a.city.toLowerCase().includes(q) || a.pincode.includes(q)
    );
  }, [serviceAreas, search]);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCity = city.trim();
    const cleanPin = pincode.trim();

    if (cleanCity.length < 2) {
      showToast('Enter a valid city name (minimum 2 characters).', 'error');
      return;
    }
    if (!/^\d{6}$/.test(cleanPin)) {
      showToast('Pincode must be a valid 6-digit Indian postal code.', 'error');
      return;
    }

    setAdding(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: { addedCount: number; serviceAreas: ServiceArea[] };
      }>('/transporter/service-areas', {
        city: cleanCity,
        pincode: cleanPin,
      });

      setProfile((prev) =>
        prev ? { ...prev, serviceAreas: res.data.data.serviceAreas } : prev
      );
      setCity('');
      setPincode('');
      showToast(res.data.message, res.data.data.addedCount > 0 ? 'success' : 'info');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to add service area.'), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        showToast('The selected file contains no sheets.', 'error');
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const { valid, skipped } = parseSpreadsheetRows(rows);

      if (valid.length === 0) {
        showToast(
          'No valid City + 6-digit Pincode rows found. Expected columns: city, pincode.',
          'error'
        );
        setImportPreview(null);
      } else {
        setImportPreview({
          fileName: file.name,
          validAreas: valid.slice(0, 500),
          skippedRows: skipped,
        });
      }
    } catch {
      showToast('Unable to parse file. Please upload a valid .csv, .xlsx, or .xls file.', 'error');
      setImportPreview(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.validAreas.length === 0) return;
    setImporting(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: { addedCount: number; duplicateCount: number; serviceAreas: ServiceArea[] };
      }>('/transporter/service-areas/import', {
        serviceAreas: importPreview.validAreas,
      });

      setProfile((prev) =>
        prev ? { ...prev, serviceAreas: res.data.data.serviceAreas } : prev
      );
      setImportPreview(null);
      showToast(res.data.message, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to import service areas.'), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csv = ['city,pincode', 'Pune,411026', 'Mumbai,400013', 'Surat,395003', 'Ahmedabad,380015'].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zipit-service-areas-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleRemoveArea = async (area: ServiceArea) => {
    const key = `${area.city}::${area.pincode}`;
    setRemovingKey(key);
    try {
      const res = await apiClient.delete<{
        success: boolean;
        message: string;
        data: { serviceAreas: ServiceArea[] };
      }>('/transporter/service-areas', {
        data: { city: area.city, pincode: area.pincode },
      });
      setProfile((prev) =>
        prev ? { ...prev, serviceAreas: res.data.data.serviceAreas } : prev
      );
      showToast(res.data.message, 'success');
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to remove service area.'), 'error');
    } finally {
      setRemovingKey(null);
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;
  if (error || !profile) {
    return <ErrorBanner message={error || 'Unable to load profile'} onRetry={loadProfile} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Service Areas & Pincode Coverage</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage serviceable hubs and pincodes manually or import in bulk via CSV / Excel spreadsheets
          </p>
        </div>
        <div className="text-sm font-mono tabular-nums text-slate-700 bg-white border border-slate-200 rounded-lg px-3.5 py-2">
          Active Coverage: <strong>{serviceAreas.length}</strong> pincodes
        </div>
      </div>

      {/* Add Manual + CSV/Excel Import */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Manual Add Card */}
        <form
          onSubmit={handleManualAdd}
          className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Add Service Area Manually</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add an individual pickup or delivery hub pincode to {profile.companyName}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">City Name *</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g., Nashik"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                6-Digit Pincode *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                pattern="\d{6}"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g., 422010"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={adding}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{adding ? 'Adding...' : 'Add Service Area'}</span>
            </button>
          </div>
        </form>

        {/* CSV / Excel Bulk Import Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span>CSV / Excel Bulk Import</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload <span className="font-mono">.csv</span>, <span className="font-mono">.xlsx</span>, or <span className="font-mono">.xls</span> with columns <span className="font-mono">city, pincode</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Sample CSV</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileSelected}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-center hover:border-blue-400 hover:bg-blue-50/30 transition"
          >
            <Upload className="w-5 h-5 text-blue-600 mx-auto" />
            <p className="mt-1.5 text-xs font-semibold text-slate-800">
              Choose CSV or Excel Spreadsheet
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Duplicates are skipped automatically · Max 500 rows per upload
            </p>
          </button>

          {importPreview && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3.5 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 truncate">
                  {importPreview.fileName}
                </span>
                <span className="font-mono tabular-nums text-blue-800">
                  {importPreview.validAreas.length} valid · {importPreview.skippedRows} invalid skipped
                </span>
              </div>
              <p className="text-slate-600 truncate">
                Preview:{' '}
                {importPreview.validAreas
                  .slice(0, 4)
                  .map((a) => `${a.city} (${a.pincode})`)
                  .join(', ')}
                {importPreview.validAreas.length > 4
                  ? ` +${importPreview.validAreas.length - 4} more`
                  : ''}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 font-medium"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleConfirmImport}
                  className="px-3.5 py-1.5 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing
                    ? 'Importing...'
                    : `Import ${importPreview.validAreas.length} Service Areas`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configured Service Areas Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Configured Service Areas</h2>
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search city or pincode..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredAreas.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching service areas"
              description="Adjust your search filter or add a new city and pincode above."
            />
          </div>
        ) : (
          <>
            {/* Mobile / Tablet Card Grid */}
            <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3">
              {filteredAreas.map((area) => {
                const key = `${area.city}::${area.pincode}`;
                const isLastOne = serviceAreas.length <= 1;

                return (
                  <div
                    key={key}
                    className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3 bg-white"
                  >
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-1.5 font-medium text-sm text-slate-900 truncate">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{area.city}</span>
                      </p>
                      <p className="font-mono text-xs text-slate-500 tabular-nums mt-0.5 pl-5">
                        {area.pincode}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isLastOne || removingKey === key}
                      title={
                        isLastOne
                          ? 'At least one active service area must remain configured.'
                          : `Remove ${area.city} (${area.pincode})`
                      }
                      onClick={() => handleRemoveArea(area)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{removingKey === key ? '...' : 'Remove'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500">
                    <th className="py-2.5 px-4">City / Hub</th>
                    <th className="py-2.5 px-4">Pincode</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredAreas.map((area) => {
                    const key = `${area.city}::${area.pincode}`;
                    const isLastOne = serviceAreas.length <= 1;

                    return (
                      <tr key={key} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <span className="inline-flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{area.city}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {area.pincode}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            disabled={isLastOne || removingKey === key}
                            title={
                              isLastOne
                                ? 'At least one active service area must remain configured.'
                                : `Remove ${area.city} (${area.pincode})`
                            }
                            onClick={() => handleRemoveArea(area)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{removingKey === key ? 'Removing...' : 'Remove'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
