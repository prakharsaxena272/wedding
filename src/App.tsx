import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { MotionConfig } from 'motion/react';
import {
  CalendarDays,
  LayoutDashboard,
  Lock,
  MessageSquareHeart,
  Sparkles,
  Users,
} from 'lucide-react';
import { BlessingsWall } from './components/BlessingsWall';
import { ConfirmPresenceSection } from './components/ConfirmPresenceSection';
import { HeroInvitation } from './components/HeroInvitation';
import { ManagementPortal } from './components/ManagementPortal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ScheduleTimeline } from './components/ScheduleTimeline';
import { WeddingConciergeAI } from './components/WeddingConciergeAI';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase';
import {
  DEFAULT_WEDDING_CONFIG,
  PRIMARY_HOST_EMAILS,
  WeddingConfig,
  WeddingEventImageKey,
  WeddingEventRecord,
} from './types/wedding';

type SectionId = 'invitation' | 'schedule' | 'confirm' | 'blessings';
type ActiveView = 'guest' | 'portal';

export default function App() {
  const [config, setConfig] = useState<WeddingConfig>(DEFAULT_WEDDING_CONFIG);
  const [events, setEvents] = useState<WeddingEventRecord[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<ActiveView>('guest');
  const [activeNav, setActiveNav] = useState<SectionId>('invitation');

  useEffect(() => {
    testFirestoreConnection();

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    const unsubConfig = onSnapshot(
      doc(db, 'weddingConfig', 'main'),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          const rawVenueName = String(d.venueName || '');
          const rawVenueAddress = String(d.venueAddress || '');
          const rawVenueCity = String(d.venueCity || '');
          const isOldPlaceholder =
            rawVenueName === 'The Heritage Courtyard & Mandap' ||
            rawVenueName.includes('Celebration Greens') ||
            rawVenueAddress.includes('Celebration Greens') ||
            rawVenueAddress.includes('Gomti Nagar') ||
            rawVenueCity.includes('Lucknow') ||
            (rawVenueName === 'Lav Kush Vatika' && rawVenueAddress.includes('Bithoor Road'));

          const rawGroom = String(d.groomName || '').trim();
          const rawBride = String(d.brideName || '').trim();
          const normalizedGroom =
            !rawGroom || rawGroom === 'Prakhar Saxena'
              ? DEFAULT_WEDDING_CONFIG.groomName
              : rawGroom;
          const normalizedBride =
            !rawBride || rawBride === 'Prakriti Srivastava'
              ? DEFAULT_WEDDING_CONFIG.brideName
              : rawBride;

          const rawMsg = String(d.invitationMessage || '').trim();
          const isOldDuplicateMsg =
            !rawMsg ||
            rawMsg.startsWith('With joyful hearts and the blessings of our elders');

          setConfig({
            ...DEFAULT_WEDDING_CONFIG,
            groomName: normalizedGroom,
            brideName: normalizedBride,
            hostsName: d.hostsName || DEFAULT_WEDDING_CONFIG.hostsName,
            weddingDateLabel: d.weddingDateLabel || DEFAULT_WEDDING_CONFIG.weddingDateLabel,
            weddingIsoTarget: d.weddingIsoTarget || DEFAULT_WEDDING_CONFIG.weddingIsoTarget,
            venueName: isOldPlaceholder
              ? DEFAULT_WEDDING_CONFIG.venueName
              : rawVenueName || DEFAULT_WEDDING_CONFIG.venueName,
            venueAddress: isOldPlaceholder
              ? DEFAULT_WEDDING_CONFIG.venueAddress
              : rawVenueAddress || DEFAULT_WEDDING_CONFIG.venueAddress,
            venueCity: isOldPlaceholder
              ? DEFAULT_WEDDING_CONFIG.venueCity
              : rawVenueCity || DEFAULT_WEDDING_CONFIG.venueCity,
            googleMapsUrl: d.googleMapsUrl || DEFAULT_WEDDING_CONFIG.googleMapsUrl,
            invitationMessage: isOldDuplicateMsg
              ? DEFAULT_WEDDING_CONFIG.invitationMessage
              : rawMsg,
            haldiTitle: d.haldiTitle || DEFAULT_WEDDING_CONFIG.haldiTitle,
            haldiTime: d.haldiTime || DEFAULT_WEDDING_CONFIG.haldiTime,
            haldiVenue: isOldPlaceholder
              ? DEFAULT_WEDDING_CONFIG.haldiVenue
              : d.haldiVenue || DEFAULT_WEDDING_CONFIG.haldiVenue,
            haldiDressCode: d.haldiDressCode || DEFAULT_WEDDING_CONFIG.haldiDressCode,
            haldiDescription: d.haldiDescription || DEFAULT_WEDDING_CONFIG.haldiDescription,
            weddingTitle: d.weddingTitle || DEFAULT_WEDDING_CONFIG.weddingTitle,
            weddingTime: d.weddingTime || DEFAULT_WEDDING_CONFIG.weddingTime,
            weddingVenue: isOldPlaceholder
              ? DEFAULT_WEDDING_CONFIG.weddingVenue
              : d.weddingVenue || DEFAULT_WEDDING_CONFIG.weddingVenue,
            weddingDressCode: d.weddingDressCode || DEFAULT_WEDDING_CONFIG.weddingDressCode,
            weddingDescription: d.weddingDescription || DEFAULT_WEDDING_CONFIG.weddingDescription,
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'weddingConfig/main');
      }
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'weddingEvents'), orderBy('sortOrder', 'asc'), limit(30)),
      (snapshot) => {
        const list: WeddingEventRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            title: String(d.title ?? ''),
            chapterLabel: String(d.chapterLabel ?? ''),
            dateLabel: String(d.dateLabel ?? ''),
            timeLabel: String(d.timeLabel ?? ''),
            venue: String(d.venue ?? ''),
            dressCode: String(d.dressCode ?? ''),
            description: String(d.description ?? ''),
            imageKey: (d.imageKey as WeddingEventImageKey) || 'custom',
            sortOrder: Number(d.sortOrder ?? 0),
            createdAt: d.createdAt ?? null,
            updatedAt: d.updatedAt ?? null,
          };
        });
        setEvents(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'weddingEvents');
      }
    );

    return () => {
      unsubAuth();
      unsubConfig();
      unsubEvents();
    };
  }, []);

  const navigateToSection = (id: SectionId) => {
    setActiveNav(id);
    if (view !== 'guest') {
      setView('guest');
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openPortal = () => {
    setView('portal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const groomFirst = config.groomName.split(' ')[0];
  const brideFirst = config.brideName.split(' ')[0];
  const isAuthorizedHost = Boolean(
    authReady &&
      user &&
      user.email &&
      user.emailVerified &&
      (PRIMARY_HOST_EMAILS as readonly string[]).includes(user.email.toLowerCase())
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#fdf5f8] pb-20 text-[#231420] md:pb-0">
        <OfflineIndicator />

        {/* Clean Minimal Formal Top Header */}
        <header className="frosted-veil border-b border-[#efe0ea] md:sticky md:top-0 md:z-40">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:gap-8 sm:px-8 md:h-16 lg:px-12">
            <a
              href="#invitation"
              onClick={(e) => {
                e.preventDefault();
                navigateToSection('invitation');
              }}
              className="font-editorial text-base font-semibold tracking-tight text-[#231420] whitespace-nowrap shrink-0 sm:text-xl"
            >
              {groomFirst}{' '}
              <span className="italic shimmer-couple-accent">&amp;</span>{' '}
              {brideFirst}
            </a>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-7 text-sm font-medium text-[#573D4F] md:flex"
          >
            <a
              href="#invitation"
              onClick={(e) => {
                e.preventDefault();
                navigateToSection('invitation');
              }}
              className="py-2 underline-offset-4 transition-colors hover:text-[#231420] hover:underline hover:decoration-[#8E3B6E] whitespace-nowrap shrink-0"
            >
              Invitation
            </a>
            <a
              href="#schedule"
              onClick={(e) => {
                e.preventDefault();
                navigateToSection('schedule');
              }}
              className="py-2 underline-offset-4 transition-colors hover:text-[#231420] hover:underline hover:decoration-[#8E3B6E] whitespace-nowrap shrink-0"
            >
              Schedule
            </a>
            <a
              href="#confirm"
              onClick={(e) => {
                e.preventDefault();
                navigateToSection('confirm');
              }}
              className="py-2 underline-offset-4 transition-colors hover:text-[#231420] hover:underline hover:decoration-[#8E3B6E] whitespace-nowrap shrink-0"
            >
              Presence
            </a>
            <a
              href="#blessings"
              onClick={(e) => {
                e.preventDefault();
                navigateToSection('blessings');
              }}
              className="py-2 underline-offset-4 transition-colors hover:text-[#231420] hover:underline hover:decoration-[#8E3B6E] whitespace-nowrap shrink-0"
            >
              Blessings
            </a>
          </nav>

          <span className="hidden text-xs font-medium tracking-wider uppercase text-[#8E3B6E] md:inline-block whitespace-nowrap">
            {config.weddingDateLabel}
          </span>
        </div>
      </header>

      <main>
        {view === 'portal' ? (
          <ManagementPortal
            onBackToInvitation={() => setView('guest')}
            user={user}
            authReady={authReady}
            config={config}
            events={events}
          />
        ) : (
          <>
            <HeroInvitation config={config} />
            <ScheduleTimeline config={config} events={events} />
            <ConfirmPresenceSection config={config} />
            <BlessingsWall canModerate={isAuthorizedHost} />
            <WeddingConciergeAI config={config} events={events} />
          </>
        )}
      </main>

      {/* Quiet Editorial Footer with Admin access at bottom */}
      <footer className="border-t border-[#efe0ea] bg-[#f8edf3] py-9 sm:py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-8 sm:text-left lg:px-12">
          <div>
            <p className="font-editorial text-base font-medium text-[#231420] sm:text-lg">
              {config.groomName} <span className="italic text-[#8E3B6E]">&amp;</span>{' '}
              {config.brideName}
            </p>
            <p className="mt-1 text-xs text-[#7A5E72]">
              With blessings of {config.hostsName} · {config.weddingDateLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={openPortal}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-4 py-1.5 text-xs font-semibold text-[#573D4F] transition-colors hover:border-[#8E3B6E] hover:text-[#231420] cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5 text-[#8E3B6E]" aria-hidden="true" />
            <span>Admin</span>
          </button>
        </div>
      </footer>

      {/* Mobile Thumb-Zone Bottom Navigation Bar (5 Tabs) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="frosted-veil fixed right-0 bottom-0 left-0 z-40 border-t border-[#e4cde0] pb-safe md:hidden"
      >
        <div className="grid h-14 grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => navigateToSection('invitation')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              view === 'guest' && activeNav === 'invitation' ? 'text-[#8E3B6E]' : 'text-[#7A5E72]'
            }`}
          >
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <span>Invite</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('schedule')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              view === 'guest' && activeNav === 'schedule' ? 'text-[#8E3B6E]' : 'text-[#7A5E72]'
            }`}
          >
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
            <span>Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('confirm')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              view === 'guest' && activeNav === 'confirm' ? 'text-[#8E3B6E]' : 'text-[#7A5E72]'
            }`}
          >
            <Users className="h-5 w-5" aria-hidden="true" />
            <span>Family</span>
          </button>

          <button
            type="button"
            onClick={() => navigateToSection('blessings')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              view === 'guest' && activeNav === 'blessings' ? 'text-[#8E3B6E]' : 'text-[#7A5E72]'
            }`}
          >
            <MessageSquareHeart className="h-5 w-5" aria-hidden="true" />
            <span>Blessings</span>
          </button>

          <button
            type="button"
            onClick={openPortal}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              view === 'portal' ? 'text-[#8E3B6E]' : 'text-[#7A5E72]'
            }`}
          >
            <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            <span>Admin</span>
          </button>
        </div>
      </nav>
      </div>
    </MotionConfig>
  );
}
