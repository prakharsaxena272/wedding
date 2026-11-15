import React from 'react';
import { Calendar, Clock, ExternalLink, MapPin, Shirt, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import morningHaldiImg from '../assets/images/morning_haldi_ceremony_1794724911933.jpg';
import eveningWeddingImg from '../assets/images/evening_wedding_couture_1794724912355.jpg';
import { WeddingConfig, WeddingEventRecord } from '../types/wedding';
import { EditorialImage } from './EditorialImage';

interface ScheduleTimelineProps {
  config: WeddingConfig;
  events: WeddingEventRecord[];
}

const EASE_EDITORIAL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ config, events }) => {
  const displayEvents =
    events.length > 0
      ? events.map((ev, index) => ({
          id: ev.id,
          chapterLabel: ev.chapterLabel || `Ceremony ${String(index + 1).padStart(2, '0')}`,
          title: ev.title,
          dateLabel: ev.dateLabel,
          time: ev.timeLabel,
          venue: ev.venue,
          dressCode: ev.dressCode,
          description: ev.description,
          imageKey: ev.imageKey,
        }))
      : [
          {
            id: 'haldi-default',
            chapterLabel: 'Morning Celebration',
            title: config.haldiTitle,
            dateLabel: config.weddingDateLabel,
            time: config.haldiTime,
            venue: config.haldiVenue,
            dressCode: config.haldiDressCode,
            description: config.haldiDescription,
            imageKey: 'haldi' as const,
          },
          {
            id: 'wedding-default',
            chapterLabel: 'Evening Celebration',
            title: config.weddingTitle,
            dateLabel: config.weddingDateLabel,
            time: config.weddingTime,
            venue: config.weddingVenue,
            dressCode: config.weddingDressCode,
            description: config.weddingDescription,
            imageKey: 'wedding' as const,
          },
        ];

  return (
    <section id="schedule" className="scroll-mt-20 border-t border-[#efe0ea] py-10 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease: EASE_EDITORIAL }}
        >
          <p className="label-caps text-[#6B4C8C]">Wedding Programme</p>
          <h2 className="editorial-section-title mt-2 font-medium text-[#231420]">
            Ceremony <span className="italic shimmer-couple-accent">Schedule</span>
          </h2>
          <p className="editorial-body mt-2 max-w-2xl text-[#573D4F]">
            {config.venueName}, {config.venueAddress}, {config.venueCity}
          </p>
          {config.googleMapsUrl && (
            <a
              href={config.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[#8E3B6E]/35 bg-[#f8edf3] px-4 py-1.5 text-xs font-semibold text-[#8E3B6E] transition-colors hover:bg-[#efe0ea]"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Directions to {config.venueName} (Google Maps)</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
          )}
        </motion.div>

        {/* Vertical Timeline with Lavender-Plum Line & Rose Ring Markers */}
        <div className="relative mt-8 pl-7 sm:mt-10 sm:pl-12">
          <div
            aria-hidden="true"
            className="absolute top-3 bottom-3 left-[10px] w-[1.5px] bg-[#6B4C8C]/40 sm:left-[15px]"
          />

          <div className="space-y-6 sm:space-y-8">
            {displayEvents.map((chapter, idx) => {
              const hasPhoto = chapter.imageKey === 'haldi' || chapter.imageKey === 'wedding';
              const photoSrc = chapter.imageKey === 'haldi' ? morningHaldiImg : eveningWeddingImg;
              const photoAlt =
                chapter.imageKey === 'haldi'
                  ? 'Sunlit courtyard with hammered brass bowls of golden marigold petals, jasmine, and turmeric paste for the Morning Haldi ceremony'
                  : 'Lantern-lit heritage palace courtyard at twilight with champagne silk mandap and sacred wedding fire';

              return (
                <motion.article
                  key={chapter.id}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.12 }}
                  transition={{ duration: 0.45, delay: idx * 0.06, ease: EASE_EDITORIAL }}
                  className="relative"
                >
                  {/* Rose-Plum Ring Node */}
                  <span
                    aria-hidden="true"
                    className="absolute top-5 -left-7 flex h-5.5 w-5.5 items-center justify-center rounded-full border-2 border-[#8E3B6E] bg-[#fdf5f8] shadow-xs sm:top-6 sm:-left-12 sm:h-8 sm:w-8"
                  >
                    <span className="h-2 w-2 rounded-full bg-[#8E3B6E] sm:h-2.5 sm:w-2.5" />
                  </span>

                  <div className="overflow-hidden rounded-3xl border border-[#e4cde0] bg-[#f8edf3] lg:grid lg:grid-cols-12 lg:items-stretch">
                    {hasPhoto ? (
                      <div className="relative h-52 w-full sm:h-72 lg:col-span-5 lg:h-full lg:min-h-[300px]">
                        <EditorialImage
                          src={photoSrc}
                          alt={photoAlt}
                          caption={chapter.title}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="double-filigree-card flex flex-col items-center justify-center p-6 text-center sm:p-8 lg:col-span-5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#8E3B6E]/35 bg-[#8E3B6E]/10 text-[#8E3B6E] sm:h-12 sm:w-12">
                          <Sparkles className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="label-caps mt-3 text-[#8E3B6E] sm:mt-4">
                          {chapter.chapterLabel}
                        </p>
                        <p className="editorial-card-title mt-1.5 font-semibold text-[#231420] sm:mt-2">
                          {chapter.title}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#6B4C8C]">
                          {chapter.dateLabel}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col justify-center p-5 sm:p-8 lg:col-span-7">
                      <p className="label-caps text-[#8E3B6E]">{chapter.chapterLabel}</p>
                      <h3 className="editorial-card-title mt-1.5 font-semibold text-[#231420] sm:mt-2">
                        {chapter.title}
                      </h3>

                      <div className="mt-3.5 space-y-2 text-[13px] text-[#573D4F] sm:mt-4 sm:text-sm">
                        <div className="flex items-center gap-2.5">
                          <Calendar className="h-4 w-4 shrink-0 text-[#8E3B6E]" aria-hidden="true" />
                          <span className="font-medium text-[#231420]">{chapter.dateLabel}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Clock className="h-4 w-4 shrink-0 text-[#6B4C8C]" aria-hidden="true" />
                          <span className="font-semibold text-[#231420] tabular-nums">
                            {chapter.time}
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <MapPin
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#8E3B6E]"
                            aria-hidden="true"
                          />
                          <span>
                            {chapter.venue} · {config.venueName}
                          </span>
                        </div>
                        {chapter.dressCode && (
                          <div className="flex items-start gap-2.5">
                            <Shirt
                              className="mt-0.5 h-4 w-4 shrink-0 text-[#6B4C8C]"
                              aria-hidden="true"
                            />
                            <span>
                              <strong className="font-semibold text-[#231420]">Attire:</strong>{' '}
                              {chapter.dressCode}
                            </span>
                          </div>
                        )}
                      </div>

                      {chapter.description && (
                        <p className="editorial-body mt-3.5 text-[#573D4F] sm:mt-4">
                          {chapter.description}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
