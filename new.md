

Decisions And Learnings

Last updated

Sep 10, 2026

Summary



Locked schema design decisions, content-integrity rules, and hard-won lessons including the disk reversion problem



Details

Schema design principles (locked in)

Free episode logic is computed, not stored as a per-row boolean

Coin transaction ledger with a cached balance on profiles

Unique constraint on user+episode for unlocks

Paystack reference used as the idempotency key for purchases

Subscriptions live in a separate table, distinct from one-time purchases

Content integrity

No fabricated content, ever — no placeholder statistics, invented numbers, or fake functionality anywhere in the app; honest "coming soon" states only

Known problems

Reversion problem: work from previous sessions has quietly reverted on disk; flagged multiple times and traced to something in the local environment rather than Claude Code itself, not yet fully resolved — worth checking disk state proactively









NARRAVA

Last updated

Sep 10, 2026

Summary

NARRAVA — Narrava — a vertical short-drama streaming web app for Nollywood content, built solo for two partners.







AVA



A vertical shorts film like drama box



Identity verification required



Verify your identity to keep using Claude.



Recents





Checking Narrava area file context

Yesterday





DEVELOPMENT\_NARRAVA

2 days ago





NARRAVA\_Research

Aug 22

Instructions



This project is for Narrava, a real paid client build for Abba and Sam, not a demo or portfolio piece. Treat all code, pricing, and client communication as production and financial matters. Tech stack: HTML, CSS, JavaScript, Supabase (Postgres, Auth, Edge Functions), Paystack, Bunny Stream, Vercel, PWA with Android/iOS packaging planned. Documents (proposals, client messages) follow strict rules: no dashes or hyphens anywhere in text, no colored tables or headings, plain human toned writing, not AI sounding. I am a self taught developer, strong in HTML, CSS, and Supabase setup, but genuinely weak in JavaScript logic, especially async/await, promises, and security critical code. Do not assume I will catch subtle bugs on my own. Explain reasoning in plain terms, not just correct code. The highest risk areas in this build are Paystack webhook signature verification, Supabase RLS policies, idempotency on payment webhooks, and the anonymous to registered session merge for the social funnel. Any code touching these areas needs explicit security review, every time, not just once.



Memory

Only you



View and manage what Claude remembers from your chats.



We’ve migrated to a new memory system. You have 13 days left if you’d like to export this project’s legacy memory.



Context

46% of project capacity used

narrava\_full\_project\_tracker\_0.md



4.8kB



MD



narrava\_mockup.html



462kB



HTML



NARRAVA\_PROJECT\_PROPOSAL (2).docx



7.3kB



DOCX



Ways Of Working

Last updated

Sep 10, 2026

Summary



How work is divided between Claude chat and Claude Code, security review triggers, prompt discipline, and client communication rules



Details

Work division

All Supabase work (SQL schema, RLS, Edge Functions, anything using the service role key) is designed and written in Claude chat, then deployed manually by Kabantiok

Claude Code CLI handles frontend wiring, PWA shell, and non-sensitive display logic

All Claude Code output is reviewed in chat before acceptance, with Claude reading every file and translating what matters into plain language rather than expecting Kabantiok to audit JS directly

Claude Code model selection: Sonnet 5 as daily driver to preserve Pro plan budget; Opus reserved for genuinely complex reasoning

Dev environment: Claude Code CLI inside VS Code, local project folder, Claude Pro

Security rules

Immediate stop rule: any Claude Code diff touching environment files, service role keys, or raw SQL triggers an immediate stop regardless of apparent intent

RLS is the security boundary — Claude Code never touches Supabase through anything other than a real logged-in session under RLS; no direct database connections, no service role key exposure on the frontend

Six standing security review triggers requiring manual review every time: Paystack webhook signature verification, Supabase RLS policies, idempotency on payment webhooks, anonymous-to-registered session merge logic, server-side ad completion verification before granting coins, and never trusting client-sent prices or entitlement flags

Prompt discipline and references

Reference real files already in the project folder rather than written descriptions

Visual reference fidelity: written descriptions of a visual reference lose critical detail — instruct Claude Code to visit the real reference site directly or study real screenshots already in the project folder before writing any code, then compare its own output against the reference side by side before reporting done

Visual references: reelshort.com and DramaBox; real screenshots stored in the project folder are preferred over written descriptions

Communication

Kabantiok communicates primarily via voice-to-text; messages often contain transcription errors and phonetic approximations of technical terms — interpret rather than read literally

Client messages to Abba and Sam open with "Good morning sir" — never "Hi guys"

Client messages use no dashes or hyphens anywhere in the text

Client messages use no colored headings and no tables

Client messages use a plain human tone, not a report

Client report structure has five parts: one-line summary, outcomes not code, what's next, anything needed from partners, kept short











Preferences

Last updated

Sep 1, 2026

Summary



How Zidyep wants responses formatted and addressed



Details

Prefers to be called Zidyep, not KZD or similar abbreviations

Prefers concise, design-forward documents over dense, text-heavy course-note-style output

Wants short, direct replies in chat — no long build-up or preamble, get straight to the answer

When Claude drafts messages for him to send, wants them in his own casual voice with no dashes and no pidgin/broken English — flagged earlier drafts as sounding "too fake and AI-ish"









Profile

Last updated

Sep 15, 2026

Summary



Who Zidyep is — student, solo SaaS founder, self-taught developer



Details

Full name: Zidyep Kabantiok David

Goes by Zidyep

Born 13 September 2008 (turned 18 in 2026)

200-level Applied Geophysics student at the Federal University of Technology Minna (FUTMINNA), Nigeria

Runs QuoteChase (getquotechase.com), a solo B2B SaaS tool that automates quote follow-ups for service businesses

Operates a paid web development mentorship on weekends

Self-taught full-stack developer working primarily in vanilla HTML/CSS/JS, Supabase, Vercel, Dodo Payments, and Paystack

GitHub username: davetechk







NARRAVA

Last updated

Aug 30, 2026

Summary



NARRAVA — vertical short-drama streaming app Zidyep is building for his brother's media company



Details

Vertical short-form drama streaming platform (DramaBox-style, 2–3 minute vertical episodes), assigned by his brother for the brother's media company, built with a partner of the brother's involved

Stack is his usual vanilla HTML/CSS/JS + Supabase, with a third-party video service (Cloudflare Stream, Mux, or Bunny.net) alongside for the streaming pipeline

Payment for the build comes after the brother secures investors/funding; maintenance terms to be discussed once the project is funded

Actively building it as of late August 2026; wants to verify the payment and webhook layer himself rather than trust Claude Code with it

Related work in progress: las-noches, quotechase









This project is for Narrava, a real paid client build for Abba and Sam,

not a demo or portfolio piece. Treat all code, pricing, and client

communication as production and financial matters.



Tech stack: HTML, CSS, JavaScript, Supabase (Postgres, Auth, Edge

Functions), Paystack, Bunny Stream, Vercel, PWA with Android/iOS

packaging planned.



Documents (proposals, client messages) follow strict rules: no dashes

or hyphens anywhere in text, no colored tables or headings, plain

human toned writing, not AI sounding.



I am a self taught developer, strong in HTML, CSS, and Supabase setup,

but genuinely weak in JavaScript logic, especially async/await,

promises, and security critical code. Do not assume I will catch

subtle bugs on my own. Explain reasoning in plain terms, not just

correct code.



The highest risk areas in this build are Paystack webhook signature

verification, Supabase RLS policies, idempotency on payment webhooks,

and the anonymous to registered session merge for the social funnel.

Any code touching these areas needs explicit security review, every

time, not just once.

