/**
 * AI drafting with Claude: writes a personalised first email (subject + body) and a "why I fit" line
 * for one contact, from the contact's fields, the user's own background (settings) and an optional
 * template used as a style/fact reference. Nothing is sent or saved here: the user reviews the draft
 * and schedules it through POST /emails. Disabled (status.enabled=false, 503) without ANTHROPIC_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { Router } from "express";
import { z } from "zod";
import { uid } from "../lib/auth.js";
import { HttpError, validateBody } from "../lib/http.js";
import { prisma } from "../lib/prisma.js";
import { rateLimit } from "../middleware/security.js";

export const aiRouter = Router();

const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "AI is not configured: set ANTHROPIC_API_KEY on the API");
  client ??= new Anthropic();
  return client;
}

aiRouter.get("/status", (_req, res) => {
  res.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY) });
});

const Draft = z.object({
  subject: z.string(),
  body: z.string(),
  whyFits: z.string(),
});

const draftSchema = z.object({
  contactId: z.string().min(1),
  templateId: z.string().min(1).nullish(),
  // Free text from the user: tone, length, things to mention ("mention my FYP on NLP").
  instructions: z.string().trim().max(2000).nullish(),
});

const SYSTEM = `You write cold outreach emails for a student or job seeker.
Two kinds of recipient:
- PROFESSOR: the sender wants a Master's/PhD position or supervision. Connect the sender's background to the professor's specific research. Be respectful and concrete; never flatter generically.
- COMPANY: the sender is applying for a job. Connect the sender's skills to the role and the company. Mention that the CV is attached only if the input says a CV will be attached.

Rules:
- Plain text body, no markdown, no placeholders like [Name] or {{...}}. Use only facts given in the input; never invent publications, grades, projects or experience.
- 120-200 words unless the user's instructions ask otherwise. Short paragraphs. One clear ask at the end.
- Greeting uses the recipient's name ("Dear Professor <Last name>," for professors, "Dear <Name>," for companies). Sign off with the sender's name if given.
- Subject: specific, under 80 characters.
- whyFits: one sentence (max 40 words) on why the sender fits this recipient, usable on its own.
- If a reference template is given, follow its facts about the sender and roughly its structure, but rewrite it for this recipient.`;

aiRouter.post(
  "/draft",
  rateLimit({ capacity: 10, refillPerMinute: 5 }),
  validateBody(draftSchema),
  async (req, res) => {
    const { contactId, templateId, instructions } = req.body as z.infer<typeof draftSchema>;
    const userId = uid(req);
    const anthropic = getClient();

    const [contact, template, user, cv] = await Promise.all([
      prisma.professor.findFirst({ where: { id: contactId, userId } }),
      templateId ? prisma.template.findFirst({ where: { id: templateId, userId } }) : null,
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.userCv.findUnique({ where: { userId }, select: { filename: true } }),
    ]);
    if (!contact) throw new HttpError(404, "Contact not found");
    if (templateId && !template) throw new HttpError(404, "Template not found");

    const input = {
      recipientKind: contact.kind,
      recipient: {
        name: contact.name,
        organisation: contact.university,
        role: contact.role,
        jobUrl: contact.jobUrl,
        country: contact.country,
        researchFocusOrSkills: contact.researchFocus,
        existingWhyFits: contact.whyFits,
        profileUrl: contact.profileUrl,
        notes: contact.notes,
      },
      sender: { name: user?.name ?? null, cvWillBeAttached: Boolean(cv) && contact.kind === "COMPANY" },
      referenceTemplate: template ? { subject: template.subject, body: template.body } : null,
      userInstructions: instructions ?? null,
    };

    let response;
    try {
      // Server-side fallback: if Claude Opus 5.5 declines, the API retries on a suitable model in the same call.
      response = await anthropic.beta.messages.parse({
        model: MODEL,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 16000,
        output_config: { effort: "medium", format: betaZodOutputFormat(Draft) },
        system: SYSTEM,
        messages: [{ role: "user", content: `Write the email for this input (JSON):\n${JSON.stringify(input, null, 2)}` }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new HttpError(429, "AI is busy; try again in a minute");
      if (err instanceof Anthropic.AuthenticationError) throw new HttpError(503, "AI key is invalid; check ANTHROPIC_API_KEY");
      if (err instanceof Anthropic.APIError) {
        console.error(`[ai] draft failed: ${err.status} ${err.name}`);
        throw new HttpError(502, "AI request failed; try again");
      }
      throw err;
    }
    if (response.stop_reason === "refusal") throw new HttpError(422, "AI declined to write this email; edit the details and retry");
    const draft = response.parsed_output;
    if (!draft) throw new HttpError(502, "AI returned an unreadable draft; try again");
    res.json({ subject: draft.subject.trim(), body: draft.body.trim(), whyFits: draft.whyFits.trim() });
  },
);
