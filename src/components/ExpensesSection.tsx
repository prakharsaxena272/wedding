import React, { useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Banknote,
  CheckCircle2,
  Download,
  IndianRupee,
  Pencil,
  Plus,
  Receipt,
  Save,
  Search,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ExpenseCategory,
  ExpensePaymentMode,
  ExpensePaymentStatus,
  ExpenseRecord,
  FIELD_LIMITS,
  VendorCategory,
  VendorRecord,
} from '../types/wedding';

interface ExpensesSectionProps {
  expenses: ExpenseRecord[];
  vendors: VendorRecord[];
  userEmail: string;
}

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Dresses & Couture',
  'Return Gifts & Favors',
  'Venue & Catering',
  'Jewellery & Shagun',
  'Decor & Flowers',
  'Photography & Cinema',
  'Travel & Hospitality',
  'Pandit & Rituals',
  'Other / Misc',
];

const PAYMENT_MODES: ExpensePaymentMode[] = [
  'UPI',
  'Cash',
  'Bank Transfer / NEFT',
  'Card',
  'Cheque',
  'Pending',
];

const PAYMENT_STATUSES: ExpensePaymentStatus[] = ['Paid', 'Advance Paid', 'Pending'];

const FAMILY_PAYER_PRESETS = ['Vijay Saxena', 'Shipra Saxena', 'Prakhar Saxena', 'Divyanh Saxena'];

export function parseInrAmount(raw: string): number {
  const cleaned = raw.trim().toLowerCase().replace(/[₹,\s]/g, '');
  if (!cleaned) return 0;

  const lakhMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:l|lac|lakh|lakhs)/);
  if (lakhMatch) {
    return Math.round(Number(lakhMatch[1]) * 100000);
  }

  const crMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore|crores)/);
  if (crMatch) {
    return Math.round(Number(crMatch[1]) * 10000000);
  }

  const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/);
  if (kMatch) {
    return Math.round(Number(kMatch[1]) * 1000);
  }

  const numMatch = cleaned.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const val = Number(numMatch[0]);
  return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function mapVendorCategoryToExpenseCategory(cat: VendorCategory): ExpenseCategory {
  if (cat === 'Decor & Mandap') return 'Decor & Flowers';
  if (cat === 'Catering & Feast') return 'Venue & Catering';
  if (cat === 'Photography & Cinema') return 'Photography & Cinema';
  if (cat === 'Couture & Styling') return 'Dresses & Couture';
  if (cat === 'Hospitality & Stay') return 'Travel & Hospitality';
  return 'Other / Misc';
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const ExpensesSection: React.FC<ExpensesSectionProps> = ({
  expenses,
  vendors,
  userEmail,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Dresses & Couture');
  const [amountInput, setAmountInput] = useState('');
  const [paymentMode, setPaymentMode] = useState<ExpensePaymentMode>('UPI');
  const [paymentStatus, setPaymentStatus] = useState<ExpensePaymentStatus>('Paid');
  const [paidBy, setPaidBy] = useState('Vijay Saxena');
  const [expenseDate, setExpenseDate] = useState(getTodayDateString);
  const [notes, setNotes] = useState('');
  const [linkedVendorId, setLinkedVendorId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | ExpenseCategory>('All');
  const [modeFilter, setModeFilter] = useState<'All' | ExpensePaymentMode>('All');

  const confirmedVendorRows = useMemo(() => {
    const confirmed = vendors.filter((v) => v.status === 'Confirmed / Booked');
    return confirmed.map((v) => {
      const quotedAmount = parseInrAmount(v.estimate);
      const loggedAgainstVendor = expenses
        .filter((e) => e.linkedVendorId === v.id)
        .reduce((acc, e) => acc + e.amount, 0);
      const remainingBalance = Math.max(0, quotedAmount - loggedAgainstVendor);
      return {
        vendor: v,
        quotedAmount,
        loggedAgainstVendor,
        remainingBalance,
      };
    });
  }, [vendors, expenses]);

  const metrics = useMemo(() => {
    let totalDocumented = 0;
    let totalPaidLogged = 0;
    let totalPendingLogged = 0;
    let totalMiscExpenses = 0;

    const byMode: Record<ExpensePaymentMode, number> = {
      UPI: 0,
      Cash: 0,
      'Bank Transfer / NEFT': 0,
      Card: 0,
      Cheque: 0,
      Pending: 0,
    };

    const byCategory: Array<{ category: ExpenseCategory; total: number; count: number }> = [];
    const categoryTotalsMap: Partial<Record<ExpenseCategory, { total: number; count: number }>> = {};

    for (const item of expenses) {
      const amt = Number(item.amount) || 0;
      totalDocumented += amt;
      if (item.paymentStatus === 'Paid' || item.paymentStatus === 'Advance Paid') {
        totalPaidLogged += amt;
      } else {
        totalPendingLogged += amt;
      }
      if (!item.linkedVendorId) {
        totalMiscExpenses += amt;
      }
      byMode[item.paymentMode] = (byMode[item.paymentMode] ?? 0) + amt;
      const prevCat = categoryTotalsMap[item.category] ?? { total: 0, count: 0 };
      categoryTotalsMap[item.category] = {
        total: prevCat.total + amt,
        count: prevCat.count + 1,
      };
    }

    for (const cat of EXPENSE_CATEGORIES) {
      const entry = categoryTotalsMap[cat];
      if (entry && (entry.total > 0 || entry.count > 0)) {
        byCategory.push({ category: cat, total: entry.total, count: entry.count });
      }
    }
    byCategory.sort((a, b) => b.total - a.total);

    const totalConfirmedQuotes = confirmedVendorRows.reduce((s, r) => s + r.quotedAmount, 0);
    const totalConfirmedRemaining = confirmedVendorRows.reduce(
      (s, r) => s + r.remainingBalance,
      0
    );

    const grandTotalOutlay = totalDocumented + totalConfirmedRemaining;

    return {
      totalDocumented,
      totalPaidLogged,
      totalPendingLogged,
      totalMiscExpenses,
      totalConfirmedQuotes,
      totalConfirmedRemaining,
      grandTotalOutlay,
      byMode,
      byCategory,
    };
  }, [expenses, confirmedVendorRows]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesCat = categoryFilter === 'All' || e.category === categoryFilter;
      const matchesMode = modeFilter === 'All' || e.paymentMode === modeFilter;
      const matchesQuery =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.paidBy.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q);
      return matchesCat && matchesMode && matchesQuery;
    });
  }, [expenses, categoryFilter, modeFilter, searchQuery]);

  const filteredSubtotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [filteredExpenses]
  );

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Dresses & Couture');
    setAmountInput('');
    setPaymentMode('UPI');
    setPaymentStatus('Paid');
    setPaidBy('Vijay Saxena');
    setExpenseDate(getTodayDateString());
    setNotes('');
    setLinkedVendorId('');
    setFormError(null);
  };

  const startEditExpense = (item: ExpenseRecord) => {
    setEditingId(item.id);
    setTitle(item.title);
    setCategory(item.category);
    setAmountInput(String(item.amount));
    setPaymentMode(item.paymentMode);
    setPaymentStatus(item.paymentStatus);
    setPaidBy(item.paidBy);
    setExpenseDate(item.expenseDate || getTodayDateString());
    setNotes(item.notes);
    setLinkedVendorId(item.linkedVendorId || '');
    setFormError(null);
  };

  const prefillFromConfirmedVendor = (row: (typeof confirmedVendorRows)[number]) => {
    setEditingId(null);
    setLinkedVendorId(row.vendor.id);
    setTitle(
      row.loggedAgainstVendor > 0
        ? `${row.vendor.name} — Balance Payment`
        : `${row.vendor.name} — Booking Payment`
    );
    setCategory(mapVendorCategoryToExpenseCategory(row.vendor.category));
    const suggested = row.remainingBalance > 0 ? row.remainingBalance : row.quotedAmount;
    setAmountInput(suggested > 0 ? String(suggested) : '');
    setPaymentMode('UPI');
    setPaymentStatus('Paid');
    setExpenseDate(getTodayDateString());
    setNotes(row.vendor.contact ? `Vendor contact: ${row.vendor.contact}` : '');
    setFormError(null);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavedBanner(null);

    const cleanTitle = title.trim().slice(0, FIELD_LIMITS.expenseTitleMax);
    const parsedAmount = Math.round(Number(amountInput));

    if (!cleanTitle) {
      setFormError('Please enter an expense title or description.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > FIELD_LIMITS.expenseAmountMax) {
      setFormError('Please enter a valid amount in ₹ (0 or above).');
      return;
    }

    const effectiveMode: ExpensePaymentMode =
      paymentStatus === 'Pending' && paymentMode === 'Pending' ? 'Pending' : paymentMode;

    const payload = {
      title: cleanTitle,
      category,
      amount: parsedAmount,
      paymentMode: effectiveMode,
      paymentStatus,
      paidBy: paidBy.trim().slice(0, FIELD_LIMITS.expensePaidByMax),
      expenseDate: expenseDate.trim().slice(0, FIELD_LIMITS.expenseDateMax) || getTodayDateString(),
      notes: notes.trim().slice(0, FIELD_LIMITS.expenseNotesMax),
      linkedVendorId: linkedVendorId.trim().slice(0, 128),
    };

    setSaving(true);
    try {
      if (editingId) {
        const existing = expenses.find((x) => x.id === editingId);
        await updateDoc(doc(db, 'expenses', editingId), {
          ...payload,
          addedBy: existing?.addedBy || userEmail,
          createdAt: existing?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSavedBanner('Expense entry updated.');
      } else {
        const newRef = doc(collection(db, 'expenses'));
        await setDoc(newRef, {
          ...payload,
          addedBy: userEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSavedBanner(`Documented ${cleanTitle} (${formatInr(parsedAmount)} via ${effectiveMode}).`);
      }
      resetForm();
      window.setTimeout(() => setSavedBanner(null), 3500);
    } catch (err) {
      setFormError('Could not save expense entry. Please check all fields and try again.');
      handleFirestoreError(err, OperationType.WRITE, 'expenses');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'expenses', id));
      if (editingId === id) resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Title',
      'Category',
      'Amount (INR)',
      'Payment Mode',
      'Status',
      'Paid By',
      'Linked Vendor',
      'Notes',
      'Recorded By',
    ];
    const rows = expenses.map((item) => {
      const vendorName =
        vendors.find((v) => v.id === item.linkedVendorId)?.name || '';
      return [
        escapeCsvCell(item.expenseDate),
        escapeCsvCell(item.title),
        escapeCsvCell(item.category),
        escapeCsvCell(item.amount),
        escapeCsvCell(item.paymentMode),
        escapeCsvCell(item.paymentStatus),
        escapeCsvCell(item.paidBy),
        escapeCsvCell(vendorName),
        escapeCsvCell(item.notes),
        escapeCsvCell(item.addedBy),
      ];
    });

    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'Prakhar-Prakriti-Wedding-Expenses.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Running Total Summary Header */}
      <div className="double-filigree-card rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="label-caps text-[#8E3B6E]">Expense Tracking Module</p>
            <h2 className="mt-1 font-editorial text-2xl font-semibold text-[#231420] sm:text-3xl">
              Running Total Summary
            </h2>
            <p className="mt-1 text-xs text-[#573D4F]">
              All confirmed vendor bookings, dresses, return gifts, and Cash / UPI entries saved
              live in Firestore.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="label-caps text-[#6B4C8C]">Grand Running Total</p>
            <p className="mt-0.5 text-3xl font-bold text-[#231420] tabular-nums sm:text-4xl">
              {formatInr(metrics.grandTotalOutlay)}
            </p>
            <p className="mt-0.5 text-xs text-[#7A5E72] tabular-nums">
              Logged Ledger: {formatInr(metrics.totalDocumented)}
              {metrics.totalConfirmedRemaining > 0
                ? ` + Vendor Balance: ${formatInr(metrics.totalConfirmedRemaining)}`
                : ''}
            </p>
          </div>
        </div>

        {/* Top Calculation KPI Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
            <p className="label-caps text-[#6B4C8C]">Total Paid (Logged)</p>
            <p className="mt-1 text-2xl font-bold text-[#231420] tabular-nums">
              {formatInr(metrics.totalPaidLogged)}
            </p>
            <p className="mt-0.5 text-xs text-[#7A5E72]">
              {expenses.filter((e) => e.paymentStatus !== 'Pending').length} payments recorded
            </p>
          </div>

          <div className="rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
            <p className="label-caps text-[#8E3B6E]">UPI Total</p>
            <p className="mt-1 text-2xl font-bold text-[#231420] tabular-nums">
              {formatInr(metrics.byMode.UPI)}
            </p>
            <p className="mt-0.5 text-xs text-[#7A5E72]">Digital UPI payments</p>
          </div>

          <div className="rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
            <p className="label-caps text-[#8E3B6E]">Cash Total</p>
            <p className="mt-1 text-2xl font-bold text-[#231420] tabular-nums">
              {formatInr(metrics.byMode.Cash)}
            </p>
            <p className="mt-0.5 text-xs text-[#7A5E72]">Cash payments</p>
          </div>

          <div className="rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
            <p className="label-caps text-[#573D4F]">Confirmed Vendors</p>
            <p className="mt-1 text-2xl font-bold text-[#231420] tabular-nums">
              {formatInr(metrics.totalConfirmedQuotes)}
            </p>
            <p className="mt-0.5 text-xs text-[#7A5E72] tabular-nums">
              {confirmedVendorRows.length} booked · {formatInr(metrics.totalConfirmedRemaining)} due
            </p>
          </div>
        </div>

        {/* Category Running Totals */}
        {metrics.byCategory.length > 0 && (
          <div className="mt-4 border-t border-[#efe0ea] pt-4">
            <p className="mb-2 text-xs font-semibold text-[#231420]">
              Category Running Totals:
            </p>
            <div className="flex flex-wrap gap-2">
              {metrics.byCategory.map((c) => (
                <button
                  key={c.category}
                  type="button"
                  onClick={() =>
                    setCategoryFilter(categoryFilter === c.category ? 'All' : c.category)
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    categoryFilter === c.category
                      ? 'bg-[#6B4C8C] text-white'
                      : 'border border-[#e4cde0] bg-[#fdf5f8] text-[#231420] hover:border-[#8E3B6E]'
                  }`}
                >
                  <span>{c.category}:</span>
                  <strong className="tabular-nums">{formatInr(c.total)}</strong>
                  <span className="opacity-70">({c.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Mode Breakdown Strip + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e4cde0] bg-[#f8edf3] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#231420]">Filter by Payment Mode:</span>
          {PAYMENT_MODES.map((mode) => {
            const total = metrics.byMode[mode] || 0;
            const active = modeFilter === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setModeFilter(active ? 'All' : mode)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#8E3B6E] text-white'
                    : 'border border-[#e4cde0] bg-[#fdf5f8] text-[#573D4F] hover:border-[#8E3B6E]'
                }`}
              >
                {mode === 'UPI' && <Smartphone className="h-3 w-3" aria-hidden="true" />}
                {mode === 'Cash' && <Banknote className="h-3 w-3" aria-hidden="true" />}
                <span>
                  {mode}: <strong className="tabular-nums">{formatInr(total)}</strong>
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={expenses.length === 0}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-[#6B4C8C]/40 bg-[#EDE5F8] px-4 py-1.5 text-xs font-semibold text-[#4A2E70] transition-colors hover:bg-[#e1d5f4] disabled:opacity-50 whitespace-nowrap cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Export Expenses CSV</span>
        </button>
      </div>

      {/* Confirmed Vendors Auto-Included Calculation Panel */}
      {confirmedVendorRows.length > 0 && (
        <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="label-caps text-[#6B4C8C]">Auto-Added from Vendors</p>
              <h3 className="mt-0.5 font-editorial text-xl font-semibold text-[#231420]">
                Confirmed Vendor Commitments ({confirmedVendorRows.length})
              </h3>
            </div>
            <p className="text-xs text-[#573D4F]">
              Confirmed bookings are automatically included in your Total Wedding Outlay.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {confirmedVendorRows.map((row) => (
              <div
                key={row.vendor.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4"
              >
                <div>
                  <p className="font-editorial text-base font-semibold text-[#231420]">
                    {row.vendor.name}
                  </p>
                  <p className="text-xs text-[#7A5E72]">
                    {row.vendor.category} · Quote:{' '}
                    <strong className="text-[#231420] tabular-nums">
                      {row.quotedAmount > 0 ? formatInr(row.quotedAmount) : row.vendor.estimate || '₹0'}
                    </strong>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#4A2E70] tabular-nums">
                    Paid logged: {formatInr(row.loggedAgainstVendor)} · Remaining:{' '}
                    {formatInr(row.remainingBalance)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => prefillFromConfirmedVendor(row)}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#8E3B6E]/35 bg-[#8E3B6E]/10 px-3 py-1 text-xs font-semibold text-[#8E3B6E] hover:bg-[#8E3B6E]/20 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Log Cash / UPI</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left 5 Columns: Document Any Expense Form */}
        <form
          onSubmit={handleSaveExpense}
          className="space-y-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 lg:col-span-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#8E3B6E]">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                {editingId ? 'Edit Expense Entry' : 'Document New Expense'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-semibold text-[#6B4C8C] underline cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[#573D4F]">
            Record dresses, return gifts, jewellery, shagun, travel, or vendor Cash / UPI
            payments so everything stays documented in one place.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#231420]">
              Expense Title / Item <span className="text-[#ba1a1a]">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={FIELD_LIMITS.expenseTitleMax}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sherwani & Bridal Dresses, 50 Return Gift Hampers"
              className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] focus:border-[#8E3B6E] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#231420]">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420]"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#231420]">
                Amount (₹) <span className="text-[#ba1a1a]">*</span>
              </label>
              <div className="relative mt-1">
                <IndianRupee
                  className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#7A5E72]"
                  aria-hidden="true"
                />
                <input
                  type="number"
                  required
                  min={0}
                  max={FIELD_LIMITS.expenseAmountMax}
                  step="1"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="25000"
                  className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] py-2 pr-3 pl-8 text-sm text-[#231420] tabular-nums focus:border-[#8E3B6E] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#231420]">
                Mode of Payment
              </label>
              <div className="mt-1 mb-1.5 grid grid-cols-2 gap-1.5">
                {(['UPI', 'Cash'] as const).map((quickMode) => (
                  <button
                    key={quickMode}
                    type="button"
                    onClick={() => setPaymentMode(quickMode)}
                    className={`min-h-[34px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      paymentMode === quickMode
                        ? 'bg-[#8E3B6E] text-white'
                        : 'border border-[#e4cde0] bg-[#fdf5f8] text-[#573D4F]'
                    }`}
                  >
                    {quickMode}
                  </button>
                ))}
              </div>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as ExpensePaymentMode)}
                className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420]"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#231420]">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as ExpensePaymentStatus)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420]"
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#231420]">Paid By</label>
              <input
                type="text"
                maxLength={FIELD_LIMITS.expensePaidByMax}
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="e.g., Vijay Saxena"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420]"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {FAMILY_PAYER_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPaidBy(preset)}
                    className="rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-2 py-0.5 text-[10px] font-medium text-[#573D4F] hover:border-[#8E3B6E] cursor-pointer"
                  >
                    {preset.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#231420]">Date</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420] tabular-nums"
              />
            </div>
          </div>

          {confirmedVendorRows.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[#231420]">
                Link to Confirmed Vendor{' '}
                <span className="font-normal text-[#7A5E72]">(Optional)</span>
              </label>
              <select
                value={linkedVendorId}
                onChange={(e) => setLinkedVendorId(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420]"
              >
                <option value="">Direct / Miscellaneous Expense (No Vendor Link)</option>
                {confirmedVendorRows.map((row) => (
                  <option key={row.vendor.id} value={row.vendor.id}>
                    {row.vendor.name} ({row.vendor.estimate || 'Confirmed'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#231420]">
              Receipt / Shop / UPI Reference Notes
            </label>
            <textarea
              rows={2}
              maxLength={FIELD_LIMITS.expenseNotesMax}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Shop name, quantity, UPI transaction ID, bill details..."
              className="mt-1 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420]"
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3.5 py-2 text-xs text-[#93000a]"
            >
              {formError}
            </p>
          )}

          {savedBanner && (
            <p
              role="status"
              className="flex items-center gap-1.5 rounded-xl border border-[#6B4C8C]/30 bg-[#EDE5F8] px-3.5 py-2 text-xs font-medium text-[#4A2E70]"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{savedBanner}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
          >
            {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>
              {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Add to Expense Ledger'}
            </span>
          </button>
        </form>

        {/* Right 7 Columns: Documented Expense List */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#7A5E72]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dresses, gifts, paid by, notes..."
                className="min-h-[42px] w-full rounded-full border border-[#e4cde0] bg-[#f8edf3] py-2 pr-4 pl-10 text-sm text-[#231420] focus:border-[#8E3B6E] focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter expenses by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'All' | ExpenseCategory)}
              className="min-h-[42px] rounded-full border border-[#e4cde0] bg-[#f8edf3] px-4 py-2 text-sm font-medium text-[#231420]"
            >
              <option value="All">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between px-1 text-xs text-[#573D4F]">
            <span>
              Showing <strong>{filteredExpenses.length}</strong> entries
              {modeFilter !== 'All' ? ` (${modeFilter})` : ''}
            </span>
            <span className="font-semibold text-[#231420] tabular-nums">
              Subtotal: {formatInr(filteredSubtotal)}
            </span>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-10 text-center">
              <Receipt className="mx-auto h-6 w-6 text-[#8E3B6E]" aria-hidden="true" />
              <p className="mt-2 font-editorial text-xl font-medium text-[#231420]">
                No Documented Expenses Yet
              </p>
              <p className="mt-1 text-sm text-[#573D4F]">
                Add dresses, return gifts, or Cash/UPI vendor payments using the form on the left.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((item) => {
                const linkedVendor = item.linkedVendorId
                  ? vendors.find((v) => v.id === item.linkedVendorId)
                  : undefined;

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-editorial text-lg font-semibold text-[#231420]">
                            {item.title}
                          </h3>
                          <span className="rounded-full bg-[#EDE5F8] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4A2E70]">
                            {item.paymentMode}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              item.paymentStatus === 'Pending'
                                ? 'bg-[#ffdad6]/70 text-[#93000a]'
                                : 'bg-[#8E3B6E]/12 text-[#8E3B6E]'
                            }`}
                          >
                            {item.paymentStatus}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-[#573D4F]">
                          {item.category}
                          {item.expenseDate ? ` · ${item.expenseDate}` : ''}
                          {item.paidBy ? ` · Paid by ${item.paidBy}` : ''}
                        </p>
                        {linkedVendor && (
                          <p className="mt-0.5 text-[11px] font-medium text-[#6B4C8C]">
                            Linked Vendor: {linkedVendor.name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#231420] tabular-nums">
                          {formatInr(item.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditExpense(item)}
                          aria-label={`Edit ${item.title}`}
                          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#8E3B6E] hover:border-[#8E3B6E] cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(item.id)}
                          aria-label={`Delete ${item.title}`}
                          className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {item.notes && (
                      <p className="mt-2.5 rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-xs text-[#573D4F]">
                        {item.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
