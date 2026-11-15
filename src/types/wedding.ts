export const PRIMARY_HOST_EMAILS = [
  'prakharsaxena579@gmail.com',
  'vksaxena2000@gmail.com',
  'shiprakanpur2012@gmail.com',
  'divyanhsaxena1749@gmail.com',
] as const;

export type RsvpSide = "Bride's Family" | "Groom's Family" | "Close Friends";
export type RsvpAttendance =
  | 'Both'
  | 'Morning Haldi Only'
  | 'Evening Wedding Only'
  | 'Unable to Attend';
export type WishCeremony = 'Morning Haldi' | 'Evening Wedding' | 'Both Celebrations';

export type InviteeAvailability =
  | 'Pending'
  | 'Will Attend with Family'
  | 'Unable to Attend';

export type InviteeNotifiedVia = 'Pending' | 'WhatsApp' | 'SMS';

export interface PublicInviteeRecord {
  id: string;
  headOfFamilyName: string;
  nameLower: string;
  side: RsvpSide;
  availability: InviteeAvailability;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export interface RsvpLookupRecord {
  id: string;
  inviteeId: string;
  headOfFamilyName: string;
  side: RsvpSide;
  availability: InviteeAvailability;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export interface InviteePrivateRecord {
  id: string;
  tentativeGuests: number;
  phone: string;
  note: string;
  addedBy: string;
  notifiedVia?: InviteeNotifiedVia;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export interface MergedInviteeRecord extends PublicInviteeRecord {
  tentativeGuests: number;
  phone: string;
  note: string;
  addedBy: string;
  notifiedVia: InviteeNotifiedVia;
}

export interface HostMemberRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  addedBy: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export interface WeddingConfig {
  groomName: string;
  brideName: string;
  hostsName: string;
  weddingDateLabel: string;
  weddingIsoTarget: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  invitationMessage: string;
  haldiTitle: string;
  haldiTime: string;
  haldiVenue: string;
  haldiDressCode: string;
  haldiDescription: string;
  weddingTitle: string;
  weddingTime: string;
  weddingVenue: string;
  weddingDressCode: string;
  weddingDescription: string;
  googleMapsUrl?: string;
  videoInvitationUrl?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export type WeddingEventImageKey = 'haldi' | 'wedding' | 'custom';

export interface WeddingEventRecord {
  id: string;
  title: string;
  chapterLabel: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  dressCode: string;
  description: string;
  imageKey: WeddingEventImageKey;
  sortOrder: number;
  createdAt?: { seconds: number; nanoseconds: number } | null;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export interface RsvpSubmission {
  name: string;
  side: RsvpSide;
  attendance: RsvpAttendance;
  guestCount: number;
  phone: string;
  note: string;
}

export interface RsvpRecord extends RsvpSubmission {
  id: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export const HOST_NOTIFICATION_EMAIL = 'prakhar.saxena579@gmail.com';

export type HostNotificationType = 'blessing' | 'rsvp';

export interface HostNotificationRecord {
  id: string;
  type: HostNotificationType;
  actorName: string;
  summary: string;
  recipientEmail: string;
  read: boolean;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export interface WishRecord {
  id: string;
  guestName: string;
  relationship: string;
  ceremony: WishCeremony;
  message: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

export type VendorCategory =
  | 'Decor & Mandap'
  | 'Catering & Feast'
  | 'Photography & Cinema'
  | 'Couture & Styling'
  | 'Music & Baraat'
  | 'Hospitality & Stay'
  | 'Other';

export type VendorStatus =
  | 'Confirmed / Booked'
  | 'In Inquiry / Pending'
  | 'Signature / Luxury';

export interface VendorRecord {
  id: string;
  name: string;
  category: VendorCategory;
  status: VendorStatus;
  ceremony: WishCeremony;
  contact: string;
  estimate: string;
  notes: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export type ExpenseCategory =
  | 'Venue & Catering'
  | 'Dresses & Couture'
  | 'Return Gifts & Favors'
  | 'Jewellery & Shagun'
  | 'Decor & Flowers'
  | 'Photography & Cinema'
  | 'Travel & Hospitality'
  | 'Pandit & Rituals'
  | 'Other / Misc';

export type ExpensePaymentMode =
  | 'UPI'
  | 'Cash'
  | 'Bank Transfer / NEFT'
  | 'Card'
  | 'Cheque'
  | 'Pending';

export type ExpensePaymentStatus = 'Paid' | 'Advance Paid' | 'Pending';

export interface ExpenseRecord {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode: ExpensePaymentMode;
  paymentStatus: ExpensePaymentStatus;
  paidBy: string;
  expenseDate: string;
  notes: string;
  linkedVendorId: string;
  addedBy: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

export const FIELD_LIMITS = {
  inviteeNameMax: 120,
  inviteePhoneMin: 7,
  inviteePhoneMax: 30,
  inviteeNoteMax: 500,
  tentativeGuestsMin: 1,
  tentativeGuestsMax: 30,
  hostEmailMax: 120,
  hostNameMax: 80,
  hostRoleMax: 60,
  rsvpNameMax: 100,
  rsvpPhoneMax: 30,
  rsvpNoteMax: 500,
  wishNameMax: 80,
  wishRelationshipMax: 60,
  wishMessageMax: 500,
  vendorNameMax: 100,
  vendorContactMax: 100,
  vendorEstimateMax: 60,
  vendorNotesMax: 400,
  expenseTitleMax: 140,
  expensePaidByMax: 80,
  expenseDateMax: 20,
  expenseNotesMax: 500,
  expenseAmountMax: 100000000,
  eventTitleMax: 120,
  eventChapterMax: 80,
  eventDateMax: 80,
  eventTimeMax: 80,
  eventVenueMax: 140,
  eventDressCodeMax: 140,
  eventDescriptionMax: 500,
  googleMapsUrlMax: 500,
  videoUrlMax: 300,
  guestCountMin: 1,
  guestCountMax: 15,
} as const;

export const DEFAULT_WEDDING_CONFIG: WeddingConfig = {
  groomName: 'Prakhar',
  brideName: 'Prakriti',
  hostsName: 'Vijay & Shipra Saxena',
  weddingDateLabel: 'Tuesday, February 2, 2027',
  weddingIsoTarget: '2027-02-02T09:30:00+05:30',
  venueName: 'Love Kush Vatika',
  venueAddress: 'Bithoor',
  venueCity: 'Kanpur, Uttar Pradesh',
  googleMapsUrl:
    'https://www.google.com/maps/place/Lav+Kush+Vatika/@26.5689686,80.262503,17z/data=!3m1!4b1!4m6!3m5!1s0x399c31982c1dd013:0xfd4e3bc701f0d566!8m2!3d26.5689686!4d80.262503!16s%2Fg%2F11tkbj6ddf?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D',
  invitationMessage:
    'Please do join us with your entire family to shower your warm blessings on the couple as we celebrate this joyous milestone together.',
  haldiTitle: 'Morning Haldi Ceremony',
  haldiTime: '9:30 AM – 12:30 PM',
  haldiVenue: 'Sunlit Courtyard Lawn, Love Kush Vatika',
  haldiDressCode: 'Marigold Yellow, Mustard & Sunlit Ivory',
  haldiDescription:
    'A sunlit morning of sacred turmeric rituals, fresh marigold petals, folk melodies, and warm family laughter before the evening vows.',
  weddingTitle: 'Wedding Ceremony, Baraat, Varmala, Pheras & Dinner',
  weddingTime: '6:30 PM Onwards',
  weddingVenue: 'Grand Mandap Lawn, Love Kush Vatika',
  weddingDressCode: 'Traditional Festive & Evening Couture',
  weddingDescription:
    'Join the jubilant Baraat procession at dusk, followed by the floral Varmala exchange, sacred midnight Pheras beneath the stars, and a celebratory royal feast.',
  videoInvitationUrl: '',
};
