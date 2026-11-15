import React, { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import ganeshEmblemImg from '../assets/images/ganesh_sacred_emblem_1794732707739.jpg';
import heroInvitationImg from '../assets/images/hero_wedding_invitation_1794724911931.jpg';
import { WeddingConfig } from '../types/wedding';
import { CountdownTimer } from './CountdownTimer';
import { EditorialImage } from './EditorialImage';

interface HeroInvitationProps {
  config: WeddingConfig;
}

const EASE_EDITORIAL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const HeroInvitation: React.FC<HeroInvitationProps> = ({ config }) => {
  const [emblemFailed, setEmblemFailed] = useState(false);

  return (
    <section id="invitation" className="scroll-mt-20 pt-4 pb-8 sm:pt-8 sm:pb-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-12 lg:items-stretch lg:gap-8">
          {/* Left 7 Columns: Formal Double-Filigree Invitation Stationery */}
          <div className="double-filigree-card flex flex-col justify-between rounded-3xl p-5 sm:p-10 lg:col-span-7">
            <div>
              {/* Sacred Lord Ganesha Crest */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_EDITORIAL }}
                className="flex items-center gap-3.5"
              >
                {!emblemFailed ? (
                  <img
                    src={ganeshEmblemImg}
                    alt="Sacred Lord Ganesha wedding emblem"
                    referrerPolicy="no-referrer"
                    onError={() => setEmblemFailed(true)}
                    className="h-14 w-14 shrink-0 rounded-full object-cover mix-blend-multiply sm:h-16 sm:w-16"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#8E3B6E]/35 font-editorial text-lg font-semibold text-[#8E3B6E]"
                  >
                    ॐ
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-editorial text-xs font-medium tracking-wide text-[#8E3B6E] sm:text-sm">
                    || Shree Ganeshaya Namah ||
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <p className="label-caps text-[#6B4C8C]">With the Blessings of Our Elders</p>
                    <motion.span
                      aria-hidden="true"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.65, delay: 0.12, ease: EASE_EDITORIAL }}
                      className="hidden h-[1px] flex-1 origin-left bg-gradient-to-r from-[#8E3B6E]/45 to-transparent sm:block"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Single Cohesive First-Person Invitation Message */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08, ease: EASE_EDITORIAL }}
                className="editorial-lead mt-4 font-medium text-[#573D4F]"
              >
                With joyful hearts, we (
                <span className="font-semibold text-[#231420]">{config.hostsName}</span>) warmly
                invite you and your family to celebrate the auspicious wedding of our beloved son
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.16, ease: EASE_EDITORIAL }}
                className="editorial-hero-title mt-3.5 font-semibold text-[#231420] sm:mt-4"
              >
                <span>{config.groomName}</span>{' '}
                <motion.span
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.28, ease: EASE_EDITORIAL }}
                  className="editorial-ampersand shimmer-couple-accent mx-1.5 inline-block sm:mx-2.5"
                >
                  &amp;
                </motion.span>{' '}
                <span>{config.brideName}</span>
              </motion.h1>

              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.65, delay: 0.25, ease: EASE_EDITORIAL }}
                aria-hidden="true"
                className="mt-3.5 flex origin-left items-center gap-2"
              >
                <span className="h-[1px] w-14 bg-gradient-to-r from-[#8E3B6E]/65 to-[#6B4C8C]/35 sm:w-20" />
                <span className="text-[10px] leading-none text-[#8E3B6E]">✦</span>
                <span className="h-[1px] w-10 bg-gradient-to-r from-[#6B4C8C]/35 to-transparent sm:w-14" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.22, ease: EASE_EDITORIAL }}
                className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-[#573D4F] sm:mt-4 sm:gap-x-2.5 sm:text-sm"
              >
                <span className="font-semibold text-[#231420]">{config.weddingDateLabel}</span>
                <span aria-hidden="true" className="text-[#8E3B6E]">
                  ·
                </span>
                {config.googleMapsUrl ? (
                  <a
                    href={config.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 underline-offset-4 transition-colors hover:text-[#8E3B6E] hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8E3B6E]" aria-hidden="true" />
                    <span>
                      {config.venueName}, {config.venueCity}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-[#8E3B6E]" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8E3B6E]" aria-hidden="true" />
                    <span>
                      {config.venueName}, {config.venueCity}
                    </span>
                  </span>
                )}
              </motion.div>

              {config.invitationMessage && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.28, ease: EASE_EDITORIAL }}
                  className="editorial-body mt-4 max-w-xl text-[#573D4F] sm:mt-5"
                >
                  {config.invitationMessage}
                </motion.p>
              )}
            </div>

            <div className="mt-6 sm:mt-7">
              <CountdownTimer targetIso={config.weddingIsoTarget} />
            </div>
          </div>

          {/* Right 5 Columns: Bespoke Editorial Stationery Photograph */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.14, ease: EASE_EDITORIAL }}
            className="overflow-hidden rounded-3xl border border-[#e4cde0] bg-[#f8edf3] lg:col-span-5"
          >
            <div className="relative h-64 w-full sm:h-88 lg:h-full lg:min-h-[440px]">
              <EditorialImage
                src={heroInvitationImg}
                alt="Handmade cotton wedding invitation cards beside jasmine mogra garlands and flickering brass candles"
                caption="Prakhar & Prakriti · February 2, 2027"
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#231420]/60 via-transparent to-transparent"
              />
              <div className="absolute right-4 bottom-4 left-4 text-[#fdf5f8] sm:right-5 sm:bottom-5 sm:left-5">
                <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#F9C6E0] sm:text-[11px]">
                  Shubh Vivah
                </p>
                <p className="font-editorial text-lg font-medium sm:text-xl">
                  {config.weddingDateLabel}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Full-Width Formal Summary Strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.26, ease: EASE_EDITORIAL }}
          className="mt-5 grid grid-cols-2 gap-3.5 rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-4 sm:mt-6 sm:grid-cols-4 sm:gap-6 sm:p-6"
        >
          <div>
            <p className="label-caps text-[#8E3B6E]">Hosts</p>
            <p className="mt-1 text-[13px] font-semibold text-[#231420] sm:text-sm">
              {config.hostsName}
            </p>
          </div>
          <div>
            <p className="label-caps text-[#8E3B6E]">Morning</p>
            <p className="mt-1 text-[13px] font-semibold text-[#231420] tabular-nums sm:text-sm">
              {config.haldiTitle} · {config.haldiTime}
            </p>
          </div>
          <div>
            <p className="label-caps text-[#6B4C8C]">Evening</p>
            <p className="mt-1 text-[13px] font-semibold text-[#231420] tabular-nums sm:text-sm">
              Wedding · {config.weddingTime}
            </p>
          </div>
          <div>
            <p className="label-caps text-[#8E3B6E]">Venue</p>
            <p className="mt-1 text-[13px] font-semibold text-[#231420] sm:text-sm">
              {config.venueName}
            </p>
            {config.googleMapsUrl && (
              <a
                href={config.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#8E3B6E] underline-offset-2 hover:underline sm:text-xs"
              >
                <span>Open in Google Maps</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
