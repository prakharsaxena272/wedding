import { WeddingConfig } from '../types/wedding';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

interface IcsEventSpec {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
}

function buildIcsCalendar(events: IcsEventSpec[]): string {
  const nowStamp = toIcsUtc(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prakhar & Prakriti Wedding//Celebration 2027//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${toIcsUtc(ev.start)}`,
      `DTEND:${toIcsUtc(ev.end)}`,
      `SUMMARY:${escapeIcsText(ev.title)}`,
      `LOCATION:${escapeIcsText(ev.location)}`,
      `DESCRIPTION:${escapeIcsText(ev.description)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function getCeremonyDateBase(config: WeddingConfig): string {
  const match = config.weddingIsoTarget.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '2027-02-02';
}

export function downloadCeremonyIcs(
  config: WeddingConfig,
  type: 'haldi' | 'wedding' | 'all'
): void {
  const datePart = getCeremonyDateBase(config);
  const fullAddress = `${config.venueName}, ${config.venueAddress}, ${config.venueCity}`;

  const haldiEvent: IcsEventSpec = {
    uid: `prakhar-prakriti-haldi-${datePart}@saxenawedding.app`,
    title: `${config.groomName.split(' ')[0]} & ${config.brideName.split(' ')[0]} — ${config.haldiTitle}`,
    start: new Date(`${datePart}T09:30:00+05:30`),
    end: new Date(`${datePart}T12:30:00+05:30`),
    location: `${config.haldiVenue}, ${fullAddress}`,
    description: `Hosted by ${config.hostsName}. Dress Code: ${config.haldiDressCode}. ${config.haldiDescription}`,
  };

  const weddingEvent: IcsEventSpec = {
    uid: `prakhar-prakriti-wedding-${datePart}@saxenawedding.app`,
    title: `${config.groomName.split(' ')[0]} & ${config.brideName.split(' ')[0]} — ${config.weddingTitle}`,
    start: new Date(`${datePart}T18:30:00+05:30`),
    end: new Date(`${datePart}T23:45:00+05:30`),
    location: `${config.weddingVenue}, ${fullAddress}`,
    description: `Hosted by ${config.hostsName}. Dress Code: ${config.weddingDressCode}. ${config.weddingDescription}`,
  };

  const events =
    type === 'haldi'
      ? [haldiEvent]
      : type === 'wedding'
        ? [weddingEvent]
        : [haldiEvent, weddingEvent];

  const filename =
    type === 'haldi'
      ? 'Haldi-Ceremony-Prakhar-Prakriti.ics'
      : type === 'wedding'
        ? 'Wedding-Ceremony-Prakhar-Prakriti.ics'
        : 'Prakhar-Prakriti-Wedding-Schedule.ics';

  const icsContent = buildIcsCalendar(events);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
