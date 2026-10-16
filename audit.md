# Narrava pre-launch audit

- **Audit date:** 2026-10-13
- **Code audited:** `main` at `f502a09`. Fixes for SEC-001/002/003, VID-001/002 and PAY-002 were then made on request (uncommitted; see the [Remediation log](#22-remediation-log))
- **Deployment observed:** `https://narrava.vercel.app` (serves `narrava-shell-v42`, the same build as `f502a09`)
- **Supabase project:** `bzbowtnupdduakoghtqf`
- **Previous audit:** none. No `audit.md` existed before this one.

> **Read this first.** Most of Narrava's security lives in Supabase and in Edge Functions whose source is **not in this repository**. That covers RLS policies, RPC bodies, `paystack-init`, the Paystack webhook, `bunny-signed-playback-url`, `admin-suspend-user` and `bunny-*`.
>
> This audit could only:
> - read the frontend code;
> - make read-only requests as the public `anon` role;
> - make read-only requests to Bunny and the Vercel site.
>
> It could not run tests as a signed-in user (that needs test accounts). It could not call the Edge Functions: a probe was blocked by the session's safety controls because some of those functions delete videos or suspend users.
>
> **None of the payment, entitlement or admin server logic has been verified.** Section 23 lists exactly what is needed to finish that work.

---

## 1. Executive summary

**Fixed after the audit, on request (not yet deployed):** SEC-001, SEC-002 (headers pending a deploy to verify), SEC-003, VID-001, VID-002, PAY-002.
- **SEC-001: stored XSS.** Series titles, genre names and cover URLs were inserted into the page as raw HTML in the consumer app and in some admin views, and the shared `escapeHtml` didn't escape quotes. Anyone who can write a series row (any admin, or anyone if the `series` policy is ever loosened) could run script in every viewer's browser. That includes admins' browsers, and the app and admin panel share one login session.

**Confirmed launch blockers:**
- **OPS-001:** `support@narrava.com` cannot receive email. `narrava.com` publishes a *null MX* record, and `www.narrava.com` is a parked "lander" page. Support, the privacy policy's contact and its data-rights process all point to that address.
- **LEG-001:** the privacy policy is not launch-ready.
  - It still has `[DATE]`, `[LEGAL COMPANY NAME]`, `[REGISTERED ADDRESS]` and `[MINIMUM AGE]`.
  - It says payments and ads launch "later", but in production coin payments, subscriptions *and* ad unlock are all switched **on**.
  - It doesn't name Google, which receives data as soon as someone taps Watch ad.
- **QA-001:** 3 of the 4 published series point at Bunny videos that don't exist (404), so most of the catalogue can't play.

**Confirmed medium-severity issues:**
- **ADS-001:** Ad Unlock is live in production with Google's public **test** ad unit. People earn real episode unlocks (up to 15 per account per day) and Narrava earns nothing.
- **AUTH-001 / ABUSE-001:** email confirmation is off. Anyone can create unlimited accounts with made-up or someone else's email, each getting 5 free coins and the daily ad allowance.
- **SEC-002:** the live site sends no CSP, no anti-framing header, no `nosniff` and no Referrer-Policy. *(Fixed in code; takes effect on deploy.)*
- **SEC-003:** every page, including the admin pages, loads `supabase-js@2` from jsDelivr with a floating major version and no integrity hash. *(Fixed in code.)*

**What was verified to be in good shape** (anon role only):
- No secrets in the repo or its git history; the only JWT is the public `anon` key.
- The schema endpoint is closed to the anon key.
- The anon role reads **0 rows** from: `profiles`, `purchases`, `coin_transactions`, `subscriptions`, `episode_unlocks`, `watch_progress`, `series_likes`, `series_saves`, `comment_likes`, `page_visits`.
- `ad_views`, `episode_views` and `series_shares` refuse the anon role entirely.
- Bunny's embed player refuses a locked episode without a token.
- `.git` isn't served on Vercel.
- HSTS is on.
- The frontend never sends prices, amounts, coin counts or user ids to payment or unlock functions.

## 2. Final launch verdict

**NOT READY — VERIFICATION INCOMPLETE**, with confirmed blockers.

There is no confirmed Critical issue. A GO isn't possible because:
- the payment webhook, `paystack-init`, every coin and ad RPC, the admin RPCs and Edge Functions, and the authenticated-role RLS policies have **not** been verified;
- OPS-001, LEG-001 and QA-001 are confirmed and unresolved.

## 3. Scope, methodology and limitations

**Phases run:**
- **A — Inventory:** the whole repo; `DOCUMENTATION.md` read in full.
- **B — Static review:** all 38 JS files, 12 HTML pages, `sw.js` and `manifest.json`.
- **C — Backend review:** only what the anon role can see. The definitions themselves aren't in the repo.
- **D — Dynamic checks:** read-only, anon role only.
- **E — Regression:** the audit itself made no code changes (an early SEC-001 trial was reverted).
- **F — Remediation (separate request):** SEC-001, SEC-002, SEC-003, VID-001, VID-002 and PAY-002, each tested as recorded in §19 and §22.

**Method used for dynamic checks:**
- `HEAD` requests with `Prefer: count=exact`. These return only a row count, never row data.
- One-row column-name checks on public catalogue tables.
- `GET /auth/v1/settings`.
- `GET` on Bunny's embed player for one locked episode.
- `HEAD`/`GET` on the Vercel site.

No data was written anywhere. No account was created. No payment was started.

**Not done, and why:**

| Not done | Reason |
|---|---|
| Any test as an `authenticated` user (anonymous or email) | Needs a test account. Creating one writes to production Auth. The project rules (`new.md`) also say not to. |
| `POST` to Edge Functions | Blocked by the session's safety controls. Some functions delete videos or suspend users, so they shouldn't be probed in production. |
| Paystack webhook / `paystack-init` tests | Needs Paystack **test** mode and a staging project. Must never touch live keys. |
| Concurrency / double-spend tests | Need staging and test accounts. |
| iOS Safari, Android, installed PWA | No devices available. |
| Backups, monitoring, DNS ownership | Need dashboard access. |

## 4. Architecture and trust boundaries

```
Browser (untrusted)                      Supabase (trusted, NOT in repo)           Third parties
 narrava/index.html + js/*.js  ──JWT──▶  Auth (anon + email; autoconfirm ON)
 narrava/admin/*.html          ──JWT──▶  PostgREST + RLS  (tables, RPCs)
 Cache Storage / IndexedDB               Edge Functions:                        ──▶ Bunny Stream (token auth)
 (downloads; not a boundary)               bunny-signed-playback-url           ──▶ Paystack (inline + webhook)
                                           paystack-init, webhook               ──▶ Google GPT (rewarded ads)
                                           bunny-upload-init, bunny-delete-video   jsDelivr (supabase-js, hls, tus)
                                           admin-suspend-user                    Google Fonts
Hosting: Vercel (static), HSTS only.
```

**Trust boundaries:**
- Browser → PostgREST: RLS is the only control.
- Browser → Edge Functions: each function must authenticate the JWT and authorise the action itself.
- Paystack → webhook: the signature check is the only control.
- Browser → Bunny CDN: the signed token is the only control.
- Admin panel: it's static files, so every check must be server-side. Admin and consumer share one origin and one stored session, so XSS anywhere on the origin means admin session theft.

**Assets:**
- user accounts and emails;
- coin balances and the coin ledger;
- subscriptions;
- paid episodes (video);
- purchase records;
- admin privileges;
- the Bunny library (upload/delete);
- analytics.

## 5. Findings summary by severity

| ID | Title | Severity | Status |
|---|---|---|---|
| OPS-001 | Support email domain can't receive mail (null MX); policy contact unusable | High | OPEN |
| LEG-001 | Privacy policy has placeholders and is inaccurate while payments and ads are live | High | OPEN |
| VER-001 | Payment, entitlement, admin and RLS server logic unverifiable; source not in repo | High (verification gap) | NOT VERIFIED |
| QA-001 | 3 of 4 published series have nonexistent Bunny videos | Medium (High for launch) | OPEN |
| SEC-001 | Stored XSS via series title / genre name / cover URL; `escapeHtml` didn't escape quotes | Medium | FIXED — VERIFIED |
| ADS-001 | Ad Unlock live with Google's test ad unit | Medium | OPEN |
| ABUSE-001 | Unlimited free accounts → repeated welcome coins and ad unlocks | Medium | OPEN |
| AUTH-001 | Email confirmation off (email squatting, unverified addresses) | Medium | OPEN |
| SEC-002 | No CSP / frame-ancestors / nosniff / Referrer-Policy on the live site | Medium | FIXED — PENDING DEPLOY VERIFICATION |
| SEC-003 | Floating `supabase-js@2` from a CDN with no SRI, on admin pages too | Medium | FIXED — VERIFIED |
| ABUSE-002 | Anonymous accounts can comment; no visible rate or length limits | Medium | NOT VERIFIED |
| PRIV-002 | No way to delete an account (email route broken by OPS-001) | Medium | OPEN |
| AUTH-002 | Minimum password length 6 | Low | OPEN |
| PRIV-001 | Anyone can read all comment rows directly, including commenters' user ids | Low | OPEN |
| DATA-001 | `page_visits` takes a client-chosen timestamp; unlimited inserts | Low | NOT VERIFIED |
| SOC-001 | Usernames aren't unique or reserved (impersonation in comments) | Low | OPEN |
| VID-001 | Missing `expiresAt` makes the player re-sign in a tight loop | Low | FIXED — VERIFIED |
| VID-002 | A fatal 401/403 during playback leaves the player stuck | Low | FIXED — VERIFIED |
| PAY-002 | Every refund status shows the "Nigerian card" message | Low | FIXED — VERIFIED |
| AUTH-003 | Sign-up reveals whether an email is registered | Low | OPEN (accepted by design?) |
| UX-001 | `protect.js`: 100 ms `debugger` loop and global copy/select blocking | Low | OPEN |
| CONT-001 | All episodes' `bunny_video_id`s are public | Informational | NOT REPRODUCED (no bypass found) |
| OFF-001 | Offline files readable by anyone using the device | Informational | ACCEPTED RISK (documented) |
| OPS-002 | No backups / monitoring / incident evidence | Informational | NOT VERIFIED |

## 6. Critical findings

None confirmed. Payments, entitlements and admin authorisation are **NOT VERIFIED** (VER-001), so a Critical issue may still exist there.

## 7. High findings

### [OPS-001] Support email domain cannot receive email

- **Severity:** High
- **Status:** OPEN
- **Category:** Operations / Legal
- **Affected component:**
  - `narrava/js/help.js` (`SUPPORT_EMAIL`)
  - `index.html` (Help & Feedback)
  - `PRIVACY_POLICY.md` / `privacy.html` (contact and "Your rights")
  - DNS for `narrava.com`
- **Evidence:**
  - `nslookup -type=mx narrava.com` → `MX preference = 0, mail exchanger = (root)`. That is an RFC 7505 null MX: the domain explicitly accepts no mail.
  - `https://www.narrava.com` returns a parked page that redirects to `/lander`.
  - The app itself is hosted at `narrava.vercel.app`.
- **Root cause:** the support address uses a domain that isn't set up for mail and may not be owned by the client.
- **Scenario:** a user asks for data deletion, reports a payment problem, or reports abuse. The mail bounces, or never arrives.
- **Impact:**
  - Data-rights requests can't be met. The policy promises replies "within 30 days".
  - Payment disputes go unanswered and turn into chargebacks.
  - The policy's only contact is unreachable.
- **Reproduction:** `nslookup -type=mx narrava.com`
- **Expected:** a monitored mailbox on a domain the client controls.
- **Recommended fix:**
  1. Confirm who owns `narrava.com`.
  2. If it's the client's, add real MX records and a monitored mailbox.
  3. Otherwise, change `SUPPORT_EMAIL`, the Help screen and both policy files to an address that works.
- **Changes made:** none. This needs the owner's decision.
- **External action:** DNS / registrar / mailbox.

### [LEG-001] Privacy policy is not launch-ready and doesn't match production

- **Severity:** High
- **Status:** OPEN
- **Category:** Legal / Privacy
- **Affected component:** `PRIVACY_POLICY.md`, `narrava/privacy.html`; production `app_settings`
- **Evidence:**
  - The four placeholders appear in both files.
  - The live `app_settings` (public read) has `coin_purchases_enabled: true`, `subscriptions_enabled: true` and `ad_unlock_enabled: true`.
  - The policy says payments run "when paid features launch" and ads "when ad supported features launch". It says it will name the ad partner "before ads go live".
  - `ads.js` loads Google's `gpt.js` when a user taps Watch ad. No consent step exists.
  - The policy also doesn't mention:
    - subscriptions or VIP;
    - offline downloads stored on the device;
    - jsDelivr (which receives the visitor's IP on every page load);
    - Paystack's own script loading in the page.
- **Impact:** a misleading public policy while real money and ad data flows are live. Platform-review and regulatory exposure (for example Nigeria's NDPA 2023) are for counsel to judge. This audit doesn't give legal advice.
- **Recommended fix:**
  - The owner and counsel fill in the legal entity, address, effective date and minimum age.
  - Describe payments, subscriptions, ads (name Google), downloads and the CDNs.
  - Add consent before ad requests where the law requires it.
  - Either turn Ad Unlock off until this is done, or finish it before launch.
  - Mirror every change into `privacy.html` word for word (per `DOCUMENTATION.md`).
- **Changes made:** none. Legal text must not be invented.
- **External action:** legal review; a terms of service, which doesn't exist yet (refunds, coins, subscriptions, download rules).

### [VER-001] Server-side security can't be verified from this repository

- **Severity:** High (verification gap)
- **Status:** NOT VERIFIED
- **Category:** Security / Payments
- **Affected component:**
  - every RLS policy;
  - every RPC listed in `DOCUMENTATION.md` (Coins, Ads, Admin and the other functions);
  - all Edge Functions and the Paystack webhook;
  - the profile-creation trigger;
  - storage policies on `cover-images`.
- **Evidence:** `DOCUMENTATION.md`, "Most of the backend isn't in this repo". There is no `supabase/` folder. The anon-role probes in §10 are the only backend evidence.
- **Impact:** the controls that stop coin forgery, paid-content bypass and admin takeover can't be reviewed. If the project is lost, it can't be rebuilt.
- **Recommended fix:** export the schema, policies, functions and Edge Function source into the repo (`supabase db dump --schema public,storage`, plus `supabase functions download <name>`). Then run the staging tests in §23.
- **External action:** owner access to Supabase.

## 8. Medium findings

### [QA-001] Most of the catalogue can't be played

- **Severity:** Medium (launch blocker for content)
- **Status:** OPEN
- **Category:** Reliability / Content
- **Evidence:**
  - Live, during this session: "My Maiden Slave" Ep 1 → Bunny 404 for video id `94884995005` → "Couldn't load this episode".
  - `DOCUMENTATION.md` §10 says the same about "My Maiden Slave", "The Golden Age" and "Midnight Wolf". All three are **published** (the anon count of published series is 4).
- **Impact:**
  - Users see broken videos.
  - Each one burns about 8 s of retries in the feed preload.
  - Paying users could buy coins or subscriptions for content that doesn't play.
- **Recommended fix:** unpublish these series or upload real videos before launch.
- **External action:** content / admin panel.

### [SEC-001] Stored XSS through series titles, genre names and cover URLs

- **Severity:** Medium
  - Writing to `series` and `genres` needs admin rights under the documented policy. The impact is session theft for every viewer, including admins, because the app and admin panel share one origin and session.
  - If the `series` / `genres` write policy is ever broader than admin-only, this is **Critical**. That policy is NOT VERIFIED.
- **Status:** FIXED — VERIFIED (locally; not deployed)
- **Category:** Security
- **Affected component** (line numbers at `f502a09`):

  **Raw HTML in the consumer app:**
  - `js/discover.js:30,42` (`posterCardHtml`: title, `<img src>`)
  - `:146` (genre chip names)
  - `:236` (shelf titles, which include genre names)
  - `:352` (hero tags)
  - `:419,422` (hero thumbnails)
  - `:507,509,515` (search grid)
  - `js/app.js:749` (`<img src>`), `:1052` (feed title)
  - `js/watch.js:293` (tags)

  **Admin cover URLs in a `style="…"` attribute with only `'` removed:**
  - `js/admin-dashboard.js:69`
  - `js/admin-most-watched.js:7`
  - `js/admin-series-list.js:41,81`

  **The shared helper:** `escapeHtml` (`js/shared-utils.js:6`) didn't escape `"` or `'`. It's used inside double-quoted attributes in `history.js`, `downloads.js`, `admin-users.js:47,61`, `admin-episodes.js:60,251,253`, `admin-genres.js:40`, `coins.js` and others.
- **Root cause:** HTML built by string concatenation, with an escape helper that only covered text content.
- **Attack scenario:** a compromised or malicious admin account, a leaked admin password, or a future policy mistake sets a series title such as `<img src=x onerror=…>`. Every visitor runs that script and their stored Supabase session (`localStorage`) can be stolen, including any admin who opens the app.
- **Reproduction (safe, local):** feed a title such as `<img src=x onerror=alert(1)>` to `posterCardHtml` in Node; the returned HTML contains a live `<img onerror>`. `escapeHtml('"')` returns `"` unchanged.
- **Expected:** all database text is shown as text.
- **Changes made:**
  - `escapeHtml` now also escapes `"` → `&quot;` and `'` → `&#39;`.
  - Every sink listed above wraps its value in `escapeHtml(...)`. The feed title is `escapeHtml(s.title).replace('\n','<br>')`, so the line break still works.
  - A sweep of every string-built HTML sink in `js/` found two more, also fixed: the search "No matches for …" line echoed the typed query raw (`discover.js:525`), and the Continue-watching bar's cover `<img src>` was raw (`discover.js:579`). Everything else either escapes already, is a number/id/constant, or uses `textContent` (toasts and admin error lines).
  - `?v=` bumped on every changed file; `CACHE_NAME` is `narrava-shell-v44`.
- **Verification:**
  - Node, the real render functions (`posterCardHtml`, `searchGridCardHtml`, `shelfHtml`, `historyRowHtml`, `genreTagsHtml`, `genreChipsEditHtml`, `mostWatchedRowHtml`) plus the inline genre-chip, tag, feed-title and admin-cover expressions, fed `<img src=x onerror=alert(1)>` as title and genre and `…jpg" onerror="alert(2)` as cover URL: 15/15 pass, all come out as text. The same test against `HEAD` fails.
  - Chrome on Live Server: Home (16 posters, hero, shelves "New Release / Top / Drama / Action"), the Categories chips, search results, the Watch page tags and breadcrumb look as before, 0 console errors. A title with a line break renders one `<br>`. Typing `zzq<b>x` in search shows it as text.
- **Residual risk:** new string-built HTML must keep using `escapeHtml`. The CSP (SEC-002) is the second line of defence once enforced.

### [ADS-001] Production Ad Unlock uses Google's public test ad unit

- **Severity:** Medium
- **Status:** OPEN
- **Category:** Payments / Business
- **Evidence:**
  - Live `app_settings.ad_unlock_enabled = true`.
  - The deployed `js/ads.js` has `NARRAVA_REWARDED_AD_UNIT = '/22639388115/rewarded_web_example'`, checked on `narrava.vercel.app`.
- **Impact:**
  - Every real account with 0 coins can unlock up to 15 episodes a day for nothing.
  - The test unit earns no revenue.
  - Combined with ABUSE-001 this is unlimited.
  - `record_ad_view` relies on the browser's word, as the documentation says, so the ads don't even have to play.
- **Recommended fix:** turn Ad Unlock **off** in System Settings until a real Ad Manager unit, consent and the policy update (LEG-001) are ready.
- **External action:** admin setting; Google Ad Manager approval.

### [ABUSE-001] Unlimited free accounts → repeated welcome coins and ad unlocks

- **Severity:** Medium
- **Status:** OPEN
- **Category:** Payments / Abuse
- **Evidence:**
  - `GET /auth/v1/settings` → `mailer_autoconfirm: true`, `anonymous_users: true`, `disable_signup: false`.
  - `coins.js` `claimWelcomeBonusIfEligible` calls `claim_welcome_bonus` for any non-anonymous account.
  - Upgrading a guest needs only `updateUser({email,password})` with any address.
- **Scenario:** a script repeats sign-in-anonymously → upgrade with `random@example.com` → claim the bonus. Each account gets 5 coins, plus 15 ad unlocks a day. Entitlements are per account, but the account only needs to live long enough to fetch signed URLs or download.
- **Impact:** paid content can be had for free at scale. The ceiling is set only by Supabase's per-IP Auth rate limits (not checked).
- **Recommended fix:**
  - Turn on email confirmation (AUTH-001).
  - Turn on Supabase's CAPTCHA protection (Turnstile or hCaptcha) for sign-up and anonymous sign-in.
  - Only pay the welcome bonus to confirmed emails (check `email_confirmed_at` in `claim_welcome_bonus`).
  - Watch for bursts of new accounts in monitoring.
- **External action:** Supabase Auth settings; an SQL change to `claim_welcome_bonus` (not available here).

### [AUTH-001] Email confirmation is off

- **Severity:** Medium
- **Status:** OPEN
- **Category:** Security
- **Evidence:** `mailer_autoconfirm: true` (live); also stated in `DOCUMENTATION.md`.
- **Impact:**
  - Anyone can register a victim's email. The victim then sees "That email already has an account", and the squatter controls an account under the victim's address until the victim resets the password.
  - Purchase records and emails shown in the admin Revenue page can't be trusted to belong to the payer.
  - Feeds ABUSE-001.
- **Recommended fix:** turn on confirmation. The code already handles it (`auth.js`, the "Almost done. Check your email to confirm it." path), but that path has **never** been run against the real project, so test it in staging first. It also needs working email (OPS-001) and a custom SMTP sender.

### [SEC-002] Live site sends no security headers

- **Severity:** Medium
- **Status:** FIXED — PENDING DEPLOY VERIFICATION
- **Category:** Security
- **Evidence:** `curl -I https://narrava.vercel.app/index.html` returns only HSTS and `Cache-Control`. There is no `Content-Security-Policy`, no `X-Frame-Options` or `frame-ancestors`, no `X-Content-Type-Options` and no `Referrer-Policy`. There is no `vercel.json` in the repo.
- **Impact:**
  - Any XSS (see SEC-001) runs unhindered.
  - The app, including the Unlock button that spends a coin and the admin pages, can be framed by another site for clickjacking.
- **Recommended fix:** add `vercel.json` at the deployed root with headers. Start with `Content-Security-Policy-Report-Only` and observe before enforcing.

  Proposed policy, derived from what the code actually loads:
  ```
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.paystack.co https://securepubads.g.doubleclick.net https://*.googlesyndication.com https://*.google.com;
  connect-src 'self' https://bzbowtnupdduakoghtqf.supabase.co wss://bzbowtnupdduakoghtqf.supabase.co https://*.b-cdn.net https://video.bunnycdn.com https://api.paystack.co https://*.doubleclick.net https://*.google.com;
  media-src 'self' blob: https://*.b-cdn.net;
  img-src 'self' data: blob: https://bzbowtnupdduakoghtqf.supabase.co https:;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  frame-src https://checkout.paystack.com https://*.doubleclick.net https://*.googlesyndication.com https://*.google.com;
  frame-ancestors 'none'; base-uri 'self'; object-src 'none'
  ```
  Also send `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.

  Notes on the policy:
  - `'unsafe-inline'` is needed today for the inline `<head>` scripts and the inline styles. Removing it means moving those scripts out (follow-up).
  - The Google ad domains must be confirmed against GPT's real requests.
  - It is **not verified**. Test Report-Only on a preview deployment (playback, payment popup, ads, uploads) before enforcing.
- **Changes made:** `narrava/vercel.json` (Vercel serves `narrava/` as the site root: `/js/app.js` is 200 on the live site, `/narrava/js/app.js` is 404). It sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and the policy above as `Content-Security-Policy-Report-Only`. No page frames another Narrava page, so `DENY` breaks nothing.
- **Verification:** valid JSON, in the deployed folder. Live Server ignores it, so the headers can only be checked after a deploy (`curl -I https://narrava.vercel.app/`). The Report-Only policy has no `report-uri`; violations appear only in the browser console.

### [SEC-003] Floating, un-hashed `supabase-js` on every page

- **Severity:** Medium
- **Status:** FIXED — VERIFIED (locally; not deployed)
- **Category:** Security / Dependencies
- **Evidence:**
  - All 11 HTML pages load `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js` with no `integrity`.
  - `sw.js` precaches the same floating URL.
  - `hls.js@1.5.17` and `tus-js-client@4.2.2` are pinned but also have no SRI.
- **Impact:**
  - Any new `2.x` release, malicious or just breaking, reaches every visitor and every admin automatically. It runs with full access to their sessions.
  - Because the service worker caches it per shell version, different users may run different versions.
- **Recommended fix:**
  - Pin an exact version (for example the currently resolved `2.x.y`) in all 11 pages and in `sw.js`'s `CDN_URLS`.
  - Add `integrity="sha384-…" crossorigin="anonymous"` to all three CDN scripts.
  - Bump `CACHE_NAME`, and update `DOCUMENTATION.md` ("floating on the v2 major").
- **Changes made:**
  - `supabase-js` pinned to **2.117.3** (what `@2` resolved to on 2026-10-13, per jsDelivr's `X-JSD-Version` and its resolve API) on all 11 pages and in `sw.js` `CDN_URLS`.
  - `integrity="sha384-…"` and `crossorigin="anonymous"` on supabase-js (11 pages), hls.js 1.5.17 (`index.html`) and tus-js-client 4.2.2 (`admin/dashboard.html`, `admin/episodes.html`). The hashes were computed from the downloaded files, and each file's SHA-256 matched the hash jsDelivr publishes for it.
- **Verification:** in Chrome, `index.html` and `admin/login.html` load the pinned files with integrity on, `window.supabase` and `Hls` are defined, and there are 0 console errors. tus-js-client loaded with its integrity value in the page. Not run: a full regression of supabase-js 2.117.3 against every flow (sign-in and sign-out were not exercised; see §19).

### [ABUSE-002] Comment spam from anonymous accounts

- **Severity:** Medium
- **Status:** NOT VERIFIED (server side)
- **Category:** Abuse
- **Evidence:**
  - `social.js` `postSeriesComment` inserts with any session, anonymous included. There's no length cap in the client.
  - The anon role can read all 25 current comments directly (`series_comments` count via HEAD).
  - Whether the database enforces length, rate or ownership of `user_id` on insert isn't visible.
- **Impact:** bots with throwaway anonymous sessions can flood comments and impersonate others (see SOC-001).
- **Recommended fix:**
  - In SQL: `check (char_length(body) between 1 and 1000)`.
  - An insert policy with `user_id = auth.uid()`.
  - A per-user rate limit (a trigger counting the last minute).
  - Optionally require a real account to comment.
  - Add a report or hide tool for admins.

### [PRIV-002] Users can't delete their account

- **Severity:** Medium
- **Status:** OPEN
- **Category:** Privacy
- **Evidence:** there's no deletion feature in `profile.js`. The policy's route is "email support@narrava.com", which doesn't work (OPS-001).
- **Recommended fix:** make the email route work at minimum. Ideally add an in-app "Delete account" backed by an Edge Function that removes the profile and personal rows and keeps payment records as the policy states. App stores require this for listed apps.

## 9. Low and informational findings

- **[AUTH-002] Low · OPEN.** The 6-character minimum is the Supabase default (`auth.js` `minlength=6`, `NEW_PASSWORD_MIN_LENGTH = 6`). Raise it to at least 8 in Supabase Auth (and in the two constants and the messages), and turn on leaked-password protection if the plan allows.
- **[PRIV-001] Low · OPEN.**
  - The anon role can `select *` on `series_comments`, which returns `user_id` along with the body.
  - That exposes every commenter's account UUID and lets someone link all of a person's comments.
  - The app only needs `get_series_comments`. Revoke direct `SELECT` on the table, or limit it to non-identifying columns.
  - Check what `get_series_comments` itself returns (it includes `user_id`; `comments-panel.js` uses it for "Viewer XXXXXX" names and delete rights).
- **[DATA-001] Low · NOT VERIFIED.** `visit-log.js` inserts `{user_id, visited_at: new Date()}` from the client. If the table accepts a client-chosen `visited_at` and doesn't limit inserts, any user can inflate or back-date the admin analytics. Fix it in SQL: `visited_at default now()`, revoke the column from inserts, and dedupe per user per day.
- **[SOC-001] Low · OPEN.** `display_name` is free text with no uniqueness, length or reserved-word rule (`profile.js`). A user can call themselves "Narrava Support" in comments. Add a length check and a reserved-names list in SQL, and show an admin badge from `is_admin` instead.
- **[VID-001] Low · FIXED — VERIFIED.** In `video-player.js` `scheduleRefresh`, a missing or invalid `expiresAt` gives `NaN`, then `setTimeout(…, NaN)` fires immediately, so the player calls the signing function again and again. Fixed: a missing, zero or non-numeric expiry now refreshes after 9 minutes (`DEFAULT_REFRESH_MS`); a numeric string still works. Verified in Node with the real `attachEpisodePlayback` and a fake hls.js: `undefined`, `null`, `"abc"` and `NaN` all schedule 540 000 ms, while a real expiry still refreshes about 30 s before it. On `HEAD` the same test schedules `NaN` ms.
- **[VID-002] Low · FIXED — VERIFIED.** In `video-player.js`, on a fatal 401/403 the HLS handler calls `refreshAuth()` and returns without counting a retry. If the refresh is refused (the subscription ended), the player stays stuck with no "couldn't load" state. Fixed: `refreshAuth()` now returns false when the new link is refused, and the 401/403 handler then calls `failPermanently()`, which shows the normal "couldn't load" state. Verified in Node: 403 plus a refused refresh calls `onFailure` once; 401 plus a successful refresh doesn't fail.
- **[PAY-002] Low · FIXED — VERIFIED.** `coins.js` `confirmPurchase` shows "Naira payments need a Nigerian card. Your payment is being refunded." for *any* `refunding`/`refunded`/`refund_failed`. That's wrong if a refund has another cause. Fixed: all three refund states now say "Your payment is being refunded." The poll only reads `purchases.status`. `failure_reason` exists, but whether users may read it and which value means "foreign card" can't be checked from here, so it isn't used. Verified by reading the code. The flow itself needs a real refund to trigger, so it wasn't run.
- **[AUTH-003] Low · OPEN.** Sign-up shows "That email already has an account", which reveals registration. That is normal for Supabase with autoconfirm off. The password-reset flow is correctly neutral.
- **[UX-001] Low · OPEN.**
  - `protect.js` runs `Function('debugger')()` every 100 ms forever. It also blocks selecting and copying page text for everyone, including assistive-technology users.
  - It's a deterrent, not security, and the code and docs say so.
  - Consider dropping the debugger loop (it costs CPU) and keeping the context-menu block only.
- **[CONT-001] Informational · NOT REPRODUCED.**
  - The anon role can read `bunny_video_id` for every episode, locked ones included (`episodes` select). The app needs this.
  - Checked live: `iframe.mediadelivery.net/embed/741023/<locked guid>` and `/play/…` return Bunny's **403** page, so the embed route is token-protected.
  - Direct CDN playlist access without a token wasn't re-tested (the pull-zone host isn't in the repo). `DOCUMENTATION.md` records it as 403.
  - Recommend keeping **Embed view token authentication**, **CDN token authentication** and **allowed referrers** on in Bunny, with MP4 fallback off. Verify these in the Bunny dashboard.
- **[OFF-001] Informational · ACCEPTED RISK.** Offline files sit in Cache Storage and `sw.js` serves any `offline/…` path. Anyone with the device can copy them. This is documented and was agreed with the client ("Honest limits"). Signing out hides downloads but doesn't delete them. On shared devices, consider a "delete my downloads on sign-out" option.
- **[OPS-002] Informational · NOT VERIFIED.** There's no evidence of backups (PITR), error monitoring, webhook-failure alerts, secret rotation or an incident runbook. See §21.
- **Admin error text passthrough · Informational.** Admin pages append the server's `err.message` (for example `admin-shared.js` upload/delete). Only admins see it, which is acceptable.

## 10. Supabase RLS and database audit matrix

The **anon role** column is real evidence: live HEAD counts on 2026-10-13, no row data read. Everything about the **authenticated** role is NOT VERIFIED.

| Table | Anon role: rows visible | Expected | Authenticated role |
|---|---|---|---|
| profiles | 0 | 0 ✅ | NOT VERIFIED: own row only; `coin_balance`/`is_admin` not updatable |
| series | 4 (all `published`; `status=draft` → 0) | published only ✅ (no drafts exist to prove the filter) | NOT VERIFIED: admin-only writes |
| episodes | 35 (all in published series) | ✅ | NOT VERIFIED: admin-only writes; episodes of drafts hidden |
| genres / series_genres | 2 / 4 | public ✅ | NOT VERIFIED: admin writes |
| series_comments | **25, all columns incl. `user_id`** | see PRIV-001 | NOT VERIFIED: insert as self; delete own/admin |
| comment_likes, series_likes, series_saves | 0 | ✅ | NOT VERIFIED |
| watch_progress | 0 | ✅ | NOT VERIFIED: own rows; `user_id = auth.uid()` on upsert |
| episode_unlocks | 0 | ✅ | NOT VERIFIED: **no client insert** (only RPCs) |
| coin_transactions | 0 | ✅ | NOT VERIFIED: no client writes |
| purchases | 0 | ✅ | NOT VERIFIED: own rows read-only, no client writes |
| subscriptions | 0 | ✅ | NOT VERIFIED: no client writes |
| coin_packs / subscription_plans | 4 / 3 | public ✅ | NOT VERIFIED: admin writes |
| app_settings | 1 | public read ✅ | NOT VERIFIED: admin-only update |
| page_visits | 0 | ✅ | NOT VERIFIED (DATA-001) |
| ad_views, episode_views, series_shares | 401 (no grant) | ✅ | NOT VERIFIED |
| PostgREST OpenAPI root | 401 for the anon key | ✅ | — |

**RPCs and functions:** all NOT VERIFIED. That includes `unlock_episode_with_coin`, `unlock_episode_with_ad`, `record_ad_view`, `my_ad_status`, `claim_welcome_bonus`, `my_subscription`, `can_watch_episode`, `can_download_episode`, `get_watch_history`, `get_continue_watching`, `get_series_comments`, `get_series_rankings`, `get_series_like_count`, `get_series_social_counts`, `record_episode_view`, `record_series_share` and all `admin_*`.

The SQL to collect the definitions, for the owner to run in the SQL editor:
```sql
-- RLS state and policies
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';
select * from pg_policies where schemaname in ('public','storage') order by tablename;
-- Table/column grants to anon/authenticated
select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') order by 2,1,3;
select grantee, table_name, column_name, privilege_type from information_schema.column_privileges where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE') order by 2,3;
-- Every function: security definer?, search_path, who may execute, body
select p.proname, p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid) args,
       array(select r.rolname from pg_roles r where has_function_privilege(r.oid, p.oid, 'EXECUTE') and r.rolname in ('anon','authenticated','public')) exec_roles,
       pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;
-- Triggers (profile creation, balance guards)
select event_object_table, trigger_name, action_statement from information_schema.triggers where trigger_schema in ('public','auth');
-- Constraints that protect money
select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace order by 1;
```

**What to check in that output:**
- Every `SECURITY DEFINER` function has `search_path` set (for example `set search_path = public, pg_temp`), uses `auth.uid()` rather than any argument for identity, and has `EXECUTE` revoked from `public`/`anon` where it isn't needed.
- `admin_*` functions check `is_admin` from `profiles` where `id = auth.uid()`.
- No `authenticated` UPDATE grant or policy covers `profiles.coin_balance` or `profiles.is_admin`.
- `episode_unlocks` has `unique(user_id, episode_id)`.
- `coin_balance` has `check (coin_balance >= 0)`.
- `purchases.paystack_reference` is unique.
- Coin-spending functions lock the profile row (`select … for update`) or use one conditional `update … where coin_balance >= 1 returning`.
- `record_ad_view` caps are enforced inside one transaction, with a per-user lock (concurrent calls).
- The suspension check: `admin-suspend-user` sets `banned_until`, but a suspended user's existing JWT stays valid until it expires (about 1 h). Sensitive RPCs could also check `auth.users.banned_until`.

## 11. Authentication and account security

- **Anonymous sessions:** `bootstrapAnonymousSession` (`watch-progress.js`). Every visitor gets an `authenticated` JWT with `is_anonymous: true`, so policies must not treat "authenticated" as "real account". NOT VERIFIED.
- **Upgrade:** `auth.updateUser({email,password})` keeps the same id, then `refreshSession()` re-issues the token. The code is correct; the identity can't change during the upgrade. Not tested live with a new account (no test accounts).
- **Password reset:** the message is neutral and doesn't reveal accounts. The tokens are removed from the URL and history. Tested end to end by the owner earlier on 2026-10-13 (reported in session).
- **Findings:** AUTH-001, AUTH-002, AUTH-003, ABUSE-001.
- **Session storage:** supabase-js keeps the refresh token in `localStorage`, readable by any script on the origin (hence SEC-001/002/003 matter).
- **Suspension:** via `admin-suspend-user` (not verified). The admin's own JWT stays valid until it expires.

## 12. Admin authorization

- `requireAdminSession` (`admin-shared.js`) is a client-side redirect only. Every admin page and script is downloadable (`/admin/login.html` returns 200 on Vercel). That is expected; the security must be server-side.
- **Admin writes** (series, episodes, genres, `series_genres`, `app_settings`, the `cover-images` storage bucket) depend on RLS: NOT VERIFIED.
- **Admin RPCs** (`admin_list_users`, which returns emails, and `admin_revenue_overview`, which returns emails and money): NOT VERIFIED that they refuse non-admins. The documentation says `admin_revenue_overview` refuses them.
- **Edge Functions:** `bunny-upload-init`, `bunny-delete-video` (accepts any `videoId`) and `admin-suspend-user`: NOT VERIFIED that they check `is_admin` on the server.
- **Audit trail:** none. There's no admin action log table (`admin_audit_log` → 404). Recommend logging publish, delete, suspend and settings changes.
- **Destructive actions:** two-step confirmations exist (series delete, genre delete, suspend). There's no undo. Deletes are permanent at Bunny.

## 13. Video and offline download security

- **Streaming:** `video-player.js` sends only `{episodeId}` with the JWT. A refusal is final, with no fallback URL ✅.
  - The token is re-attached only to URLs without `token=`. It would also be attached to an absolute URL on another host if a Bunny playlist ever contained one (low; Bunny controls the playlists).
- **Server rule:** NOT VERIFIED here. The documentation records live checks from 2026-09-20 (episodes 11–29 refused for anonymous) and a non-subscriber download → 403.
- **Free Mode against `bunny-signed-playback-url`:** still unchecked (documentation §5).
- **Embed:** a locked episode returns 403 without a token ✅ (CONT-001).
- **Downloads:** the playlists are checked for `token=`, `expires=`, `b-cdn.net` and absolute URLs before saving ✅. The record is written last ✅. Ownership is local-only (OFF-001).

## 14. Paystack, coins and subscription integrity

**Client side** (reviewed, `coins.js`):
- `paystack-init` gets only `{kind,itemId,currency}` ✅.
- `onSuccess` isn't trusted; the app polls `purchases.status` ✅.
- One purchase at a time ✅.
- Unlock sends only `p_episode_id` ✅.
- The double-tap guard (`unlockInFlight`) is in the UI only. Concurrency safety must come from SQL.

**Server side: all NOT VERIFIED.**
- webhook signature (HMAC-SHA512 of the raw body with the secret key, compared to `x-paystack-signature`);
- server-side amount and currency checks against the pending purchase;
- idempotency on `reference`;
- out-of-order and duplicate events;
- refunds;
- subscription stacking (`ends_at`).

The staging tests are in §23. **Do not launch payments without them.**

## 15. Rewarded ads

- Live: **on**, with the test unit (ADS-001).
- `record_ad_view` relies on the browser's report (documented). Its caps of 30 a day, 20 s apart, and 0-coin, non-subscriber real accounts only are NOT VERIFIED, including under concurrent calls.
- Abuse ceiling: ABUSE-001.
- No consent mechanism (LEG-001).

## 16. Frontend and web security

**Fixed:** SEC-001, SEC-003 (SEC-002 pending deploy).

**Open:** SEC-003, UX-001.

**Checked and fine:**
- **Comments:** the body, names and mentions are escaped ✅.
- **IDs in `data-` attributes:** these are database UUIDs ✅.
- **Deep links:** `#series=` is only matched against loaded ids ✅.
- **Open redirects:** the reset `redirectTo` is same-origin ✅.
- **Prototype pollution:** no dangerous object merges found.
- **`document.body.innerHTML = maintenanceMarkupHtml()`:** fixed markup ✅.

## 17. Secrets and dependencies

- **Repo and history scan:** the only JWT in the full history is the `anon` key. There are no `service_role`, Paystack (`sk_`/`pk_`), Bunny or webhook secrets, and no `.env` files ✅.
- **`BUNNY_LIBRARY_ID`:** public and unused.
- **Dependencies:**
  - `supabase-js` pinned to 2.117.3 with SRI (SEC-003, fixed).
  - `hls.js 1.5.17` and `tus-js-client 4.2.2` are pinned, now with SRI. No known advisory applicable to their use here was established (not researched in depth).
  - Paystack inline v2 and Google GPT are loaded on demand from their official hosts, without SRI (their scripts are unversioned by design).

## 18. Privacy, legal and content rights

LEG-001, OPS-001, PRIV-001 and PRIV-002.

Also:
- **Content rights:** no licensing or distribution-rights records for the dramas are in the repo. The owner must confirm them.
- **Terms of service:** none exists (refunds, coin expiry, subscription terms, VIP, download rules).
- **Data residency:** the policy says providers "may store information outside Nigeria". Counsel should confirm the transfer basis.

## 19. Functional and regression test results

| Test | Setup | Expected | Actual | Result |
|---|---|---|---|---|
| Hostile-input render test (SEC-001), real functions | Node, scratchpad script | hostile title/genre/URL shown as text | 15/15 pass; fails on `HEAD` | PASS |
| Player refresh/failure test (VID-001/002), real `attachEpisodePlayback` + fake hls.js | Node | 9 min for a bad expiry; `onFailure` on a refused 403 refresh | 4/4 pass; `HEAD` schedules `NaN` ms | PASS |
| `node --check` on every `narrava/js/*.js` and `sw.js` | — | no errors | no errors | PASS |
| Home, Categories chips, search, Watch page tags | Chrome, Live Server :5501, SW v44, desktop | look as before, 0 console errors | 16 posters, chips Drama/Action, titles and tags correct, 0 errors | PASS |
| Library, Downloads (guest) | same | render, 0 errors | "Sign in to see…", "No downloads yet.", 0 errors | PASS |
| Admin login | same | loads pinned supabase-js with integrity, 0 errors | as expected | PASS |
| CDN integrity | same | no integrity errors | supabase-js, hls.js load; tus.min.js loads with its hash | PASS |
| Episode playback (Ep 1, "Ordinary Life and Poor Husband") | same | plays | signing 200 and both playlists 200, but Chrome was minimized (`document.hidden`), so it never fetched segments | NOT CONFIRMED |
| 390px width | same | — | window couldn't be resized while minimized | NOT RUN |
| Log in / log out | needs a password typed by the owner | — | not run | NOT RUN |
| `vercel.json` headers | needs a deploy | — | valid JSON, in `narrava/` | PENDING DEPLOY |
| Earlier today (previous task): auth views, reset flow, unlock prompt, downloads empty state at desktop and 390px | see session | — | passed; reset flow tested end to end by the owner | PASS (prior) |
| "My Maiden Slave" Ep 1 playback | live Bunny | plays | 404 → load-failed state | FAIL (QA-001) |
| Coin unlock, purchase, subscription, ad unlock, download, offline journeys | need test accounts + Paystack test mode | — | not run | NOT RUN |

## 20. Performance, accessibility and browser compatibility

- `feed-data.js` is about 370 KB because of two base64 placeholder covers loaded on every visit. Move them to `img/` files.
- `protect.js` runs a 100 ms interval forever (UX-001).
- Fetches load every series and episode at startup (`fetchSlides`, no limit). That's fine at 35 episodes; it needs paging as the catalogue grows.
- Accessibility: copy and selection are blocked app-wide (UX-001). Screen-reader and keyboard reviews were not run.
- **Not tested:** iOS Safari (including native HLS and offline downloads), Android Chrome, the installed PWA, 320px and tablet widths in this pass. The documentation lists these as untested too.

## 21. Backups, monitoring and operations

All NOT VERIFIED. Owner checklist:
- Supabase plan with daily backups or PITR turned on; a restore tested once.
- Alerts on Edge Function errors, especially the webhook.
- A daily reconciliation query: `purchases` completed vs `coin_transactions` vs `profiles.coin_balance`.
- The Paystack webhook-failure email/alert turned on.
- An incident kill-switch runbook: Coin Payments / Subscription Payments / Ad Unlock off in System Settings; Maintenance Mode.
- Rotation procedure for the Paystack secret, Bunny API key and Supabase service key.
- A working support mailbox (OPS-001).
- Schema and functions exported into the repo (VER-001).

## 22. Remediation log

| Date | ID | Change | Files | Verification |
|---|---|---|---|---|
| 2026-10-13 | SEC-001 | `escapeHtml` escapes `"` and `'`; 18 listed sinks plus 2 found in the sweep wrapped | `js/shared-utils.js`, `discover.js`, `app.js`, `watch.js`, `admin-dashboard.js`, `admin-most-watched.js`, `admin-series-list.js` | Node hostile test, Chrome (§19) |
| 2026-10-13 | SEC-002 | Security headers, CSP as Report-Only | `narrava/vercel.json` (new) | JSON valid; check after deploy |
| 2026-10-13 | SEC-003 | supabase-js pinned to 2.117.3; SRI on supabase-js, hls.js, tus-js-client | `index.html`, `admin/*.html`, `sw.js` | hashes match jsDelivr; loads in Chrome |
| 2026-10-13 | VID-001, VID-002 | 9-min fallback refresh; refused refresh after 401/403 → "couldn't load" | `js/video-player.js` | Node test with a fake hls.js |
| 2026-10-13 | PAY-002 | Neutral refund message | `js/coins.js` | code read |
| 2026-10-13 | — | `?v=` bumps (shared-utils 9, video-player 7, coins 7, app 23, discover 7, watch 17, admin-dashboard 4, admin-most-watched 3, admin-series-list 3); `CACHE_NAME` `narrava-shell-v44`; `DOCUMENTATION.md` updated | HTML, `sw.js`, `DOCUMENTATION.md` | new versions served in Chrome |

Nothing has been committed or deployed. Production still runs v42 until the owner deploys. `CACHE_NAME` skips v43 because a reverted trial already used that name in a local browser.

## 23. Outstanding questions and external actions

**Decisions for the owner:**
1. Who owns `narrava.com`? What is the real support address? (OPS-001)
2. Legal entity, address, minimum age and effective date for the policy; whether a terms of service will be written. (LEG-001)
3. Turn Ad Unlock off until real ads and consent are ready? (ADS-001)
4. Turn on email confirmation and CAPTCHA? (AUTH-001, ABUSE-001)
5. Unpublish the three series without real video? (QA-001)
6. May an audit run on a **staging** Supabase project with Paystack **test** keys and three test accounts (anonymous, ordinary, admin)?

**Staging tests needed to close VER-001:**

| # | Test | Pass condition |
|---|---|---|
| 1 | As an ordinary user: `PATCH /rest/v1/profiles?id=eq.<self>` with `{"coin_balance":999}`, then `{"is_admin":true}` | both refused or no-op |
| 2 | As user A: select `purchases`, `subscriptions`, `episode_unlocks`, `coin_transactions`, `watch_progress` with `user_id=eq.<B>` | 0 rows |
| 3 | As user A: insert into `episode_unlocks`, `coin_transactions`, `purchases` and `subscriptions` | refused |
| 4 | `unlock_episode_with_coin` ×20 in parallel with balance 1 | exactly one `unlocked`, balance 0, one ledger row |
| 5 | `claim_welcome_bonus` ×10 in parallel | one `granted` |
| 6 | `record_ad_view` ×10 in parallel, then again after 5 s | at most 1 recorded; `too_soon` |
| 7 | Every `admin_*` RPC and the three admin Edge Functions as an ordinary user and as anonymous | refused (401/403) |
| 8 | `bunny-signed-playback-url` with a locked episode as a non-subscriber; with `purpose:'download'` as a non-subscriber; with Free Mode on; with an expired subscription; with a draft series' episode; with a malformed id | refused, except Free Mode (matches the policy), and the draft refused |
| 9 | POST to the webhook with no signature, a wrong signature, a valid signature but a mismatched amount or currency, and a replay of a valid event | no credit, no credit, `failed`/needs-review, exactly one credit |
| 10 | `paystack-init` with an unknown pack, an inactive pack, `currency:"EUR"`, extra fields such as `amount`, and with coin payments switched off | refused; the price always comes from the database |
| 11 | A comment over 10,000 chars; a comment with `user_id` of another user | refused |

## 24. Prioritized remediation plan

1. **Before launch (blockers):**
   - OPS-001;
   - LEG-001 (plus a terms of service);
   - QA-001;
   - ADS-001 (turn it off);
   - VER-001: export the backend, then run staging tests 1–11 above;
   - deploy the SEC-001/002/003 fixes, then check the headers and the Report-Only console output.
2. **Before launch (strongly recommended):**
   - AUTH-001 + CAPTCHA (ABUSE-001);
   - SEC-002 headers (Report-Only first);
   - SEC-003 pin + SRI;
   - ABUSE-002 comment limits;
   - PRIV-002 deletion route.
3. **Soon after:** PRIV-001, DATA-001, SOC-001, AUTH-002, VID-001, VID-002, PAY-002, admin audit log, monitoring (§21).
4. **Later:** UX-001, the placeholder art in `feed-data.js`, catalogue paging.

## 25. Final go/no-go checklist

| Gate | State |
|---|---|
| No confirmed Critical | ✅ none confirmed (backend unverified) |
| No exploitable High auth/payment/data issue | ⚠️ unknown: VER-001 |
| Coins/subscriptions can't be granted without verified payment | ❌ NOT VERIFIED |
| Ordinary users can't become admin | ❌ NOT VERIFIED |
| Paid content not bypassable via the backend | ⚠️ partially: embed 403 confirmed; signing function not re-tested |
| No cross-account data exposure | ⚠️ anon role clean; authenticated role NOT VERIFIED |
| No exposed privileged credentials | ✅ verified (repo + history) |
| Privacy/legal ready | ❌ LEG-001, OPS-001 |
| Catalogue playable | ❌ QA-001 |
| Stored XSS fixed and deployed | ⚠️ fixed in working tree, not deployed |

**Verdict: NOT READY — VERIFICATION INCOMPLETE.**

**Residual risk:** browser storage isn't DRM; web rewarded ads are reported by the client; client-side deterrents aren't security. Real-device behaviour (iOS, Android) is untested.
