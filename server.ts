import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const PORT = 3000;
const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithRetry(
  ai: GoogleGenAI,
  contents: string,
  systemInstruction: string
): Promise<string> {
  const maxAttempts = 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const text = (response.text ?? '').trim();
      if (!text) {
        throw new Error('Empty response received from Gemini.');
      }
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  throw lastError;
}

function formatAiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Please check your GEMINI_API_KEY in the Settings > Secrets panel.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI assistant is momentarily busy. Please try again in a few seconds.',
    };
  }
  return {
    status: 500,
    message: 'Unable to generate an AI response right now. Please try again.',
  };
}

interface ConciergeEventContext {
  title?: string;
  dateLabel?: string;
  time?: string;
  venue?: string;
  dressCode?: string;
}

interface ConciergeBody {
  question?: string;
  weddingContext?: {
    groomName?: string;
    brideName?: string;
    hostsName?: string;
    weddingDateLabel?: string;
    venueName?: string;
    venueAddress?: string;
    venueCity?: string;
    googleMapsUrl?: string;
    events?: ConciergeEventContext[];
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/notify-host/status', (_req, res) => {
    const recipientEmail = (process.env.NOTIFY_TO_EMAIL || 'prakhar.saxena579@gmail.com').trim();
    const gmailConfigured = Boolean(process.env.GMAIL_APP_PASSWORD);
    const resendConfigured = Boolean(process.env.RESEND_API_KEY);
    const ntfyConfigured = Boolean(process.env.NTFY_TOPIC);
    res.json({
      recipientEmail,
      emailConfigured: gmailConfigured || resendConfigured,
      pushConfigured: ntfyConfigured,
    });
  });

  app.post('/api/notify-host', async (req, res) => {
    const type = req.body?.type === 'blessing' ? 'blessing' : 'rsvp';
    const actorName = String(req.body?.actorName ?? '').trim().slice(0, 120) || 'Wedding Guest';
    const summary = String(req.body?.summary ?? '').trim().slice(0, 500) || 'New wedding update';
    const recipientEmail = (process.env.NOTIFY_TO_EMAIL || 'prakhar.saxena579@gmail.com').trim();

    const subject =
      type === 'blessing'
        ? `[Wedding Blessing] New wish from ${actorName}`
        : `[Wedding RSVP] ${actorName} updated attendance`;

    const textBody = [
      `Prakhar & Prakriti Wedding Alert`,
      `--------------------------------`,
      `Event: ${type === 'blessing' ? 'New Blessing Posted' : 'Family RSVP Confirmation'}`,
      `From: ${actorName}`,
      `Details: ${summary}`,
      ``,
      `Review or manage in the Wedding Admin.`,
    ].join('\n');

    let emailSent = false;
    let pushSent = false;
    const errors: string[] = [];

    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    const gmailSender = (process.env.GMAIL_SENDER_EMAIL || 'prakharsaxena579@gmail.com').trim();
    const resendKey = process.env.RESEND_API_KEY;
    const ntfyTopic = process.env.NTFY_TOPIC;

    if (gmailPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailSender,
            pass: gmailPass,
          },
        });
        await transporter.sendMail({
          from: `"Saxena Wedding Admin" <${gmailSender}>`,
          to: recipientEmail,
          subject,
          text: textBody,
        });
        emailSent = true;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Gmail SMTP send failed');
      }
    } else if (resendKey) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Saxena Wedding <onboarding@resend.dev>',
            to: [recipientEmail],
            subject,
            text: textBody,
          }),
        });
        if (r.ok) {
          emailSent = true;
        } else {
          errors.push(`Resend HTTP ${r.status}`);
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Resend send failed');
      }
    }

    if (ntfyTopic) {
      try {
        const r = await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic.trim())}`, {
          method: 'POST',
          headers: {
            Title: subject,
          },
          body: `${actorName}: ${summary}`,
        });
        if (r.ok) pushSent = true;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'ntfy push failed');
      }
    }

    res.json({
      ok: true,
      recipientEmail,
      emailSent,
      pushSent,
      emailConfigured: Boolean(gmailPass || resendKey),
      errors,
    });
  });

  app.post('/api/ai/draft-blessing', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Check Settings > Secrets in AI Studio.',
      });
      return;
    }

    const guestName = String(req.body?.guestName ?? '').trim().slice(0, 80);
    const relationship = String(req.body?.relationship ?? '').trim().slice(0, 60);
    const tone = String(req.body?.tone ?? 'Warm & Formal').trim().slice(0, 40);

    const prompt = [
      `Write a heartfelt wedding blessing for Prakhar and Prakriti (wedding hosted by Vijay & Shipra Saxena on February 2, 2027 at Love Kush Vatika, Bithoor, Kanpur, Uttar Pradesh).`,
      guestName ? `Sender name: ${guestName}.` : 'Sender: A loving wedding guest.',
      relationship ? `Relationship to the family/couple: ${relationship}.` : '',
      `Tone requested: ${tone}.`,
      `Keep it concise (2 to 3 natural, dignified sentences, under 320 characters) suitable for an Indian wedding blessings wall. Output only the blessing text without quotes or placeholders.`,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const text = await generateWithRetry(
        ai,
        prompt,
        'You compose graceful, sincere, concise Indian wedding blessings in English. Never include hashtags, emojis, or quotation marks.'
      );
      res.json({ text: text.replace(/^["']|["']$/g, '').slice(0, 450) });
    } catch (err) {
      const formatted = formatAiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/concierge', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Check Settings > Secrets in AI Studio.',
      });
      return;
    }

    const body = (req.body ?? {}) as ConciergeBody;
    const question = String(body.question ?? '').trim().slice(0, 400);
    if (!question) {
      res.status(400).json({ error: 'Please enter a question for the wedding concierge.' });
      return;
    }

    const ctx = body.weddingContext ?? {};
    const eventsSummary = Array.isArray(ctx.events)
      ? ctx.events
          .slice(0, 10)
          .map(
            (ev) =>
              `- ${ev.title ?? 'Ceremony'} (${ev.dateLabel ?? ''}, ${ev.time ?? ''}) at ${ev.venue ?? ''}${ev.dressCode ? `; Dress Code: ${ev.dressCode}` : ''}`
          )
          .join('\n')
      : '';

    const systemInstruction = [
      'You are the gracious Wedding Concierge for the wedding of Prakhar & Prakriti, hosted by Vijay & Shipra Saxena.',
      'Answer guest questions warmly, concisely (2 to 4 short sentences), and accurately using ONLY the wedding details provided below.',
      'If a guest asks how to confirm attendance, guide them to the "Please Do Come With Your Family" section where they can search the head of their family name, tap Confirm Presence, and verify their mobile number.',
      'If a detail (such as private phone numbers, hotel room allocations, or menu items not listed) is unavailable, politely advise contacting the Saxena family directly.',
    ].join(' ');

    const prompt = [
      `Wedding Facts:`,
      `Couple: ${ctx.groomName ?? 'Prakhar'} & ${ctx.brideName ?? 'Prakriti'}`,
      `Hosted by: ${ctx.hostsName ?? 'Vijay & Shipra Saxena'}`,
      `Date: ${ctx.weddingDateLabel ?? 'Tuesday, February 2, 2027'}`,
      `Main Venue: ${ctx.venueName ?? 'Love Kush Vatika'}, ${ctx.venueAddress ?? 'Bithoor'}, ${ctx.venueCity ?? 'Kanpur, Uttar Pradesh'}`,
      ctx.googleMapsUrl ? `Google Maps Link available on page.` : '',
      eventsSummary ? `Schedule:\n${eventsSummary}` : '',
      `\nGuest Question: ${question}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const answer = await generateWithRetry(ai, prompt, systemInstruction);
      res.json({ answer });
    } catch (err) {
      const formatted = formatAiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/ai/personalize-invite', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Check Settings > Secrets in AI Studio.',
      });
      return;
    }

    const headOfFamilyName = String(req.body?.headOfFamilyName ?? '').trim().slice(0, 120);
    const side = String(req.body?.side ?? "Groom's Family").trim().slice(0, 40);
    const note = String(req.body?.note ?? '').trim().slice(0, 200);

    if (!headOfFamilyName) {
      res.status(400).json({ error: 'Enter the Head of Family name first to personalize.' });
      return;
    }

    const prompt = [
      `Write a warm, respectful 2-sentence WhatsApp/SMS wedding welcome message starting with "Hello ${headOfFamilyName}," from the Saxena family (Vijay & Shipra Saxena) inviting them (${side}) to Prakhar & Prakriti's wedding on February 2, 2027 at Love Kush Vatika, Bithoor, Kanpur, Uttar Pradesh.`,
      note ? `Context note: ${note}.` : '',
      `End with a polite reminder to mark their presence and stay tuned along with this exact link: https://saxenas-wedding.ai.studio`,
      `Keep it natural, under 300 characters, and ready to send over WhatsApp or SMS without surrounding quotation marks.`,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const message = await generateWithRetry(
        ai,
        prompt,
        'You craft courteous, warm Indian family wedding invitations for WhatsApp and SMS. Output only the final message text.'
      );
      res.json({ message: message.replace(/^["']|["']$/g, '').slice(0, 320) });
    } catch (err) {
      const formatted = formatAiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
