import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, Phone, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { dispatchHostNotification } from '../lib/notifyHost';
import { computeRsvpLookupId, extractRsvpPhoneKey } from '../lib/rsvpLookup';
import {
  InviteeAvailability,
  PublicInviteeRecord,
  RsvpSide,
  WeddingConfig,
} from '../types/wedding';

interface ConfirmPresenceSectionProps {
  config: WeddingConfig;
}

interface PendingVerificationState {
  invitee: PublicInviteeRecord;
  intent: Exclude<InviteeAvailability, 'Pending'>;
}

const EASE_EDITORIAL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const ConfirmPresenceSection: React.FC<ConfirmPresenceSectionProps> = ({ config }) => {
  const [invitees, setInvitees] = useState<PublicInviteeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [pendingVerify, setPendingVerify] = useState<PendingVerificationState | null>(null);
  const [verifyPhone, setVerifyPhone] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [confirmedBanner, setConfirmedBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const inviteesQuery = query(collection(db, 'publicInvitees'), limit(300));
    const unsubscribe = onSnapshot(
      inviteesQuery,
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
        setInvitees(list);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'publicInvitees');
      }
    );

    return () => unsubscribe();
  }, []);

  const trimmedQuery = searchTerm.trim().toLowerCase();

  const matchingInvitees = useMemo(() => {
    if (!trimmedQuery) return [];
    return invitees.filter(
      (item) =>
        item.nameLower.includes(trimmedQuery) ||
        item.headOfFamilyName.toLowerCase().includes(trimmedQuery)
    );
  }, [invitees, trimmedQuery]);

  const handleStartVerification = (
    invitee: PublicInviteeRecord,
    intent: Exclude<InviteeAvailability, 'Pending'>
  ) => {
    setErrorMsg(null);
    setConfirmedBanner(null);
    setVerifyError(null);
    setVerifyPhone('');
    setPendingVerify({ invitee, intent });
  };

  const handleCancelVerification = () => {
    setPendingVerify(null);
    setVerifyPhone('');
    setVerifyError(null);
  };

  const handleVerifyAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingVerify) return;

    const { invitee, intent } = pendingVerify;
    setVerifyError(null);
    setErrorMsg(null);

    const key = extractRsvpPhoneKey(verifyPhone);
    if (key.length < 7) {
      setVerifyError('Please enter your registered mobile number to continue.');
      return;
    }

    setUpdatingId(invitee.id);
    try {
      const lookupId = await computeRsvpLookupId(verifyPhone);
      if (!lookupId) {
        setVerifyError(
          `This mobile number is not attached or linked with ${invitee.headOfFamilyName}'s name.`
        );
        return;
      }

      const lookupSnap = await getDoc(doc(db, 'rsvpLookup', lookupId));
      if (!lookupSnap.exists() || lookupSnap.data().inviteeId !== invitee.id) {
        setVerifyError(
          `This mobile number is not attached or linked with ${invitee.headOfFamilyName}'s name.`
        );
        return;
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'publicInvitees', invitee.id), {
        availability: intent,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'rsvpLookup', lookupId), {
        availability: intent,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      void dispatchHostNotification({
        type: 'rsvp',
        actorName: invitee.headOfFamilyName,
        summary: `${invitee.headOfFamilyName} (${invitee.side}) responded: ${intent}`,
      });

      setPendingVerify(null);
      setVerifyPhone('');
      setConfirmedBanner(
        intent === 'Will Attend with Family'
          ? `Thank you. ${invitee.headOfFamilyName} is confirmed — we look forward to welcoming your family.`
          : `Thank you for letting us know, ${invitee.headOfFamilyName}. Your presence will be missed.`
      );
    } catch (err) {
      setErrorMsg('Unable to update confirmation right now. Please try again.');
      handleFirestoreError(err, OperationType.UPDATE, `publicInvitees/${invitee.id}`);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section id="confirm" className="scroll-mt-20 border-t border-[#efe0ea] py-10 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left 5 Columns: Formal Invitation Note */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45, ease: EASE_EDITORIAL }}
            className="lg:col-span-5"
          >
            <p className="label-caps text-[#8E3B6E]">Gracious Presence</p>
            <h2 className="editorial-section-title mt-2 font-medium text-[#231420]">
              Please Do Come <span className="italic shimmer-couple-accent">With Your Family</span>
            </h2>
            <p className="editorial-body mt-2.5 text-[#573D4F] sm:mt-3">
              Your gracious presence is our greatest blessing. Kindly enter the head of your
              family&apos;s name below to RSVP for {config.hostsName} on{' '}
              <strong className="font-semibold text-[#231420]">{config.weddingDateLabel}</strong>.
            </p>
          </motion.div>

          {/* Right 7 Columns: Name Search + Step-2 Mobile Number Verification */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.45, delay: 0.08, ease: EASE_EDITORIAL }}
            className="lg:col-span-7"
          >
            <div className="double-filigree-card space-y-4 rounded-3xl p-5 sm:p-8">
              <div>
                <label
                  htmlFor="family-search"
                  className="block text-[13px] font-semibold text-[#231420] sm:text-sm"
                >
                  Head of Family Name
                </label>
                <div className="relative mt-2">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-[#7A5E72]"
                    aria-hidden="true"
                  />
                  <input
                    id="family-search"
                    type="search"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setConfirmedBanner(null);
                      setPendingVerify(null);
                      setVerifyError(null);
                      setVerifyPhone('');
                    }}
                    placeholder="Enter family name..."
                    className="min-h-[44px] w-full rounded-full border border-[#e4cde0] bg-[#fdf5f8] py-2.5 pr-4 pl-11 text-sm text-[#231420] placeholder:text-[#7A5E72]/80 focus:border-[#8E3B6E] focus:outline-none focus:ring-3 focus:ring-[#8E3B6E]/15"
                  />
                </div>
              </div>

              {confirmedBanner && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-2xl border border-[#6B4C8C]/30 bg-[#EDE5F8]/70 px-4 py-3 text-xs font-medium text-[#3B255E] sm:text-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6B4C8C]" aria-hidden="true" />
                  <span>{confirmedBanner}</span>
                </div>
              )}

              {errorMsg && (
                <p
                  role="alert"
                  className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-4 py-3 text-xs text-[#93000a]"
                >
                  {errorMsg}
                </p>
              )}

              {loading ? (
                <p className="text-sm text-[#573D4F]">Loading guest list...</p>
              ) : !trimmedQuery ? (
                <p className="text-xs leading-relaxed text-[#7A5E72]">
                  Please RSVP — enter the head of your family&apos;s name above.
                </p>
              ) : matchingInvitees.length > 0 ? (
                <div className="space-y-3">
                  {matchingInvitees.map((item) => {
                    const isConfirmed = item.availability === 'Will Attend with Family';
                    const isDeclined = item.availability === 'Unable to Attend';
                    const isVerifyingThis = pendingVerify?.invitee.id === item.id;
                    const isBusy = updatingId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-2xl border border-[#e4cde0] bg-[#fdf5f8] p-4"
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div>
                            <h3 className="font-editorial text-base font-semibold text-[#231420] sm:text-lg">
                              {item.headOfFamilyName}
                            </h3>
                            <p className="mt-0.5 text-xs text-[#7A5E72]">
                              {item.side}
                              {isConfirmed && ' · Confirmed'}
                              {isDeclined && ' · Unable to Attend'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleStartVerification(item, 'Will Attend with Family')
                              }
                              className={`inline-flex min-h-[40px] items-center justify-center rounded-full px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer sm:min-h-[36px] ${
                                isConfirmed
                                  ? 'bg-[#6B4C8C] text-white'
                                  : 'bg-[#8E3B6E] text-white hover:bg-[#742D59]'
                              }`}
                            >
                              {isConfirmed ? 'Confirmed' : 'Confirm Presence'}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleStartVerification(item, 'Unable to Attend')}
                              className={`inline-flex min-h-[40px] items-center justify-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer sm:min-h-[36px] ${
                                isDeclined
                                  ? 'border-[#573D4F] bg-[#573D4F] text-white'
                                  : 'border-[#e4cde0] bg-white/75 text-[#573D4F] hover:border-[#8E3B6E] hover:text-[#231420]'
                              }`}
                            >
                              Unable to Attend
                            </button>
                          </div>
                        </div>

                        {isVerifyingThis && pendingVerify && (
                          <form
                            onSubmit={handleVerifyAndSave}
                            className="space-y-2.5 border-t border-[#efe0ea] pt-3"
                          >
                            <label
                              htmlFor={`verify-phone-${item.id}`}
                              className="block text-xs font-semibold text-[#231420]"
                            >
                              Enter your mobile number to confirm (
                              {pendingVerify.intent === 'Will Attend with Family'
                                ? 'Confirm Presence'
                                : 'Unable to Attend'}
                              )
                            </label>

                            <div className="flex flex-col gap-2 sm:flex-row">
                              <div className="relative flex-1">
                                <Phone
                                  className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-[#7A5E72]"
                                  aria-hidden="true"
                                />
                                <input
                                  id={`verify-phone-${item.id}`}
                                  type="tel"
                                  inputMode="numeric"
                                  autoFocus
                                  required
                                  value={verifyPhone}
                                  onChange={(e) => {
                                    setVerifyPhone(e.target.value);
                                    setVerifyError(null);
                                  }}
                                  placeholder="Enter your mobile number..."
                                  className="min-h-[42px] w-full rounded-xl border border-[#e4cde0] bg-white py-2 pr-3 pl-9 text-sm text-[#231420] tabular-nums focus:border-[#8E3B6E] focus:outline-none focus:ring-3 focus:ring-[#8E3B6E]/15"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="submit"
                                  disabled={isBusy}
                                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-[#8E3B6E] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#742D59] disabled:opacity-60 cursor-pointer"
                                >
                                  {isBusy ? 'Verifying...' : 'Verify & Confirm'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={handleCancelVerification}
                                  className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[#e4cde0] bg-white px-3 py-2 text-xs font-semibold text-[#573D4F] hover:text-[#231420] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>

                            {verifyError && (
                              <p
                                role="alert"
                                className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3 py-2 text-xs text-[#93000a]"
                              >
                                {verifyError}
                              </p>
                            )}
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#573D4F]">
                  No entry matched &ldquo;{searchTerm}&rdquo;. Kindly contact the Saxena family if
                  you need assistance.
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
