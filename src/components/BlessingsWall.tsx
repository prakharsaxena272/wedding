import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { Send, Sparkles, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { dispatchHostNotification } from '../lib/notifyHost';
import { FIELD_LIMITS, WishCeremony, WishRecord } from '../types/wedding';

function formatWishDate(createdAt: WishRecord['createdAt']): string {
  if (!createdAt || typeof createdAt.seconds !== 'number') return 'Just now';
  return new Date(createdAt.seconds * 1000).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface BlessingsWallProps {
  canModerate?: boolean;
}

const EASE_EDITORIAL: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const BlessingsWall: React.FC<BlessingsWallProps> = ({ canModerate = false }) => {
  const [wishes, setWishes] = useState<WishRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingWishId, setDeletingWishId] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [message, setMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const [draftingAi, setDraftingAi] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState(false);

  useEffect(() => {
    const wishesQuery = query(
      collection(db, 'wishes'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );

    const unsubscribe = onSnapshot(
      wishesQuery,
      (snapshot) => {
        const items: WishRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            guestName: String(d.guestName ?? ''),
            relationship: String(d.relationship ?? ''),
            ceremony: (d.ceremony as WishCeremony) || 'Both Celebrations',
            message: String(d.message ?? ''),
            createdAt: d.createdAt ?? null,
          };
        });
        setWishes(items);
        setLoading(false);
        setLoadError(null);
      },
      (error) => {
        setLoading(false);
        setLoadError('Unable to load blessings at the moment.');
        handleFirestoreError(error, OperationType.LIST, 'wishes');
      }
    );

    return () => unsubscribe();
  }, []);

  const handlePostWish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostError(null);
    setPostSuccess(false);

    const cleanName = guestName.trim().slice(0, FIELD_LIMITS.wishNameMax);
    const cleanRel = relationship.trim().slice(0, FIELD_LIMITS.wishRelationshipMax);
    const cleanMsg = message.trim().slice(0, FIELD_LIMITS.wishMessageMax);

    if (!cleanName || cleanMsg.length < 2) {
      setPostError('Please enter your name and blessing message.');
      return;
    }

    setPosting(true);
    const wishRef = doc(collection(db, 'wishes'));

    try {
      await setDoc(wishRef, {
        guestName: cleanName,
        relationship: cleanRel,
        ceremony: 'Both Celebrations',
        message: cleanMsg,
        createdAt: serverTimestamp(),
      });

      void dispatchHostNotification({
        type: 'blessing',
        actorName: cleanName,
        summary: cleanRel ? `${cleanName} (${cleanRel}): "${cleanMsg}"` : `"${cleanMsg}"`,
      });

      setGuestName('');
      setRelationship('');
      setMessage('');
      setPostSuccess(true);
      window.setTimeout(() => setPostSuccess(false), 3000);
    } catch (err) {
      setPostError('Unable to post your blessing right now. Please try again.');
      handleFirestoreError(err, OperationType.CREATE, `wishes/${wishRef.id}`);
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteWish = async (wishId: string) => {
    setDeletingWishId(wishId);
    try {
      await deleteDoc(doc(db, 'wishes', wishId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `wishes/${wishId}`);
    } finally {
      setDeletingWishId(null);
    }
  };

  const handleDraftWithAi = async () => {
    setPostError(null);
    setDraftingAi(true);
    try {
      const response = await fetch('/api/ai/draft-blessing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestName.trim(),
          relationship: relationship.trim(),
          tone: 'Warm & Formal',
        }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        throw new Error(data.error || 'Unable to draft a blessing right now.');
      }
      setMessage(data.text.slice(0, FIELD_LIMITS.wishMessageMax));
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Unable to draft a blessing right now.');
    } finally {
      setDraftingAi(false);
    }
  };

  const hasRightColumn = loading || Boolean(loadError) || wishes.length > 0;

  return (
    <section id="blessings" className="scroll-mt-20 border-t border-[#efe0ea] py-10 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-8 lg:px-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease: EASE_EDITORIAL }}
        >
          <p className="label-caps text-[#8E3B6E]">Warm Wishes</p>
          <h2 className="editorial-section-title mt-2 font-medium text-[#231420]">
            Blessings <span className="italic shimmer-couple-accent">for the Couple</span>
          </h2>
          <p className="editorial-body mt-2 max-w-xl text-[#573D4F]">
            Share your heartfelt blessings for Prakhar &amp; Prakriti as they begin their new
            journey together.
          </p>
        </motion.div>

        <div
          className={`mt-6 sm:mt-8 ${
            hasRightColumn
              ? 'grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-12 lg:items-start'
              : 'max-w-xl'
          }`}
        >
          {/* Simple 3-Field Blessing Form */}
          <motion.form
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.45, ease: EASE_EDITORIAL }}
            onSubmit={handlePostWish}
            className={`space-y-4 rounded-3xl border border-[#e4cde0] bg-[#f8edf3] p-5 sm:p-6 ${
              hasRightColumn ? 'lg:col-span-5' : ''
            }`}
          >
            <div>
              <label
                htmlFor="wish-name"
                className="block text-[13px] font-semibold text-[#231420] sm:text-sm"
              >
                Your Name <span className="text-[#ba1a1a]">*</span>
              </label>
              <input
                id="wish-name"
                type="text"
                required
                maxLength={FIELD_LIMITS.wishNameMax}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your full name"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] placeholder:text-[#7A5E72]/80 focus:border-[#8E3B6E] focus:outline-none focus:ring-3 focus:ring-[#8E3B6E]/15 sm:min-h-[42px]"
              />
            </div>

            <div>
              <label
                htmlFor="wish-rel"
                className="block text-[13px] font-semibold text-[#231420] sm:text-sm"
              >
                Your Relation
              </label>
              <input
                id="wish-rel"
                type="text"
                maxLength={FIELD_LIMITS.wishRelationshipMax}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g., Uncle, Family Friend, Colleague"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2 text-sm text-[#231420] placeholder:text-[#7A5E72]/80 focus:border-[#8E3B6E] focus:outline-none focus:ring-3 focus:ring-[#8E3B6E]/15 sm:min-h-[42px]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="wish-msg"
                  className="block text-[13px] font-semibold text-[#231420] sm:text-sm"
                >
                  Blessing Message <span className="text-[#ba1a1a]">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleDraftWithAi}
                  disabled={draftingAi || posting}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-[#8E3B6E]/35 bg-[#fdf5f8] px-3 py-1 text-[11px] font-semibold text-[#8E3B6E] transition-colors hover:bg-[#efe0ea] disabled:opacity-60 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  <span>{draftingAi ? 'Drafting...' : 'Draft with AI'}</span>
                </button>
              </div>
              <textarea
                id="wish-msg"
                rows={3}
                required
                minLength={2}
                maxLength={FIELD_LIMITS.wishMessageMax}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your blessings for Prakhar & Prakriti..."
                className="mt-1.5 w-full rounded-xl border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-2.5 text-sm text-[#231420] placeholder:text-[#7A5E72]/80 focus:border-[#8E3B6E] focus:outline-none focus:ring-3 focus:ring-[#8E3B6E]/15"
              />
            </div>

            {postError && (
              <p
                role="alert"
                className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3.5 py-2 text-xs text-[#93000a]"
              >
                {postError}
              </p>
            )}

            {postSuccess && (
              <p
                role="status"
                className="rounded-xl border border-[#6B4C8C]/30 bg-[#EDE5F8] px-3.5 py-2 text-xs font-medium text-[#4A2E70]"
              >
                Thank you. Your blessing has been posted.
              </p>
            )}

            <button
              type="submit"
              disabled={posting}
              className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-full bg-[#8E3B6E] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#742D59] disabled:opacity-60 cursor-pointer sm:min-h-[38px]"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{posting ? 'Posting...' : 'Post Blessing'}</span>
            </button>
          </motion.form>

          {/* Scrollable Blessings List (rendered only when loading, error, or wishes exist) */}
          {hasRightColumn && (
            <div className="lg:col-span-7">
              {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[1, 2].map((skeleton) => (
                    <div
                      key={skeleton}
                      className="h-32 animate-pulse rounded-2xl border border-[#e4cde0] bg-[#f8edf3]"
                    />
                  ))}
                </div>
              ) : loadError ? (
                <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-6 text-sm text-[#573D4F]">
                  {loadError}
                </div>
              ) : (
                <div className="rounded-3xl border border-[#e4cde0]/85 bg-[#fdf5f8]/75 p-3 sm:p-4">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#7A5E72]">
                    <span className="font-semibold text-[#573D4F]">
                      {wishes.length} {wishes.length === 1 ? 'Blessing' : 'Blessings'} Shared
                    </span>
                    {wishes.length > 2 && <span>Scroll to read all</span>}
                  </div>

                  <div
                    aria-label="Scrollable list of family blessings"
                    className="blessings-scroll max-h-[340px] overflow-y-auto overscroll-contain pr-2 sm:max-h-[430px]"
                  >
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
                      {wishes.map((wish, idx) => (
                        <motion.article
                          key={wish.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.35,
                            delay: Math.min(idx * 0.04, 0.2),
                            ease: EASE_EDITORIAL,
                          }}
                          className="flex flex-col justify-between rounded-2xl border border-[#e4cde0] bg-[#f8edf3] p-4 sm:p-5"
                        >
                          <p className="editorial-body font-editorial italic text-[#231420]">
                            &ldquo;{wish.message}&rdquo;
                          </p>

                          <div className="mt-3.5 flex items-end justify-between gap-2 border-t border-[#efe0ea] pt-2.5 sm:mt-4 sm:pt-3">
                            <div>
                              <p className="text-[13px] font-semibold text-[#231420] sm:text-sm">
                                {wish.guestName}
                              </p>
                              {wish.relationship && (
                                <p className="text-[11px] text-[#7A5E72] sm:text-xs">
                                  {wish.relationship}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#7A5E72]">
                                {formatWishDate(wish.createdAt)}
                              </span>
                              {canModerate && (
                                <button
                                  type="button"
                                  disabled={deletingWishId === wish.id}
                                  onClick={() => handleDeleteWish(wish.id)}
                                  aria-label={`Delete blessing from ${wish.guestName}`}
                                  title="Delete blessing"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e4cde0] bg-[#fdf5f8] text-[#ba1a1a] transition-colors hover:bg-[#ffdad6]/50 disabled:opacity-50 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.article>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
