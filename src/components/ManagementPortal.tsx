import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  BellRing,
  Briefcase,
  CalendarPlus,
  CheckCircle2,
  Download,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Minus,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  ExpenseCategory,
  ExpensePaymentMode,
  ExpensePaymentStatus,
  ExpenseRecord,
  FIELD_LIMITS,
  HOST_NOTIFICATION_EMAIL,
  HostNotificationRecord,
  InviteeAvailability,
  InviteeNotifiedVia,
  InviteePrivateRecord,
  MergedInviteeRecord,
  PRIMARY_HOST_EMAILS,
  PublicInviteeRecord,
  RsvpSide,
  VendorCategory,
  VendorRecord,
  VendorStatus,
  WeddingConfig,
  WeddingEventImageKey,
  WeddingEventRecord,
  WishCeremony,
  WishRecord,
} from '../types/wedding';
import { computeRsvpLookupId } from '../lib/rsvpLookup';
import { ExpensesSection } from './ExpensesSection';

interface ManagementPortalProps {
  onBackToInvitation: () => void;
  user: User | null;
  authReady: boolean;
  config: WeddingConfig;
  events: WeddingEventRecord[];
}

type PortalTab =
  | 'invitees'
  | 'events'
  | 'vendors'
  | 'expenses'
  | 'details'
  | 'alerts'
  | 'access';
type AutoNotifyChoice = 'WhatsApp' | 'SMS' | 'Pending';

const PUBLISHED_WEDDING_URL = 'https://saxenas-wedding.ai.studio';

function buildDefaultInviteMessage(guestName?: string): string {
  const clean = guestName?.trim();
  const greeting = clean ? `Hello ${clean},` : 'Hello,';
  return `${greeting} You have been invited to Prakhar & Prakriti's family wedding by the Saxena family. Please do mark your presence and stay tuned: ${PUBLISHED_WEDDING_URL}`;
}

const SIDES: RsvpSide[] = ["Groom's Family", "Bride's Family", 'Close Friends'];

const VENDOR_CATEGORIES: VendorCategory[] = [
  'Decor & Mandap',
  'Catering & Feast',
  'Photography & Cinema',
  'Couture & Styling',
  'Music & Baraat',
  'Hospitality & Stay',
  'Other',
];

const VENDOR_STATUSES: VendorStatus[] = [
  'Confirmed / Booked',
  'In Inquiry / Pending',
  'Signature / Luxury',
];

const CEREMONY_OPTIONS: WishCeremony[] = [
  'Both Celebrations',
  'Morning Haldi',
  'Evening Wedding',
];

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

function normalizeSmsNumber(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = normalizePhoneDigits(trimmed);
  return digits ? `+${digits}` : '';
}

function buildWhatsAppHref(phone: string, message: string): string {
  const digits = normalizePhoneDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function buildSmsHref(phone: string, message: string): string {
  const smsNum = normalizeSmsNumber(phone);
  return `sms:${smsNum}?body=${encodeURIComponent(message)}`;
}

function triggerHrefViaAnchor(href: string, newTab: boolean) {
  const link = document.createElement('a');
  link.href = href;
  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getVendorStatusBadge(status: VendorStatus) {
  if (status === 'Confirmed / Booked') {
    return (
      <span className="inline-flex items-center rounded-full border border-[#6B4C8C]/35 bg-[#EDE5F8] px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase text-[#4A2E70]">
        Confirmed / Booked
      </span>
    );
  }
  if (status === 'Signature / Luxury') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8E3B6E]/35 bg-[#8E3B6E]/12 px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase text-[#8E3B6E]">
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        Signature / Luxury
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#7A5E72]/35 bg-[#f1dfeb] px-3 py-1 text-[11px] font-bold tracking-[0.1em] uppercase text-[#573D4F]">
      In Inquiry / Pending
    </span>
  );
}

function getAvailabilityText(availability: InviteeAvailability) {
  if (availability === 'Will Attend with Family') {
    return <span className="text-xs font-semibold text-[#4A2E70]">Confirmed Attending</span>;
  }
  if (availability === 'Unable to Attend') {
    return <span className="text-xs font-semibold text-[#ba1a1a]">Unable to Attend</span>;
  }
  return <span className="text-xs font-semibold text-[#8E3B6E]">Awaiting Confirmation</span>;
}

export const ManagementPortal: React.FC<ManagementPortalProps> = ({
  onBackToInvitation,
  user,
  authReady,
  config,
  events,
}) => {
  const [activeTab, setActiveTab] = useState<PortalTab>('invitees');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [checkingHost, setCheckingHost] = useState(false);
  const [isAuthorizedHost, setIsAuthorizedHost] = useState(false);
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null);

  // Split invitee collections merged by ID
  const [publicInvitees, setPublicInvitees] = useState<PublicInviteeRecord[]>([]);
  const [privateInvitees, setPrivateInvitees] = useState<Record<string, InviteePrivateRecord>>({});
  const [inviteesLoading, setInviteesLoading] = useState(false);
  const [inviteeSearch, setInviteeSearch] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | InviteeAvailability>('All');

  // Add Invitee Form
  const [newHeadName, setNewHeadName] = useState('');
  const [newSide, setNewSide] = useState<RsvpSide>("Groom's Family");
  const [newTentativeGuests, setNewTentativeGuests] = useState(4);
  const [newPhone, setNewPhone] = useState('');
  const [newNote, setNewNote] = useState('');
  const [autoNotifyChannel, setAutoNotifyChannel] = useState<AutoNotifyChoice>('WhatsApp');
  const [customInviteMessage, setCustomInviteMessage] = useState(() =>
    buildDefaultInviteMessage()
  );
  const [inviteMsgCustomized, setInviteMsgCustomized] = useState(false);
  const [personalizingAi, setPersonalizingAi] = useState(false);
  const [addingInvitee, setAddingInvitee] = useState(false);
  const [inviteeFormError, setInviteeFormError] = useState<string | null>(null);
  const [justAddedInvitee, setJustAddedInvitee] = useState<{
    id: string;
    headOfFamilyName: string;
    phone: string;
    notifiedVia: InviteeNotifiedVia;
    messageSent: string;
  } | null>(null);

  // Flexible Ceremony Events Form
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventChapter, setEventChapter] = useState('Pre-Wedding Celebration');
  const [eventDate, setEventDate] = useState('Monday, February 1, 2027');
  const [eventTime, setEventTime] = useState('7:00 PM Onwards');
  const [eventVenue, setEventVenue] = useState('Grand Ballroom Courtyard');
  const [eventDressCode, setEventDressCode] = useState('Festive Indian Attire');
  const [eventDescription, setEventDescription] = useState('');
  const [eventImageKey, setEventImageKey] = useState<WeddingEventImageKey>('custom');
  const [eventSortOrder, setEventSortOrder] = useState(3);
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Vendors & Expenses
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [vendorFilter, setVendorFilter] = useState<'All' | VendorStatus>('All');
  const [vendorName, setVendorName] = useState('');
  const [vendorCategory, setVendorCategory] = useState<VendorCategory>('Decor & Mandap');
  const [vendorStatus, setVendorStatus] = useState<VendorStatus>('Confirmed / Booked');
  const [vendorCeremony, setVendorCeremony] = useState<WishCeremony>('Both Celebrations');
  const [vendorContact, setVendorContact] = useState('');
  const [vendorEstimate, setVendorEstimate] = useState('');
  const [vendorNotes, setVendorNotes] = useState('');
  const [addingVendor, setAddingVendor] = useState(false);

  // Wishes Moderation & Host Notifications
  const [wishes, setWishes] = useState<WishRecord[]>([]);
  const [wishActionMsg, setWishActionMsg] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<HostNotificationRecord[]>([]);
  const [emailStatus, setEmailStatus] = useState<{
    recipientEmail: string;
    emailConfigured: boolean;
    pushConfigured: boolean;
  } | null>(null);

  // Live Wedding Config
  const [draftConfig, setDraftConfig] = useState<WeddingConfig>(config);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSavedMsg, setConfigSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  useEffect(() => {
    let active = true;
    async function verifyHostAccess() {
      if (!authReady) return;
      if (!user || !user.email) {
        if (active) {
          setIsAuthorizedHost(false);
          setCheckingHost(false);
        }
        return;
      }

      const emailLower = user.email.toLowerCase();
      const allowed =
        user.emailVerified && (PRIMARY_HOST_EMAILS as readonly string[]).includes(emailLower);

      if (allowed) {
        if (active) {
          setDeniedEmail(null);
          setIsAuthorizedHost(true);
          setCheckingHost(false);
        }
        return;
      }

      if (active) {
        setCheckingHost(true);
        setIsAuthorizedHost(false);
        setDeniedEmail(user.email);
      }
      try {
        await signOut(auth);
      } finally {
        if (active) {
          setCheckingHost(false);
        }
      }
    }

    verifyHostAccess();
    return () => {
      active = false;
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !isAuthorizedHost) {
      return;
    }

    setInviteesLoading(true);
    const unsubPublic = onSnapshot(
      query(collection(db, 'publicInvitees'), limit(300)),
      (snapshot) => {
        const list: PublicInviteeRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            headOfFamilyName: String(data.headOfFamilyName ?? ''),
            nameLower: String(data.nameLower ?? ''),
            side: (data.side as RsvpSide) || "Groom's Family",
            availability: (data.availability as InviteeAvailability) || 'Pending',
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort((a, b) => a.headOfFamilyName.localeCompare(b.headOfFamilyName));
        setPublicInvitees(list);
        setInviteesLoading(false);
      },
      (err) => {
        setInviteesLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'publicInvitees');
      }
    );

    const unsubPrivate = onSnapshot(
      collection(db, 'inviteePrivate'),
      (snapshot) => {
        const map: Record<string, InviteePrivateRecord> = {};
        for (const d of snapshot.docs) {
          const data = d.data();
          map[d.id] = {
            id: d.id,
            tentativeGuests: Number(data.tentativeGuests ?? 1),
            phone: String(data.phone ?? ''),
            note: String(data.note ?? ''),
            addedBy: String(data.addedBy ?? ''),
            notifiedVia: (data.notifiedVia as InviteeNotifiedVia) || 'Pending',
            updatedAt: data.updatedAt ?? null,
          };
        }
        setPrivateInvitees(map);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'inviteePrivate');
      }
    );

    const unsubVendors = onSnapshot(
      query(collection(db, 'vendors'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const list: VendorRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name ?? ''),
            category: data.category,
            status: data.status,
            ceremony: data.ceremony,
            contact: String(data.contact ?? ''),
            estimate: String(data.estimate ?? ''),
            notes: String(data.notes ?? ''),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setVendors(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'vendors');
      }
    );

    const unsubWishes = onSnapshot(
      query(collection(db, 'wishes'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        const list: WishRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            guestName: String(data.guestName ?? ''),
            relationship: String(data.relationship ?? ''),
            ceremony: data.ceremony,
            message: String(data.message ?? ''),
            createdAt: data.createdAt ?? null,
          };
        });
        setWishes(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'wishes');
      }
    );

    const unsubNotifications = onSnapshot(
      query(collection(db, 'hostNotifications'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => {
        const list: HostNotificationRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: data.type === 'blessing' ? 'blessing' : 'rsvp',
            actorName: String(data.actorName ?? ''),
            summary: String(data.summary ?? ''),
            recipientEmail: String(data.recipientEmail ?? HOST_NOTIFICATION_EMAIL),
            read: Boolean(data.read),
            createdAt: data.createdAt ?? null,
          };
        });
        setNotifications(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'hostNotifications');
      }
    );

    const unsubExpenses = onSnapshot(
      query(collection(db, 'expenses'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const list: ExpenseRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title ?? ''),
            category: data.category as ExpenseCategory,
            amount: Number(data.amount ?? 0),
            paymentMode: data.paymentMode as ExpensePaymentMode,
            paymentStatus: data.paymentStatus as ExpensePaymentStatus,
            paidBy: String(data.paidBy ?? ''),
            expenseDate: String(data.expenseDate ?? ''),
            notes: String(data.notes ?? ''),
            linkedVendorId: String(data.linkedVendorId ?? ''),
            addedBy: String(data.addedBy ?? ''),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        setExpenses(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'expenses');
      }
    );

    fetch('/api/notify-host/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setEmailStatus(data);
      })
      .catch(() => {});

    return () => {
      unsubPublic();
      unsubPrivate();
      unsubVendors();
      unsubWishes();
      unsubNotifications();
      unsubExpenses();
    };
  }, [authReady, isAuthorizedHost]);

  const mergedInvitees: MergedInviteeRecord[] = useMemo(() => {
    return publicInvitees.map((pub) => {
      const priv = privateInvitees[pub.id];
      return {
        ...pub,
        tentativeGuests: priv?.tentativeGuests ?? 1,
        phone: priv?.phone ?? '',
        note: priv?.note ?? '',
        addedBy: priv?.addedBy ?? '',
        notifiedVia: priv?.notifiedVia ?? 'Pending',
      };
    });
  }, [publicInvitees, privateInvitees]);

  // Ensure existing invitees are indexed in private-lookup rsvpLookup/{phoneHash}
  useEffect(() => {
    if (!authReady || !isAuthorizedHost || mergedInvitees.length === 0) return;

    let cancelled = false;
    async function syncLookupIndex() {
      for (const inv of mergedInvitees) {
        if (cancelled || !inv.phone) continue;
        const lookupId = await computeRsvpLookupId(inv.phone);
        if (!lookupId || cancelled) continue;

        try {
          const lookupRef = doc(db, 'rsvpLookup', lookupId);
          const snap = await getDoc(lookupRef);
          const existingData = snap.exists() ? snap.data() : null;
          if (
            !existingData ||
            existingData.inviteeId !== inv.id ||
            existingData.headOfFamilyName !== inv.headOfFamilyName ||
            existingData.side !== inv.side ||
            existingData.availability !== inv.availability
          ) {
            await setDoc(lookupRef, {
              inviteeId: inv.id,
              headOfFamilyName: inv.headOfFamilyName,
              side: inv.side,
              availability: inv.availability,
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Ignore transient lookup sync error; direct CRUD writes will retry
        }
      }
    }

    void syncLookupIndex();
    return () => {
      cancelled = true;
    };
  }, [authReady, isAuthorizedHost, mergedInvitees]);

  const inviteeMetrics = useMemo(() => {
    let totalFamilies = mergedInvitees.length;
    let totalTentativeGuests = 0;
    let confirmedFamilies = 0;
    let confirmedGuests = 0;
    let pendingFamilies = 0;
    let pendingGuests = 0;
    let declinedFamilies = 0;

    for (const inv of mergedInvitees) {
      totalTentativeGuests += inv.tentativeGuests;
      if (inv.availability === 'Will Attend with Family') {
        confirmedFamilies += 1;
        confirmedGuests += inv.tentativeGuests;
      } else if (inv.availability === 'Unable to Attend') {
        declinedFamilies += 1;
      } else {
        pendingFamilies += 1;
        pendingGuests += inv.tentativeGuests;
      }
    }

    return {
      totalFamilies,
      totalTentativeGuests,
      confirmedFamilies,
      confirmedGuests,
      pendingFamilies,
      pendingGuests,
      declinedFamilies,
    };
  }, [mergedInvitees]);

  const filteredInvitees = useMemo(() => {
    const q = inviteeSearch.trim().toLowerCase();
    return mergedInvitees.filter((inv) => {
      const matchesAvail =
        availabilityFilter === 'All' || inv.availability === availabilityFilter;
      const matchesQuery =
        !q ||
        inv.headOfFamilyName.toLowerCase().includes(q) ||
        inv.side.toLowerCase().includes(q) ||
        inv.phone.toLowerCase().includes(q) ||
        inv.note.toLowerCase().includes(q);
      return matchesAvail && matchesQuery;
    });
  }, [mergedInvitees, availabilityFilter, inviteeSearch]);

  const filteredVendors = useMemo(() => {
    if (vendorFilter === 'All') return vendors;
    return vendors.filter((v) => v.status === vendorFilter);
  }, [vendors, vendorFilter]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setDeniedEmail(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In failed. Please allow popups and try again.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setDeniedEmail(null);
    await signOut(auth);
  };

  const handlePersonalizeInviteAi = async () => {
    setInviteeFormError(null);
    if (!newHeadName.trim()) {
      setInviteeFormError('Enter the Head of Family name first to personalize the welcome note.');
      return;
    }
    setPersonalizingAi(true);
    try {
      const response = await fetch('/api/ai/personalize-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headOfFamilyName: newHeadName.trim(),
          side: newSide,
          note: newNote.trim(),
        }),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok || !data.message) {
        throw new Error(data.error || 'Unable to personalize message right now.');
      }
      setCustomInviteMessage(data.message);
      setInviteMsgCustomized(true);
    } catch (err) {
      setInviteeFormError(
        err instanceof Error ? err.message : 'Unable to personalize message right now.'
      );
    } finally {
      setPersonalizingAi(false);
    }
  };

  const handleAddInvitee = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteeFormError(null);
    const cleanName = newHeadName.trim().slice(0, FIELD_LIMITS.inviteeNameMax);
    const cleanPhone = newPhone.trim().slice(0, FIELD_LIMITS.inviteePhoneMax);
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    const messageToSend =
      customInviteMessage.trim() || buildDefaultInviteMessage(cleanName);

    if (!cleanName || !user?.email) {
      setInviteeFormError('Please enter the Head of Family name.');
      return;
    }
    if (cleanPhone.length < FIELD_LIMITS.inviteePhoneMin || phoneDigits.length < 7) {
      setInviteeFormError('Please enter a valid mobile number (at least 7 digits).');
      return;
    }

    const clampedCount = Math.max(
      FIELD_LIMITS.tentativeGuestsMin,
      Math.min(FIELD_LIMITS.tentativeGuestsMax, Math.round(newTentativeGuests))
    );

    const initialChannel: InviteeNotifiedVia = autoNotifyChannel;

    setAddingInvitee(true);
    const newRef = doc(collection(db, 'publicInvitees'));
    const lookupId = await computeRsvpLookupId(cleanPhone);
    const batch = writeBatch(db);

    batch.set(newRef, {
      headOfFamilyName: cleanName,
      nameLower: cleanName.toLowerCase(),
      side: newSide,
      availability: 'Pending',
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'inviteePrivate', newRef.id), {
      tentativeGuests: clampedCount,
      phone: cleanPhone,
      note: newNote.trim().slice(0, FIELD_LIMITS.inviteeNoteMax),
      addedBy: user.email,
      notifiedVia: initialChannel,
      updatedAt: serverTimestamp(),
    });

    if (lookupId) {
      batch.set(doc(db, 'rsvpLookup', lookupId), {
        inviteeId: newRef.id,
        headOfFamilyName: cleanName,
        side: newSide,
        availability: 'Pending',
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();

      if (autoNotifyChannel === 'WhatsApp') {
        triggerHrefViaAnchor(buildWhatsAppHref(cleanPhone, messageToSend), true);
      } else if (autoNotifyChannel === 'SMS') {
        triggerHrefViaAnchor(buildSmsHref(cleanPhone, messageToSend), false);
      }

      setJustAddedInvitee({
        id: newRef.id,
        headOfFamilyName: cleanName,
        phone: cleanPhone,
        notifiedVia: initialChannel,
        messageSent: messageToSend,
      });
      setNewHeadName('');
      setNewTentativeGuests(4);
      setNewPhone('');
      setNewNote('');
      setInviteMsgCustomized(false);
      setCustomInviteMessage(buildDefaultInviteMessage());
    } catch (err) {
      setInviteeFormError('Could not add family invitee. Please verify the phone number and try again.');
      handleFirestoreError(err, OperationType.WRITE, `publicInvitees/${newRef.id}`);
    } finally {
      setAddingInvitee(false);
    }
  };

  const handleMarkInviteeNotified = async (
    inviteeId: string,
    channel: Exclude<InviteeNotifiedVia, 'Pending'>
  ) => {
    setJustAddedInvitee((prev) =>
      prev && prev.id === inviteeId ? { ...prev, notifiedVia: channel } : prev
    );
    try {
      await updateDoc(doc(db, 'inviteePrivate', inviteeId), {
        notifiedVia: channel,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inviteePrivate/${inviteeId}`);
    }
  };

  const handleUpdateTentativeGuests = async (inv: MergedInviteeRecord, nextCount: number) => {
    const clamped = Math.max(1, Math.min(30, nextCount));
    try {
      await setDoc(doc(db, 'inviteePrivate', inv.id), {
        tentativeGuests: clamped,
        phone: inv.phone,
        note: inv.note,
        addedBy: inv.addedBy || user?.email || '',
        notifiedVia: inv.notifiedVia || 'Pending',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inviteePrivate/${inv.id}`);
    }
  };

  const handleToggleInviteeAvailability = async (
    inv: MergedInviteeRecord,
    nextAvail: InviteeAvailability
  ) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'publicInvitees', inv.id), {
        availability: nextAvail,
        updatedAt: serverTimestamp(),
      });
      if (inv.phone) {
        const lookupId = await computeRsvpLookupId(inv.phone);
        if (lookupId) {
          batch.set(doc(db, 'rsvpLookup', lookupId), {
            inviteeId: inv.id,
            headOfFamilyName: inv.headOfFamilyName,
            side: inv.side,
            availability: nextAvail,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `publicInvitees/${inv.id}`);
    }
  };

  const handleDeleteInvitee = async (id: string) => {
    const targetInv = mergedInvitees.find((item) => item.id === id);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'publicInvitees', id));
    batch.delete(doc(db, 'inviteePrivate', id));
    if (targetInv?.phone) {
      const lookupId = await computeRsvpLookupId(targetInv.phone);
      if (lookupId) {
        batch.delete(doc(db, 'rsvpLookup', lookupId));
      }
    }
    try {
      await batch.commit();
      setJustAddedInvitee((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `publicInvitees/${id}`);
    }
  };

  const handleExportInviteesCsv = () => {
    const header = [
      'Head of Family',
      'Side',
      'Availability Status',
      'Tentative Guests',
      'Phone',
      'Notified Via',
      'Notes',
      'Added By',
    ];
    const rows = mergedInvitees.map((inv) => [
      escapeCsvCell(inv.headOfFamilyName),
      escapeCsvCell(inv.side),
      escapeCsvCell(inv.availability),
      escapeCsvCell(inv.tentativeGuests),
      escapeCsvCell(inv.phone),
      escapeCsvCell(inv.notifiedVia),
      escapeCsvCell(inv.note),
      escapeCsvCell(inv.addedBy),
    ]);

    const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'Prakhar-Prakriti-Family-Invitees.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Flexible Ceremony Events Handlers
  const resetEventForm = () => {
    setEditingEventId(null);
    setEventTitle('');
    setEventChapter('Pre-Wedding Celebration');
    setEventDate(config.weddingDateLabel);
    setEventTime('');
    setEventVenue(config.venueName);
    setEventDressCode('');
    setEventDescription('');
    setEventImageKey('custom');
    setEventSortOrder((events.length > 0 ? events.length : 2) + 1);
    setEventError(null);
  };

  const startEditEvent = (ev: WeddingEventRecord) => {
    setEditingEventId(ev.id);
    setEventTitle(ev.title);
    setEventChapter(ev.chapterLabel);
    setEventDate(ev.dateLabel);
    setEventTime(ev.timeLabel);
    setEventVenue(ev.venue);
    setEventDressCode(ev.dressCode);
    setEventDescription(ev.description);
    setEventImageKey(ev.imageKey);
    setEventSortOrder(ev.sortOrder);
    setEventError(null);
  };

  const handleSeedDefaultEvents = async () => {
    if (events.length > 0) return;
    setSavingEvent(true);
    setEventError(null);
    const batch = writeBatch(db);
    const haldiRef = doc(collection(db, 'weddingEvents'));
    const weddingRef = doc(collection(db, 'weddingEvents'));

    batch.set(haldiRef, {
      title: config.haldiTitle,
      chapterLabel: 'Morning Celebration',
      dateLabel: config.weddingDateLabel,
      timeLabel: config.haldiTime,
      venue: config.haldiVenue,
      dressCode: config.haldiDressCode,
      description: config.haldiDescription,
      imageKey: 'haldi',
      sortOrder: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(weddingRef, {
      title: config.weddingTitle,
      chapterLabel: 'Evening Celebration',
      dateLabel: config.weddingDateLabel,
      timeLabel: config.weddingTime,
      venue: config.weddingVenue,
      dressCode: config.weddingDressCode,
      description: config.weddingDescription,
      imageKey: 'wedding',
      sortOrder: 2,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (err) {
      setEventError('Unable to initialize default ceremonies.');
      handleFirestoreError(err, OperationType.WRITE, 'weddingEvents');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEventError(null);

    const cleanTitle = eventTitle.trim().slice(0, FIELD_LIMITS.eventTitleMax);
    const cleanDate = eventDate.trim().slice(0, FIELD_LIMITS.eventDateMax);
    const cleanTime = eventTime.trim().slice(0, FIELD_LIMITS.eventTimeMax);
    const cleanVenue = eventVenue.trim().slice(0, FIELD_LIMITS.eventVenueMax);

    if (!cleanTitle || !cleanDate || !cleanTime || !cleanVenue) {
      setEventError('Please enter event title, date, timing, and venue.');
      return;
    }

    const clampedOrder = Math.max(0, Math.min(100, Math.round(Number(eventSortOrder) || 1)));
    const payload = {
      title: cleanTitle,
      chapterLabel: eventChapter.trim().slice(0, FIELD_LIMITS.eventChapterMax) || 'Celebration',
      dateLabel: cleanDate,
      timeLabel: cleanTime,
      venue: cleanVenue,
      dressCode: eventDressCode.trim().slice(0, FIELD_LIMITS.eventDressCodeMax),
      description: eventDescription.trim().slice(0, FIELD_LIMITS.eventDescriptionMax),
      imageKey: eventImageKey,
      sortOrder: clampedOrder,
    };

    setSavingEvent(true);
    try {
      if (editingEventId) {
        const existingEvent = events.find((ev) => ev.id === editingEventId);
        await updateDoc(doc(db, 'weddingEvents', editingEventId), {
          ...payload,
          createdAt: existingEvent?.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const batch = writeBatch(db);
        if (events.length === 0) {
          const haldiRef = doc(collection(db, 'weddingEvents'));
          const weddingRef = doc(collection(db, 'weddingEvents'));
          batch.set(haldiRef, {
            title: config.haldiTitle,
            chapterLabel: 'Morning Celebration',
            dateLabel: config.weddingDateLabel,
            timeLabel: config.haldiTime,
            venue: config.haldiVenue,
            dressCode: config.haldiDressCode,
            description: config.haldiDescription,
            imageKey: 'haldi',
            sortOrder: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(weddingRef, {
            title: config.weddingTitle,
            chapterLabel: 'Evening Celebration',
            dateLabel: config.weddingDateLabel,
            timeLabel: config.weddingTime,
            venue: config.weddingVenue,
            dressCode: config.weddingDressCode,
            description: config.weddingDescription,
            imageKey: 'wedding',
            sortOrder: 2,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        const newEventRef = doc(collection(db, 'weddingEvents'));
        batch.set(newEventRef, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      }
      resetEventForm();
    } catch (err) {
      setEventError('Could not save ceremony event. Please check all fields.');
      handleFirestoreError(err, OperationType.WRITE, 'weddingEvents');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'weddingEvents', id));
      if (editingEventId === id) resetEventForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `weddingEvents/${id}`);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = vendorName.trim().slice(0, FIELD_LIMITS.vendorNameMax);
    if (!cleanName) return;

    setAddingVendor(true);
    const vendorRef = doc(collection(db, 'vendors'));
    try {
      await setDoc(vendorRef, {
        name: cleanName,
        category: vendorCategory,
        status: vendorStatus,
        ceremony: vendorCeremony,
        contact: vendorContact.trim().slice(0, FIELD_LIMITS.vendorContactMax),
        estimate: vendorEstimate.trim().slice(0, FIELD_LIMITS.vendorEstimateMax),
        notes: vendorNotes.trim().slice(0, FIELD_LIMITS.vendorNotesMax),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setVendorName('');
      setVendorContact('');
      setVendorEstimate('');
      setVendorNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `vendors/${vendorRef.id}`);
    } finally {
      setAddingVendor(false);
    }
  };

  const handleUpdateVendorStatus = async (vendor: VendorRecord, nextStatus: VendorStatus) => {
    try {
      await updateDoc(doc(db, 'vendors', vendor.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `vendors/${vendor.id}`);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vendors', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `vendors/${id}`);
    }
  };

  const handleDeleteWish = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'wishes', id));
      setWishActionMsg('Blessing deleted from the live feed.');
      window.setTimeout(() => setWishActionMsg(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `wishes/${id}`);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'hostNotifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `hostNotifications/${id}`);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    for (const item of unread.slice(0, 100)) {
      batch.update(doc(db, 'hostNotifications', item.id), { read: true });
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'hostNotifications');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'hostNotifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `hostNotifications/${id}`);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    setSavingConfig(true);
    setConfigSavedMsg(null);
    try {
      await setDoc(doc(db, 'weddingConfig', 'main'), {
        groomName: draftConfig.groomName.trim().slice(0, 80),
        brideName: draftConfig.brideName.trim().slice(0, 80),
        hostsName: draftConfig.hostsName.trim().slice(0, 120),
        weddingDateLabel: draftConfig.weddingDateLabel.trim().slice(0, 80),
        weddingIsoTarget: draftConfig.weddingIsoTarget.trim().slice(0, 40),
        venueName: draftConfig.venueName.trim().slice(0, 140),
        venueAddress: draftConfig.venueAddress.trim().slice(0, 240),
        venueCity: draftConfig.venueCity.trim().slice(0, 100),
        invitationMessage: draftConfig.invitationMessage.trim().slice(0, 500),
        haldiTitle: draftConfig.haldiTitle.trim().slice(0, 100),
        haldiTime: draftConfig.haldiTime.trim().slice(0, 80),
        haldiVenue: draftConfig.haldiVenue.trim().slice(0, 140),
        haldiDressCode: draftConfig.haldiDressCode.trim().slice(0, 140),
        haldiDescription: draftConfig.haldiDescription.trim().slice(0, 400),
        weddingTitle: draftConfig.weddingTitle.trim().slice(0, 100),
        weddingTime: draftConfig.weddingTime.trim().slice(0, 80),
        weddingVenue: draftConfig.weddingVenue.trim().slice(0, 140),
        weddingDressCode: draftConfig.weddingDressCode.trim().slice(0, 140),
        weddingDescription: draftConfig.weddingDescription.trim().slice(0, 400),
        googleMapsUrl: (draftConfig.googleMapsUrl || '')
          .trim()
          .slice(0, FIELD_LIMITS.googleMapsUrlMax),
        updatedAt: serverTimestamp(),
        updatedBy: user.email,
      });
      setConfigSavedMsg('Venue, Google Maps link, and couple details updated live.');
      window.setTimeout(() => setConfigSavedMsg(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'weddingConfig/main');
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <section className="py-8 sm:py-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        {/* Top Portal Header */}
        <div className="flex flex-col justify-between gap-4 border-b border-[#efe0ea] pb-6 sm:flex-row sm:items-center">
          <div>
            <button
              type="button"
              onClick={onBackToInvitation}
              className="inline-flex min-h-[40px] items-center gap-2 text-sm font-semibold text-[#8E3B6E] transition-colors hover:text-[#231420] cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Back to Wedding Invitation</span>
            </button>
            <p className="label-caps mt-2 text-[#6B4C8C]">Saxena Family Concierge</p>
            <h1 className="editorial-section-title mt-1 font-semibold text-[#231420]">
              Admin
            </h1>
          </div>

          {user && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-[#573D4F]">
                Signed in as <strong className="text-[#231420]">{user.email}</strong>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#e4cde0] bg-[#f8edf3] px-4 py-1.5 text-xs font-semibold text-[#573D4F] hover:bg-[#efe0ea] cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Auth Gate or Full Portal */}
        {!authReady || checkingHost ? (
          <div className="py-16 text-center text-sm text-[#573D4F]">
            Verifying family host access...
          </div>
        ) : !user ? (
          <div className="mx-auto mt-10 max-w-xl">
            <div className="double-filigree-card rounded-3xl p-7 text-center sm:p-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-[#8E3B6E]">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="label-caps mt-4 text-[#8E3B6E]">Restricted Access</p>
              <h2 className="mt-2 font-editorial text-2xl font-semibold text-[#231420] sm:text-3xl">
                Admin Authorization
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-[#573D4F] sm:text-[15px]">
                This area is restricted to authorized Saxena family hosts. Please authorize with
                your Google account to continue.
              </p>

              {deniedEmail && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-[#ba1a1a]/35 bg-[#ffdad6]/60 px-4 py-3 text-xs font-medium text-[#93000a]"
                >
                  You are not authorized to log in ({deniedEmail}).
                </p>
              )}

              {authError && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-4 py-3 text-xs text-[#93000a]"
                >
                  {authError}
                </p>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="mt-7 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-7 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
              >
                <span>{signingIn ? 'Authorizing...' : 'Authorize with Google'}</span>
              </button>
            </div>
          </div>
        ) : !isAuthorizedHost ? (
          <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-[#ba1a1a]/35 bg-[#f8edf3] p-8 text-center">
            <p className="label-caps text-[#ba1a1a]">Not Authorized</p>
            <h2 className="mt-2 font-editorial text-2xl font-semibold text-[#231420]">
              You Are Not Authorized to Log In
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#573D4F]">
              The account <strong>{user.email}</strong> is not authorized to access Admin. Please
              sign out or try an authorized account.
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-6 inline-flex min-h-[40px] items-center justify-center rounded-full border border-[#8E3B6E]/45 bg-[#8E3B6E]/10 px-6 py-2 text-sm font-semibold text-[#231420] hover:bg-[#8E3B6E]/20 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {/* Portal Sub-Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('invitees')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'invitees'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Invitees ({inviteeMetrics.totalFamilies})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('events')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'events'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Ceremony Events ({events.length || 2})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('vendors')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'vendors'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Vendors ({vendors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('expenses')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'expenses'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Expense Tracking ({expenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'details'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Venue &amp; Details
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('alerts')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'alerts'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Alerts ({notifications.filter((n) => !n.read).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('access')}
                  className={`min-h-[40px] rounded-full px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer sm:text-sm ${
                    activeTab === 'access'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F] hover:text-[#231420]'
                  }`}
                >
                  Blessings &amp; Access ({wishes.length})
                </button>
              </div>

              {activeTab === 'invitees' && (
                <button
                  type="button"
                  onClick={handleExportInviteesCsv}
                  disabled={mergedInvitees.length === 0}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#6B4C8C]/40 bg-[#EDE5F8] px-4 py-2 text-xs font-semibold text-[#4A2E70] transition-colors hover:bg-[#e1d5f4] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Export CSV</span>
                </button>
              )}
            </div>

            {/* TAB 1: FAMILY INVITEES, MANDATORY PHONE & AUTO NOTIFICATION */}
            {activeTab === 'invitees' && (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5">
                    <p className="label-caps text-[#8E3B6E]">Total Tentative</p>
                    <p className="mt-1.5 text-3xl font-bold text-[#231420] tabular-nums">
                      {inviteeMetrics.totalTentativeGuests}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7A5E72]">
                      guests across {inviteeMetrics.totalFamilies} families
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5">
                    <p className="label-caps text-[#6B4C8C]">Confirmed Coming</p>
                    <p className="mt-1.5 text-3xl font-bold text-[#231420] tabular-nums">
                      {inviteeMetrics.confirmedGuests}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7A5E72]">
                      guests ({inviteeMetrics.confirmedFamilies} families)
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5">
                    <p className="label-caps text-[#8E3B6E]">Awaiting Reply</p>
                    <p className="mt-1.5 text-3xl font-bold text-[#231420] tabular-nums">
                      {inviteeMetrics.pendingGuests}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7A5E72]">
                      tentative ({inviteeMetrics.pendingFamilies} families)
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5">
                    <p className="label-caps text-[#573D4F]">Unable to Attend</p>
                    <p className="mt-1.5 text-3xl font-bold text-[#231420] tabular-nums">
                      {inviteeMetrics.declinedFamilies}
                    </p>
                    <p className="mt-0.5 text-xs text-[#7A5E72]">families</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
                  {/* Add Family Invitee Form */}
                  <form
                    onSubmit={handleAddInvitee}
                    className="space-y-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 lg:col-span-5"
                  >
                    <div className="flex items-center gap-2 text-[#8E3B6E]">
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                        Add Invited Family
                      </h2>
                    </div>
                    <p className="text-xs leading-relaxed text-[#573D4F]">
                      Adding a family saves their name for homepage search and triggers your
                      welcome notice via free WhatsApp or your mobile SIM SMS at ₹0 cost.
                    </p>

                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Head of Family Name <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={FIELD_LIMITS.inviteeNameMax}
                        value={newHeadName}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          setNewHeadName(nextVal);
                          if (!inviteMsgCustomized) {
                            setCustomInviteMessage(buildDefaultInviteMessage(nextVal));
                          }
                        }}
                        placeholder="e.g., Shri Rajesh Sharma & Family"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] focus:border-[#8E3B6E] focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-[#231420]">Side</label>
                        <select
                          value={newSide}
                          onChange={(e) => setNewSide(e.target.value as RsvpSide)}
                          className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm text-[#231420]"
                        >
                          {SIDES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#231420]">
                          Tentative Guests (Private)
                        </label>
                        <div className="mt-1 inline-flex min-h-[42px] w-full items-center justify-between rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-2">
                          <button
                            type="button"
                            onClick={() => setNewTentativeGuests((n) => Math.max(1, n - 1))}
                            aria-label="Decrease tentative guests"
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#efe0ea] cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-sm font-semibold tabular-nums">
                            {newTentativeGuests}
                          </span>
                          <button
                            type="button"
                            onClick={() => setNewTentativeGuests((n) => Math.min(30, n + 1))}
                            aria-label="Increase tentative guests"
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#efe0ea] cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Mobile Number <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        minLength={FIELD_LIMITS.inviteePhoneMin}
                        maxLength={FIELD_LIMITS.inviteePhoneMax}
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+91 98XXX XXXXX"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] tabular-nums focus:border-[#8E3B6E] focus:outline-none"
                      />
                    </div>

                    {/* Auto-Notification Trigger Selector */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[#231420]">
                          <BellRing className="h-3.5 w-3.5 text-[#8E3B6E]" aria-hidden="true" />
                          <span>Welcome Notification Trigger (Free)</span>
                        </label>
                        <button
                          type="button"
                          onClick={handlePersonalizeInviteAi}
                          disabled={personalizingAi || addingInvitee}
                          className="inline-flex min-h-[26px] items-center gap-1 rounded-full border border-[#8E3B6E]/35 bg-[#fdf5f8] px-2.5 py-0.5 text-[11px] font-semibold text-[#8E3B6E] hover:bg-[#efe0ea] disabled:opacity-60 cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          <span>{personalizingAi ? 'Drafting...' : 'Personalize with AI'}</span>
                        </button>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'WhatsApp', label: 'Auto WhatsApp' },
                            { id: 'SMS', label: 'Auto SMS' },
                            { id: 'Pending', label: 'Notify Later' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAutoNotifyChannel(opt.id)}
                            className={`min-h-[36px] rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                              autoNotifyChannel === opt.id
                                ? 'bg-[#6B4C8C] text-white'
                                : 'border border-[#e4cde0] bg-[#fdf5f8] text-[#573D4F]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={3}
                        maxLength={320}
                        value={customInviteMessage}
                        onChange={(e) => {
                          setCustomInviteMessage(e.target.value);
                          setInviteMsgCustomized(true);
                        }}
                        aria-label="Welcome notification message"
                        className="mt-2 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-1.5 text-[11px] leading-relaxed text-[#573D4F] focus:border-[#8E3B6E] focus:outline-none"
                      />
                      {inviteMsgCustomized && (
                        <button
                          type="button"
                          onClick={() => {
                            setInviteMsgCustomized(false);
                            setCustomInviteMessage(buildDefaultInviteMessage(newHeadName));
                          }}
                          className="mt-1 text-[11px] font-semibold text-[#6B4C8C] underline cursor-pointer"
                        >
                          Reset to standard message
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Private Note <span className="font-normal text-[#7A5E72]">(Optional)</span>
                      </label>
                      <textarea
                        rows={2}
                        maxLength={FIELD_LIMITS.inviteeNoteMax}
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Relation, room booking, arrival city..."
                        className="mt-1 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] focus:border-[#8E3B6E] focus:outline-none"
                      />
                    </div>

                    {inviteeFormError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3.5 py-2.5 text-xs text-[#93000a]"
                      >
                        {inviteeFormError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={addingInvitee}
                      className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {addingInvitee
                          ? 'Saving & Triggering...'
                          : autoNotifyChannel === 'Pending'
                            ? 'Add Invitee'
                            : `Add Invitee & Send ${autoNotifyChannel}`}
                      </span>
                    </button>

                    {justAddedInvitee && (
                      <div className="space-y-3 rounded-2xl border border-[#6B4C8C]/35 bg-[#EDE5F8]/75 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 text-[#4A2E70]">
                            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <p className="text-xs font-bold uppercase tracking-wider">
                              Saved · {justAddedInvitee.headOfFamilyName}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setJustAddedInvitee(null)}
                            aria-label="Dismiss notification prompt"
                            className="rounded-full p-1 text-[#573D4F] hover:bg-white/60 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <p className="rounded-xl border border-[#e4cde0] bg-white/85 p-3 text-xs leading-relaxed text-[#231420]">
                          &ldquo;{justAddedInvitee.messageSent}&rdquo;
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={buildWhatsAppHref(
                              justAddedInvitee.phone,
                              justAddedInvitee.messageSent
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              handleMarkInviteeNotified(justAddedInvitee.id, 'WhatsApp')
                            }
                            className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#8E3B6E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#742D59]"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {justAddedInvitee.notifiedVia === 'WhatsApp'
                                ? 'WhatsApp Triggered ✓'
                                : 'Send WhatsApp'}
                            </span>
                          </a>

                          <a
                            href={buildSmsHref(
                              justAddedInvitee.phone,
                              justAddedInvitee.messageSent
                            )}
                            onClick={() => handleMarkInviteeNotified(justAddedInvitee.id, 'SMS')}
                            className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border border-[#6B4C8C]/40 bg-white px-3 py-1.5 text-xs font-semibold text-[#4A2E70] hover:bg-[#fdf5f8]"
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {justAddedInvitee.notifiedVia === 'SMS'
                                ? 'SMS Triggered ✓'
                                : 'Send SMS'}
                            </span>
                          </a>
                        </div>
                      </div>
                    )}
                  </form>

                  {/* Invitee List */}
                  <div className="space-y-4 lg:col-span-7">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <Search
                          className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#7A5E72]"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={inviteeSearch}
                          onChange={(e) => setInviteeSearch(e.target.value)}
                          placeholder="Search families, phone, or notes..."
                          className="min-h-[42px] w-full rounded-full border border-[#e4cde0] bg-[#f8edf3] py-2 pr-4 pl-10 text-sm text-[#231420] focus:border-[#8E3B6E] focus:outline-none"
                        />
                      </div>
                      <select
                        aria-label="Filter invitees by confirmation"
                        value={availabilityFilter}
                        onChange={(e) =>
                          setAvailabilityFilter(e.target.value as 'All' | InviteeAvailability)
                        }
                        className="min-h-[42px] rounded-full border border-[#e4cde0] bg-[#f8edf3] px-4 py-2 text-sm font-medium text-[#231420]"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Will Attend with Family">Confirmed Attending</option>
                        <option value="Pending">Awaiting Confirmation</option>
                        <option value="Unable to Attend">Unable to Attend</option>
                      </select>
                    </div>

                    {inviteesLoading ? (
                      <div className="py-8 text-center text-sm text-[#573D4F]">
                        Loading family invitee list...
                      </div>
                    ) : filteredInvitees.length === 0 ? (
                      <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-10 text-center">
                        <Users className="mx-auto h-6 w-6 text-[#8E3B6E]" aria-hidden="true" />
                        <p className="mt-2 font-editorial text-xl font-medium text-[#231420]">
                          Start Your Family Invite List
                        </p>
                        <p className="mt-1 text-sm text-[#573D4F]">
                          Add each Head of Family, their mobile number, and tentative guest count.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredInvitees.map((inv) => (
                          <div
                            key={inv.id}
                            className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="font-editorial text-xl font-semibold text-[#231420]">
                                  {inv.headOfFamilyName}
                                </h3>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#573D4F]">
                                  <span className="font-semibold">{inv.side}</span>
                                  <span aria-hidden="true">·</span>
                                  {getAvailabilityText(inv.availability)}
                                  {inv.phone && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="inline-flex items-center gap-1 tabular-nums">
                                        <Phone className="h-3 w-3 text-[#8E3B6E]" aria-hidden="true" />
                                        {inv.phone}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="inline-flex items-center gap-1 rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateTentativeGuests(inv, inv.tentativeGuests - 1)
                                    }
                                    aria-label="Decrease tentative count"
                                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#efe0ea] cursor-pointer"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="px-1.5 text-xs font-bold text-[#231420] tabular-nums">
                                    {inv.tentativeGuests} est.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateTentativeGuests(inv, inv.tentativeGuests + 1)
                                    }
                                    aria-label="Increase tentative count"
                                    className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#efe0ea] cursor-pointer"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteInvitee(inv.id)}
                                  aria-label={`Remove ${inv.headOfFamilyName}`}
                                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  aria-label={`Availability status for ${inv.headOfFamilyName}`}
                                  value={inv.availability}
                                  onChange={(e) =>
                                    handleToggleInviteeAvailability(
                                      inv,
                                      e.target.value as InviteeAvailability
                                    )
                                  }
                                  className="min-h-[36px] rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-3 py-1 text-xs font-semibold text-[#231420]"
                                >
                                  <option value="Pending">Awaiting Confirmation</option>
                                  <option value="Will Attend with Family">
                                    Confirmed — Will Attend
                                  </option>
                                  <option value="Unable to Attend">Unable to Attend</option>
                                </select>
                                {inv.notifiedVia !== 'Pending' ? (
                                  <span className="rounded-full bg-[#EDE5F8] px-2.5 py-1 text-[11px] font-semibold text-[#4A2E70]">
                                    Notified via {inv.notifiedVia}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-[#fdf5f8] px-2.5 py-1 text-[11px] font-medium text-[#7A5E72]">
                                    Notified: Pending
                                  </span>
                                )}
                              </div>

                              {inv.phone && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <a
                                    href={buildWhatsAppHref(
                                      inv.phone,
                                      buildDefaultInviteMessage(inv.headOfFamilyName)
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => handleMarkInviteeNotified(inv.id, 'WhatsApp')}
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#8E3B6E]/35 bg-[#8E3B6E]/10 px-3 py-1 text-xs font-semibold text-[#8E3B6E] hover:bg-[#8E3B6E]/20"
                                  >
                                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>WhatsApp</span>
                                  </a>
                                  <a
                                    href={buildSmsHref(
                                      inv.phone,
                                      buildDefaultInviteMessage(inv.headOfFamilyName)
                                    )}
                                    onClick={() => handleMarkInviteeNotified(inv.id, 'SMS')}
                                    className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#6B4C8C]/35 bg-[#EDE5F8]/70 px-3 py-1 text-xs font-semibold text-[#4A2E70] hover:bg-[#EDE5F8]"
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>SMS</span>
                                  </a>
                                </div>
                              )}
                            </div>

                            {inv.addedBy && (
                              <p className="mt-2 text-[11px] text-[#7A5E72]">
                                Added by {inv.addedBy}
                              </p>
                            )}

                            {inv.note && (
                              <p className="mt-2.5 rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-xs text-[#573D4F]">
                                <strong className="text-[#231420]">Note:</strong> {inv.note}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: FLEXIBLE CEREMONY EVENTS MANAGER */}
            {activeTab === 'events' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
                <form
                  onSubmit={handleSaveEvent}
                  className="space-y-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 lg:col-span-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#8E3B6E]">
                      <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                      <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                        {editingEventId ? 'Edit Ceremony Event' : 'Add Ceremony Event'}
                      </h2>
                    </div>
                    {editingEventId && (
                      <button
                        type="button"
                        onClick={resetEventForm}
                        className="text-xs font-semibold text-[#6B4C8C] underline cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-[#573D4F]">
                    Add extra celebrations such as Mehendi, Sangeet, Engagement, or Reception.
                    They appear immediately in the homepage schedule.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Event Title <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={FIELD_LIMITS.eventTitleMax}
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g., Sangeet & Mehendi Evening"
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Occasion Label
                      </label>
                      <input
                        type="text"
                        maxLength={FIELD_LIMITS.eventChapterMax}
                        value={eventChapter}
                        onChange={(e) => setEventChapter(e.target.value)}
                        placeholder="e.g., Musical Evening"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Display Order
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={eventSortOrder}
                        onChange={(e) => setEventSortOrder(Number(e.target.value))}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Date <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={FIELD_LIMITS.eventDateMax}
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        placeholder="Monday, February 1, 2027"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Timing <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={FIELD_LIMITS.eventTimeMax}
                        value={eventTime}
                        onChange={(e) => setEventTime(e.target.value)}
                        placeholder="7:00 PM Onwards"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Venue Area <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={FIELD_LIMITS.eventVenueMax}
                        value={eventVenue}
                        onChange={(e) => setEventVenue(e.target.value)}
                        placeholder="e.g., Poolside Lawn"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Card Style
                      </label>
                      <select
                        value={eventImageKey}
                        onChange={(e) => setEventImageKey(e.target.value as WeddingEventImageKey)}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm"
                      >
                        <option value="custom">Rose Filigree Card</option>
                        <option value="haldi">Haldi Artwork</option>
                        <option value="wedding">Evening Mandap Artwork</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Attire / Dress Code
                    </label>
                    <input
                      type="text"
                      maxLength={FIELD_LIMITS.eventDressCodeMax}
                      value={eventDressCode}
                      onChange={(e) => setEventDressCode(e.target.value)}
                      placeholder="e.g., Indo-Western & Festive Jewel Tones"
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      maxLength={FIELD_LIMITS.eventDescriptionMax}
                      value={eventDescription}
                      onChange={(e) => setEventDescription(e.target.value)}
                      placeholder="Brief ceremonial description for guests..."
                      className="mt-1 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>

                  {eventError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3.5 py-2 text-xs text-[#93000a]"
                    >
                      {eventError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {savingEvent
                        ? 'Saving Event...'
                        : editingEventId
                          ? 'Update Ceremony Event'
                          : 'Add Event to Schedule'}
                    </span>
                  </button>
                </form>

                {/* Current Schedule Events List */}
                <div className="space-y-4 lg:col-span-7">
                  {events.length === 0 ? (
                    <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-8 space-y-4">
                      <div>
                        <p className="font-editorial text-xl font-semibold text-[#231420]">
                          Default Ceremonies Active (Haldi &amp; Wedding)
                        </p>
                        <p className="mt-1 text-sm text-[#573D4F]">
                          Right now your homepage displays Morning Haldi and Evening Wedding from
                          Venue &amp; Details. Add any extra event on the left (like Mehendi or
                          Sangeet), or click below to customize Haldi and Wedding individually.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSeedDefaultEvents}
                        disabled={savingEvent}
                        className="inline-flex min-h-[38px] items-center gap-2 rounded-full border border-[#6B4C8C]/40 bg-[#EDE5F8] px-4 py-1.5 text-xs font-semibold text-[#4A2E70] hover:bg-[#e1d5f4] cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Enable Individual Editing for Haldi &amp; Wedding</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {events.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="label-caps text-[#8E3B6E]">
                                Order #{ev.sortOrder} · {ev.chapterLabel}
                              </p>
                              <h3 className="mt-1 font-editorial text-xl font-semibold text-[#231420]">
                                {ev.title}
                              </h3>
                              <p className="mt-1 text-xs font-medium text-[#573D4F]">
                                {ev.dateLabel} · {ev.timeLabel} · {ev.venue}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditEvent(ev)}
                                aria-label={`Edit ${ev.title}`}
                                className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-3 py-1 text-xs font-semibold text-[#231420] hover:border-[#8E3B6E] cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5 text-[#8E3B6E]" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(ev.id)}
                                aria-label={`Delete ${ev.title}`}
                                className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {ev.dressCode && (
                            <p className="mt-2 text-xs text-[#6B4C8C]">
                              <strong>Attire:</strong> {ev.dressCode}
                            </p>
                          )}
                          {ev.description && (
                            <p className="mt-2 text-xs leading-relaxed text-[#573D4F]">
                              {ev.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: VENDORS & ATELIERS */}
            {activeTab === 'vendors' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
                <form
                  onSubmit={handleAddVendor}
                  className="space-y-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 lg:col-span-5"
                >
                  <div className="flex items-center gap-2 text-[#8E3B6E]">
                    <Briefcase className="h-4 w-4" aria-hidden="true" />
                    <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                      Add Vendor or Atelier
                    </h2>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Vendor / Atelier Name <span className="text-[#ba1a1a]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={FIELD_LIMITS.vendorNameMax}
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="e.g., Gulmohar Floral Mandap Atelier"
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm focus:border-[#8E3B6E] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">Category</label>
                      <select
                        value={vendorCategory}
                        onChange={(e) => setVendorCategory(e.target.value as VendorCategory)}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm"
                      >
                        {VENDOR_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">Status</label>
                      <select
                        value={vendorStatus}
                        onChange={(e) => setVendorStatus(e.target.value as VendorStatus)}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm"
                      >
                        {VENDOR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">Ceremony</label>
                      <select
                        value={vendorCeremony}
                        onChange={(e) => setVendorCeremony(e.target.value as WishCeremony)}
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-sm"
                      >
                        {CEREMONY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#231420]">
                        Estimate / Quote
                      </label>
                      <input
                        type="text"
                        maxLength={FIELD_LIMITS.vendorEstimateMax}
                        value={vendorEstimate}
                        onChange={(e) => setVendorEstimate(e.target.value)}
                        placeholder="e.g., ₹2,50,000"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Contact Person / Phone
                    </label>
                    <input
                      type="text"
                      maxLength={FIELD_LIMITS.vendorContactMax}
                      value={vendorContact}
                      onChange={(e) => setVendorContact(e.target.value)}
                      placeholder="e.g., Aarav Mehta · +91 98XXX XXXXX"
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Concierge Notes
                    </label>
                    <textarea
                      rows={3}
                      maxLength={FIELD_LIMITS.vendorNotesMax}
                      value={vendorNotes}
                      onChange={(e) => setVendorNotes(e.target.value)}
                      placeholder="Setup timings, floral palette..."
                      className="mt-1 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={addingVendor}
                    className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-5 py-2 text-sm font-semibold text-white hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{addingVendor ? 'Saving Vendor...' : 'Add to Vendor Directory'}</span>
                  </button>
                </form>

                <div className="space-y-4 lg:col-span-7">
                  <div className="flex flex-wrap gap-2">
                    {(['All', ...VENDOR_STATUSES] as const).map((statusOpt) => {
                      const active = vendorFilter === statusOpt;
                      return (
                        <button
                          key={statusOpt}
                          type="button"
                          onClick={() => setVendorFilter(statusOpt)}
                          className={`min-h-[38px] rounded-full px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-[#6B4C8C] text-white'
                              : 'border border-[#e4cde0] bg-[#f8edf3] text-[#573D4F]'
                          }`}
                        >
                          {statusOpt}
                        </button>
                      );
                    })}
                  </div>

                  {filteredVendors.length === 0 ? (
                    <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-10 text-center">
                      <p className="font-editorial text-xl font-medium text-[#231420]">
                        Your Private Vendor Concierge
                      </p>
                      <p className="mt-2 text-sm text-[#573D4F]">
                        Add florists, caterers, photographers, and ateliers on the left.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredVendors.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <h3 className="font-editorial text-xl font-semibold text-[#231420]">
                                  {v.name}
                                </h3>
                                {getVendorStatusBadge(v.status)}
                              </div>
                              <p className="mt-1 text-xs font-medium text-[#8E3B6E]">
                                {v.category} · {v.ceremony}
                                {v.estimate ? ` · ${v.estimate}` : ''}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <select
                                aria-label={`Change status for ${v.name}`}
                                value={v.status}
                                onChange={(e) =>
                                  handleUpdateVendorStatus(v, e.target.value as VendorStatus)
                                }
                                className="min-h-[38px] rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-3 py-1.5 text-xs font-semibold text-[#231420]"
                              >
                                {VENDOR_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteVendor(v.id)}
                                aria-label={`Delete vendor ${v.name}`}
                                className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {v.contact && (
                            <p className="mt-2.5 text-xs font-medium text-[#573D4F]">
                              Contact: {v.contact}
                            </p>
                          )}
                          {v.notes && (
                            <p className="mt-2 rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3 py-2 text-xs leading-relaxed text-[#573D4F]">
                              {v.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: EXPENSE CALCULATION & PAYMENT LEDGER */}
            {activeTab === 'expenses' && (
              <ExpensesSection
                expenses={expenses}
                vendors={vendors}
                userEmail={user?.email || ''}
              />
            )}

            {/* TAB 5: LIVE VENUE, GOOGLE MAPS & COUPLE DETAILS EDITOR */}
            {activeTab === 'details' && (
              <form
                onSubmit={handleSaveConfig}
                className="space-y-6 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 sm:p-8"
              >
                <div className="rounded-2xl border border-[#8E3B6E]/30 bg-[#fdf5f8] p-4">
                  <div className="flex items-center gap-2 text-[#8E3B6E]">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    <label className="text-xs font-bold uppercase tracking-wider text-[#231420]">
                      Google Maps Venue Link
                    </label>
                  </div>
                  <input
                    type="url"
                    maxLength={FIELD_LIMITS.googleMapsUrlMax}
                    value={draftConfig.googleMapsUrl || ''}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, googleMapsUrl: e.target.value })
                    }
                    placeholder="https://www.google.com/maps/place/Lav+Kush+Vatika/..."
                    className="mt-2 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white px-3.5 py-2 text-sm text-[#231420]"
                  />
                  <p className="mt-1 text-[11px] text-[#7A5E72]">
                    Guests tapping the venue or &ldquo;Open in Google Maps&rdquo; on the invitation
                    are redirected straight to this location.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">Groom Name</label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={draftConfig.groomName}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, groomName: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">Bride Name</label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={draftConfig.brideName}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, brideName: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Hosted By (Parents)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={draftConfig.hostsName}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, hostsName: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Wedding Date Display Label
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={draftConfig.weddingDateLabel}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingDateLabel: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">Venue Name</label>
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={draftConfig.venueName}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, venueName: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">Venue City</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={draftConfig.venueCity}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, venueCity: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Venue Street Address
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={240}
                      value={draftConfig.venueAddress}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, venueAddress: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#231420]">
                      Countdown ISO Timestamp
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={draftConfig.weddingIsoTarget}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingIsoTarget: e.target.value })
                      }
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#231420]">
                    Invitation Message
                  </label>
                  <textarea
                    rows={2}
                    required
                    maxLength={500}
                    value={draftConfig.invitationMessage}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, invitationMessage: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-[#efe0ea] pt-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
                    <p className="label-caps text-[#8E3B6E]">Default Morning Ceremony</p>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={draftConfig.haldiTitle}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, haldiTitle: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={draftConfig.haldiTime}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, haldiTime: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={draftConfig.haldiVenue}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, haldiVenue: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={draftConfig.haldiDressCode}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, haldiDressCode: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <textarea
                      rows={2}
                      required
                      maxLength={400}
                      value={draftConfig.haldiDescription}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, haldiDescription: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4">
                    <p className="label-caps text-[#6B4C8C]">Default Evening Ceremony</p>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={draftConfig.weddingTitle}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingTitle: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={draftConfig.weddingTime}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingTime: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={draftConfig.weddingVenue}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingVenue: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={draftConfig.weddingDressCode}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingDressCode: e.target.value })
                      }
                      className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                    <textarea
                      rows={2}
                      required
                      maxLength={400}
                      value={draftConfig.weddingDescription}
                      onChange={(e) =>
                        setDraftConfig({ ...draftConfig, weddingDescription: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#e4cde0] bg-white/70 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {configSavedMsg && (
                  <p
                    role="status"
                    className="rounded-xl border border-[#6B4C8C]/30 bg-[#EDE5F8] px-4 py-2.5 text-sm font-medium text-[#4A2E70]"
                  >
                    {configSavedMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full bg-[#8E3B6E] px-6 py-2 text-sm font-semibold text-white hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span>{savingConfig ? 'Publishing Live...' : 'Save & Publish Live'}</span>
                </button>
              </form>
            )}

            {/* TAB 5: REAL-TIME ACTIVITY ALERTS & EMAIL NOTIFICATIONS */}
            {activeTab === 'alerts' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6">
                  <div>
                    <div className="flex items-center gap-2 text-[#8E3B6E]">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                      <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                        Instant RSVP &amp; Blessing Notifications
                      </h2>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#573D4F]">
                      Triggered automatically whenever a guest posts a blessing or updates their
                      family RSVP. Target recipient:{' '}
                      <strong>
                        {emailStatus?.recipientEmail || HOST_NOTIFICATION_EMAIL}
                      </strong>
                      .
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-[#4A2E70]">
                      {emailStatus?.emailConfigured
                        ? 'Email dispatch status: Active (automatic email alerts enabled).'
                        : 'Live Admin Alerts: Active. To also receive Gmail inbox emails automatically, add GMAIL_APP_PASSWORD in AI Studio Settings > Secrets.'}
                    </p>
                  </div>

                  {notifications.some((n) => !n.read) && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotificationsRead}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#6B4C8C]/40 bg-[#EDE5F8] px-4 py-1.5 text-xs font-semibold text-[#4A2E70] hover:bg-[#e1d5f4] cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Mark All Read</span>
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-10 text-center">
                    <BellRing className="mx-auto h-6 w-6 text-[#8E3B6E]" aria-hidden="true" />
                    <p className="mt-2 font-editorial text-xl font-medium text-[#231420]">
                      No Alerts Yet
                    </p>
                    <p className="mt-1 text-sm text-[#573D4F]">
                      New RSVP confirmations and blessings will appear here immediately.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4 ${
                          n.read
                            ? 'border-[#e4cde0] bg-[#f8edf3]'
                            : 'border-[#8E3B6E]/45 bg-[#fdf5f8] shadow-xs'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                n.type === 'blessing'
                                  ? 'bg-[#8E3B6E]/15 text-[#8E3B6E]'
                                  : 'bg-[#EDE5F8] text-[#4A2E70]'
                              }`}
                            >
                              {n.type === 'blessing' ? 'Blessing Posted' : 'RSVP Update'}
                            </span>
                            {!n.read && (
                              <span className="rounded-full bg-[#8E3B6E] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                New
                              </span>
                            )}
                            <span className="text-xs font-semibold text-[#231420]">
                              {n.actorName}
                            </span>
                          </div>
                          <p className="text-sm text-[#573D4F]">{n.summary}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => handleMarkNotificationRead(n.id)}
                              className="inline-flex min-h-[34px] items-center rounded-full border border-[#e4cde0] bg-white px-3 py-1 text-xs font-semibold text-[#4A2E70] hover:border-[#8E3B6E] cursor-pointer"
                            >
                              Mark Read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteNotification(n.id)}
                            aria-label="Delete alert"
                            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-full border border-[#e4cde0] bg-white text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 6: LOCKED FAMILY HOST ACCESS & BLESSINGS MODERATION */}
            {activeTab === 'access' && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
                <div className="space-y-5 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-6 lg:col-span-6">
                  <div className="flex items-center gap-2 text-[#8E3B6E]">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                      Locked Family Host Allowlist
                    </h2>
                  </div>
                  <p className="text-xs leading-relaxed text-[#573D4F]">
                    Admin authentication and Firestore security rules are permanently locked to
                    these exact four verified Google accounts. No other accounts can sign in or
                    access private wedding records.
                  </p>

                  <div className="space-y-2">
                    {[
                      {
                        email: 'prakharsaxena579@gmail.com',
                        name: 'Prakhar Saxena',
                        role: 'Groom · Locked Host',
                      },
                      {
                        email: 'vksaxena2000@gmail.com',
                        name: 'Vijay Saxena',
                        role: 'Father of Groom · Locked Host',
                      },
                      {
                        email: 'shiprakanpur2012@gmail.com',
                        name: 'Shipra Saxena',
                        role: 'Mother of Groom · Locked Host',
                      },
                      {
                        email: 'divyanhsaxena1749@gmail.com',
                        name: 'Divyanh Saxena',
                        role: 'Family Host · Locked Host',
                      },
                    ].map((host) => (
                      <div
                        key={host.email}
                        className="flex items-center justify-between rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#231420]">{host.name}</p>
                          <p className="text-xs text-[#7A5E72]">
                            {host.email} · {host.role}
                          </p>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EDE5F8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4A2E70]">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          Locked
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Blessings Moderation */}
                <div className="space-y-3 lg:col-span-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-editorial text-xl font-semibold text-[#231420]">
                      Blessings Moderation ({wishes.length})
                    </h2>
                    <span className="text-xs text-[#7A5E72]">
                      Deletes immediately from public feed
                    </span>
                  </div>
                  {wishActionMsg && (
                    <p
                      role="status"
                      className="rounded-xl border border-[#6B4C8C]/30 bg-[#EDE5F8] px-3.5 py-2 text-xs font-medium text-[#4A2E70]"
                    >
                      {wishActionMsg}
                    </p>
                  )}
                  {wishes.length === 0 ? (
                    <p className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-8 text-center text-sm text-[#573D4F]">
                      No blessings have been posted yet.
                    </p>
                  ) : (
                    wishes.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-4"
                      >
                        <div>
                          <p className="text-xs font-semibold text-[#8E3B6E]">
                            {w.guestName}
                            {w.relationship ? ` · ${w.relationship}` : ''}
                          </p>
                          <p className="mt-1 text-sm text-[#231420]">{w.message}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteWish(w.id)}
                          aria-label={`Remove blessing from ${w.guestName}`}
                          className="inline-flex min-h-[38px] items-center gap-1.5 shrink-0 rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-3 py-1.5 text-xs font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
