import React, { useState } from 'react';
import { ExternalLink, MapPin, Send, Sparkles, X } from 'lucide-react';
import { WeddingConfig, WeddingEventRecord } from '../types/wedding';

interface WeddingConciergeAIProps {
  config: WeddingConfig;
  events: WeddingEventRecord[];
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const QUICK_PROMPTS = [
  'How do I reach the venue?',
  'What is the dress code?',
  'What are the ceremony timings?',
];

export const WeddingConciergeAI: React.FC<WeddingConciergeAIProps> = ({ config, events }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Namaste. Ask me anything about ${config.groomName.split(' ')[0]} & ${config.brideName.split(' ')[0]}'s wedding at ${config.venueName}, ${config.venueAddress}, ${config.venueCity} — timings, attire, directions, or confirming your family's presence.`,
    },
  ]);

  const askConcierge = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || loading) return;

    setError(null);
    setQuestion('');
    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
    };
    setTurns((prev) => [...prev, userTurn]);
    setLoading(true);

    const scheduleContext =
      events.length > 0
        ? events.map((ev) => ({
            title: ev.title,
            dateLabel: ev.dateLabel,
            time: ev.timeLabel,
            venue: ev.venue,
            dressCode: ev.dressCode,
          }))
        : [
            {
              title: config.haldiTitle,
              dateLabel: config.weddingDateLabel,
              time: config.haldiTime,
              venue: config.haldiVenue,
              dressCode: config.haldiDressCode,
            },
            {
              title: config.weddingTitle,
              dateLabel: config.weddingDateLabel,
              time: config.weddingTime,
              venue: config.weddingVenue,
              dressCode: config.weddingDressCode,
            },
          ];

    try {
      const response = await fetch('/api/ai/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: clean,
          weddingContext: {
            groomName: config.groomName,
            brideName: config.brideName,
            hostsName: config.hostsName,
            weddingDateLabel: config.weddingDateLabel,
            venueName: config.venueName,
            venueAddress: config.venueAddress,
            venueCity: config.venueCity,
            googleMapsUrl: config.googleMapsUrl,
            events: scheduleContext,
          },
        }),
      });

      const data = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !data.answer) {
        throw new Error(data.error || 'Unable to get a response right now.');
      }

      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.answer as string,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Wedding Assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askConcierge(question);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Wedding Assistant"
          className="fixed right-4 bottom-18 z-40 inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#8E3B6E]/35 bg-[#8E3B6E] px-4 py-2 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] hover:bg-[#742D59] md:right-6 md:bottom-6 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Wedding Assistant</span>
        </button>
      )}

      {open && (
        <aside
          aria-label="Wedding Concierge Assistant"
          className="fixed right-3 bottom-18 left-3 z-50 flex max-h-[72vh] flex-col overflow-hidden rounded-3xl border border-[#e4cde0] bg-[#fdf5f8] shadow-2xl sm:left-auto sm:w-[380px] md:right-6 md:bottom-6"
        >
          <div className="flex items-center justify-between border-b border-[#efe0ea] bg-[#f8edf3] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8E3B6E]/15 text-[#8E3B6E]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-editorial text-sm font-semibold text-[#231420]">
                  Wedding Concierge
                </p>
                <p className="text-[11px] text-[#7A5E72]">
                  {config.venueName}, {config.venueAddress}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Wedding Assistant"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#573D4F] hover:bg-[#efe0ea] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    turn.role === 'user'
                      ? 'bg-[#8E3B6E] text-white'
                      : 'border border-[#e4cde0] bg-[#f8edf3] text-[#231420]'
                  }`}
                >
                  {turn.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[#e4cde0] bg-[#f8edf3] px-3.5 py-2 text-[#7A5E72]">
                  Checking wedding details...
                </div>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/50 px-3 py-2 text-[11px] text-[#93000a]"
              >
                {error}
              </p>
            )}

            {config.googleMapsUrl && (
              <a
                href={config.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#8E3B6E]/30 bg-[#f8edf3] px-3 py-1.5 text-[11px] font-semibold text-[#8E3B6E] hover:bg-[#efe0ea]"
              >
                <MapPin className="h-3 w-3" aria-hidden="true" />
                <span>Open Venue in Google Maps</span>
                <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="border-t border-[#efe0ea] bg-[#f8edf3] px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => askConcierge(q)}
                  className="rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-2.5 py-1 text-[11px] font-medium text-[#573D4F] transition-colors hover:border-[#8E3B6E] hover:text-[#231420] cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={400}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about timings, dress code, venue..."
                className="min-h-[38px] flex-1 rounded-full border border-[#e4cde0] bg-[#fdf5f8] px-3.5 py-1.5 text-xs text-[#231420] placeholder:text-[#7A5E72] focus:border-[#8E3B6E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                aria-label="Send question"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#8E3B6E] text-white hover:bg-[#742D59] disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
};
