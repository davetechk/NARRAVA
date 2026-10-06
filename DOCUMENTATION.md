> **Keep this file current.** It only stays useful if it matches the code. Whenever a real
> feature is added, removed, or meaningfully changed (a new screen, a new Supabase table or
> function, a change to how sign-in, video, or the admin panel works), update this file in the
> same piece of work. If you are a new session opening this file: read it, trust it only as far
> as it has been kept up, and fix anything you find that has drifted. Move things out of
> "Not built yet" only when they genuinely work.
>
> Last reviewed against the code: 2026-09-21.

# Narrava

## What it is

Narrava is a web app for watching short vertical drama series, the kind where a series is
dozens of one-to-two-minute episodes and you swipe from one to the next. It runs in a phone
browser (and can be installed to the home screen), and it has a wider desktop layout. Anyone
can open it and start watching without signing up. A separate admin panel lets the team create
series, upload episodes, and manage the catalogue and users.

There is no server code in this repo. The app is plain HTML, CSS and JavaScript files. All data,
sign-in, and business rules live in **Supabase** (database, auth, storage, small server
functions), and all video lives on **Bunny Stream**.

**How this document was written:** by reading the code in this repo. It was not checked against
the live Supabase project. Where a behaviour depends on something in Supabase that this repo
can't show (a policy, a function's internals), the text says so.

## What is real and what isn't

Working: browsing and search, watching episodes (mobile swipe feed and desktop watch page),
resuming where you left off, likes, saves, threaded comments, usernames, email sign-up and
log-in, anonymous accounts, the installable app, and the full admin panel described below.

Nava Coins are real too: the balance, episode locks, unlocking with 1 coin, buying coin packs
through Paystack, and the 5-coin welcome bonus. So are subscriptions (weekly / monthly / yearly
through Paystack, see [Membership and VIP](#membership-and-vip)) and the VIP tab for yearly members. See
[Nava Coins](#nava-coins-balance-locks-unlocking-buying). The server decides all of it; the app only
displays it. See [Not built yet](#not-built-yet) for what still doesn't exist.

## How the pieces fit

```
Browser (static files in narrava/)          Supabase                       Bunny Stream
  index.html + js/*.js   ── supabase-js ──▶ Auth, Postgres (RLS),      
  admin/*.html + js/admin-*.js               Storage, Edge Functions ──▶ video storage + HLS
        │                                           ▲
        └── video: asks an Edge Function for a signed link, then plays it from Bunny
```

- **`narrava/index.html`**: the whole consumer app in one page. Every screen (Home, For You,
  Library, Profile, the desktop watch page) is a `<div>` in this file that gets shown or hidden.
  It is not a multi-page site.
- **`narrava/admin/*.html`**: the admin panel. Separate pages, one per section, sharing
  `js/admin-shared.js`.
- **`narrava/js/`**: all the logic. There is no build step, no bundler, no `package.json`, no
  modules. Every file is a plain script that defines global functions, and `index.html` loads
  them in a specific order (see [Gotchas](#things-that-are-easy-to-get-wrong)).
- **`narrava/js/coins.js`**: Nava Coins: the real balance, the lock rule, the unlock prompt, the
  Get Coins sheet, the welcome bonus, the subscription state (`my_subscription`), and the one shared
  Paystack purchase flow (`startPaystackPurchase`) used for coins and subscriptions.
  **`narrava/js/ads.js`**: watch ads to unlock episodes (Google rewarded ads), the ads section of
  the unlock prompt, and the one ad unit constant `NARRAVA_REWARDED_AD_UNIT` (see
  [Watch ads to unlock](#watch-ads-to-unlock-google-rewarded-ads)). Loaded right after `coins.js`.
  **`narrava/js/membership.js`**: the Membership screen (see
  [Membership and VIP](#membership-and-vip)). Loaded after `feed-data.js` and before
  `app.js`. See [Nava Coins](#nava-coins-balance-locks-unlocking-buying).
- **`narrava/css/`**: `styles.css` (the app, and also used by admin) and `admin.css` (admin only).
  Brand color lives in three CSS custom properties defined once, in `styles.css`'s `:root`, and
  reused by `admin.css` rather than redefined: `--leaf: #1ED760` (Spotify green, the main brand
  color), `--leaf-deep: #1DB954` (hover/pressed states), `--leaf-light: #62E390` (lighter accents,
  active nav/tab text). Rule: wherever text or icons sit on a **solid** `--leaf`/`--leaf-deep`
  fill (buttons, active chips/tags/tabs), the text color is `#0D130E` (near-black), not white —
  white-on-green fails contrast at this brightness. Text that is green *on a dark background*
  (tinted/rgba fills, nav links, badges) stays green.
- **Loading indicator**: one shared implementation, `narravaLoaderHtml(variant, label)` in
  `js/shared-utils.js`. The center mark — and, in the `'pulse'` variant, the copy inside each
  echoing ring — is `NARRAVA_LOGO_SVG`, the full, unmodified contents of `img/load_img_icon.svg`
  inlined as real `<svg>` markup (only the `<?xml?>` line, the generator comment, and the
  non-visual C2PA `<metadata>` block are dropped — every path and fill color is untouched). Its
  facet colors are baked into the markup itself, not `currentColor`, so `.narrava-mark-icon` in
  `styles.css` doesn't set a color on it. Under `prefers-reduced-motion: reduce`, the pulse
  variant's rings are hidden entirely and the center mark switches from its normal breathing scale
  animation to a plain opacity fade — no scaling. This full loader is still used as-is in exactly
  three places: the For You feed while a video buffers, the desktop Watch page's video player, and
  the Bunny-upload-processing toast.
- **Skeleton loading**: everywhere else that used to show the pulsing logo loader now shows a
  content-shaped skeleton instead — Home (the desktop hero banner, the desktop shelves, and the
  mobile poster grid, in `js/discover.js`, plus the Rankings tab and Top shelf while their ranking
  loads), Library's poster grid (`js/library.js`), History's rows (`js/history.js`, its own
  `skeletonHistoryRowsHtml`), the comments
  sheet's avatar+two-line rows (`js/comments-panel.js`), the desktop Watch page's episode grid
  (`js/watch.js` — the player itself keeps the full loader, only the grid became a skeleton), and
  admin's Series List and Episodes tables (real `<thead>`, skeleton body rows). The helpers
  (`skeletonPosterGridHtml`, `skeletonHomeHeroHtml`, `skeletonHomeShelvesHtml`,
  `skeletonCommentRowsHtml`, `skeletonWatchEpisodeGridHtml`, `skeletonAdminSeriesTableHtml`,
  `skeletonAdminEpisodesTableHtml`, `skeletonAdminMostWatchedTableHtml`) live in
  `js/shared-utils.js` next to `narravaLoaderHtml()`;
  each reuses the real content class it's standing in for (`.poster-card`, `.watch-ep-card`, the
  admin table shell) so its sizing/border-radius always matches whatever replaces it, and none of
  them ever contain real text, numbers, names or images. `.skeleton-block` (styles.css) is the one
  shared shimmer treatment — a `--skeleton-base`/`--skeleton-shimmer` tint sweeping via
  `background-position` only, ~1.4s per pass. **One faint logo per page**: `showSkeletonLogo()`/
  `hideSkeletonLogo()` drop a single `narravaLoaderHtml('pulse')` at ~0.5 opacity, fixed to the
  center of the viewport, shared across every skeleton area on that page (Home's three areas share
  one call) rather than one per section — hidden the moment that page's real content, empty state,
  or error state replaces the skeleton. **Never stuck**: every call site hides the skeleton/logo in
  every exit path, including a genuine fetch failure — which required two small, narrowly-scoped
  fixes (`admin-series-list.js` and `admin-episodes.js` previously only toasted on error without
  ever clearing the table container; `watch.js`'s episode grid previously stayed on the loader
  forever if a series genuinely had zero episodes) so "replace the skeleton with today's existing
  error/empty state" is actually true everywhere it's asked to be. Under
  `prefers-reduced-motion: reduce`, `.skeleton-block` drops the shimmer for a slow opacity fade
  instead (no `transform`/`background-position` change), and the center logo follows its own
  reduced-motion rule above unchanged.
- **Maintenance screen size**: the whole animation (scene + heading + paragraph + button) in
  `.maintenance-screen` has been scaled down twice now — first to 0.78× the values
  `maintenance.html` itself uses, then a second pass took that result down by a further ~18%
  (0.82× on top of the first pass, so ~0.64× the original file's numbers overall) — the scene via
  a percentage width (64%, not 100%, so it shrinks on mobile too) rather than only capping the
  desktop `max-width`, and every h1/p/button font-size, margin, padding and box-shadow scaled by
  the same factor each pass. Nothing about the drawing, its script, its colors, or its timing
  changed — only these CSS numbers.
- **`narrava/img/load_img_icon.svg` is Narrava's one and only logo.** Its shape (179 paths) must
  never be redrawn, retraced, or simplified — only its fill colors may ever change. The app icon
  PNGs (`icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-triangle.png`) are regenerated
  renders of this same file at fixed sizes, not independent artwork; if the logo's colors change
  again, regenerate those PNGs from it rather than hand-editing them.
- **`narrava/sw.js`, `manifest.json`, `img/`**: the installable-app pieces.
- **`js/config.js`**: the Supabase URL and the *anon* (public) key. These are meant to be in the
  browser; what the key can actually do is decided by database policies. A service-role key must
  never be added anywhere in this repo.
- **`loading-animations.html`, `narrava-desktop-mockup.html`, `DRAMABOX screehshots/`, and the
  loose `.png` files in the root**: design references and old mockups. They are not part of the
  app and nothing loads them.

**Running it locally:** serve the `narrava/` folder with any static file server (for example
`python -m http.server` from inside `narrava/`) and open it over `http://localhost`. Don't open
`index.html` straight from disk: the service worker and the Supabase calls need a real origin.
There is no deploy configuration in this repo, so where it's hosted isn't recorded here.

**External libraries**, loaded from a CDN in the HTML: `supabase-js` v2 (floating on the v2
major), `hls.js` 1.5.17, and `tus-js-client` 4.2.2 (admin pages that upload video).

## The consumer app

**Screens** (bottom bar on mobile, top bar on desktop): Home (the default), For You, Library,
Profile. On desktop, opening a series goes to a dedicated Watch page instead. History is a
screen too, reached from Profile (Profile stays the highlighted tab while it's open).

- **Home** (`discover.js`): on mobile, a search box, tabs, and a poster grid. Popular is just
  the order the database returns; New sorts by creation date; Categories filters by genre; VIP
  only appears while the admin VIP Section switch is on, and shows a VIP card above posters that
  still say "Coming soon" (see [Membership and VIP](#membership-and-vip)). On desktop: a rotating
  banner of featured series plus horizontal shelves (New Release, Top, then one per genre that
  has series).
  - **Rankings (mobile tab) and Top (desktop shelf)** are the same real view ranking, from the
    `get_series_rankings` function (`result_limit: 100`), which returns `series_id` + `views` for
    published series, already sorted. That order is final: the front end never re-sorts it. Each
    row is matched to a series the app already loaded (`slides`); an id it doesn't have is
    skipped. Each card shows a rank badge (1, 2, 3… — the position in the matched list; the top
    three are gold) and the real count ("1,204 views", "1 view", "0 views"), top-left, outside
    the title so the desktop shelf's hover-only title never hides it. Searching on the tab
    filters rows without renumbering them. "View all" on Top opens the Rankings tab.
  - It's fetched once per page load (`loadRankings()`), **after** `slidesReady` — which app.js
    resolves only once the anonymous-session bootstrap is done. That ordering matters: the
    function refuses a caller with no session at all ("permission denied for function
    get_series_rankings", seen live on a first-ever visit when it ran earlier).
  - Skeleton poster cards while loading (tab and shelf). On failure — an error, or no answer
    within 10 seconds (`withTimeout`, `shared-utils.js`) — the tab falls back to its old plain
    list with the note "Couldn't load rankings right now — showing all series instead", and the
    Top shelf to its old featured-first order with the caption "Couldn't load view counts —
    featured series shown first, not ranked by views". Never stuck on the skeleton.
- **For You** (`app.js`): the mobile swipe feed. One series at a time, full screen. Tapping
  enters "watching" that series: swipe up/down now moves between that series' *episodes*
  (stops at episode 1 going back; rolls into the next series after the last episode). The small
  "EP 3 · 12" badge opens a grid to jump to any episode. Tap toggles the on-screen controls
  and pause; press-and-hold plays at 2×. The controls (name, description, icons, scrub bar) auto-hide
  two seconds after entering a series, and again two seconds after a tap reveals them if nobody
  taps again. A second tap inside that window pauses instead, and the timer only restarts once
  the video is playing again.
  - **Episode length on the scrub bar.** Both players (this feed's `#scrubDuration`, the Watch
    page's `#watchScrubDuration`) show the episode's total length at the right end of the bar,
    e.g. "2:34" (m:ss; h:mm:ss past an hour). It comes from the `<video>` element's own
    `duration`, via `videoDurationLabel()` (`shared-utils.js`), which returns nothing until the
    element's `readyState` reaches HAVE_METADATA — so there's never a "0:00" or a guess, and
    hls.js setting a duration a moment earlier doesn't count. Updated on `loadedmetadata` and
    `durationchange`, and cleared whenever the episode changes (the feed's `setBgHasVideo(false)`,
    the start of `watchPlayEpisode`). A preloaded next episode already knows its length, so it
    shows straight away. Display only: seeking and playback are unchanged. It shares the bar's
    flex row (`.scrub-duration`), so it never overlaps it; checked at 320px, 390px and 1280px. Name, description and the like/comment/share/save icons use the same bottom offsets
  while browsing and while watching, so they don't jump when someone taps in. The only
  difference is deliberate: browsing has the Continue button under the description, so the text
  sits that button's height higher.
  - **Sound** is on by default, in browsing and watching alike. The mute button (top-left of the
    video, same spot in both states, and not hidden by the auto-hiding controls) mutes/unmutes
    whichever video is playing, and the choice carries to later videos in the visit. It is not
    remembered across page loads. See the Sound block in `app.js`.
  - **Browsers can refuse sound-on autoplay** in a page the visitor hasn't tapped yet (for
    example a cold open of a shared series link, or iOS). When `play()` is refused for
    that reason, that video plays muted instead, the button shows "muted", and the first tap or
    key press anywhere turns sound on. Not observed on a real device: desktop Chrome in
    testing treated every load as already interacted-with, so this path was exercised with a
    simulated refusal, and iOS Safari has not been tested at all.
  - **The desktop watch page has its own mute button** (`#watchMuteBtn`, top-left of the video,
    a sibling of the video host so a click on it never triggers tap-to-pause or press-and-hold).
    It is the same `.mutebtn` markup, icons and styles as the feed's, and it uses the same
    viewer preference (`soundMuted` in `app.js`): it flips the real `<video>`'s `.muted`, every
    episode started on that page begins from the preference, and it calls `updateMuteButton()`
    so the feed's button stays in step. `app.js` was not changed for this. Not added to the
    watch page: the "browser refused sound-on autoplay, so play muted" fallback above, which is
    playback logic; the desktop watch page still plays with sound as before. Tested live in
    desktop Chrome only.
- **Library** (`library.js`): series you've saved. Needs a real (non-anonymous) account.
- **History** (`history.js`, Profile → History): every series you've watched, newest first, from
  the `get_watch_history` function (`result_limit: 100`), which only ever returns the signed-in
  caller's own rows — an anonymous account has history too. Each row: cover, title,
  "Episode N" (`last_episode_number`) and when (`last_watched_at`: "Today", "Yesterday", or
  "12 Sep 2026", by the viewer's local calendar day — `formatWatchedDate()`, `shared-utils.js`).
  Built like Library: same `.library` shell and header (plus a back arrow, which behaves like the
  browser's Back via `navBack()`), skeleton rows with the one faint center logo, re-fetched every
  time it opens. Tapping a row calls `openSeriesInFeed` — exactly what a Library poster does,
  including the silent resume. A series in history that's no longer loaded (unpublished) shows
  "That series isn't available". Empty: "Nothing watched yet." Failure or no answer within
  10 seconds: "Couldn't load your history right now." with a Try again button. History is built
  from `watch_progress`; no front-end code ever deletes those rows (see Watch progress below).
- **Help & Feedback** (`help.js`, Profile → Help & Feedback): built like History — same
  `.library` shell, header and back arrow (`navBack()`), Profile stays highlighted. Its content
  is static markup in `index.html`, styled with the Profile menu's own cards/rows:
  - **Privacy Policy** — a plain link to `privacy.html`, opened in a new tab (see
    [Privacy policy page](#privacy-policy-page)).
  - **Contact** — `support@narrava.com`, with "Open email app"
    (`mailto:support@narrava.com?subject=Narrava%20support`) and "Copy email" (clipboard, then
    the shared toast "Email copied"; "Could not copy email — please try again" if the browser
    refuses).
  - **About** — "Narrava", "Short Nollywood dramas, made for your phone.", "Version " +
    `APP_VERSION`, and "© 2026 Narrava Entertainment".
  - **`APP_VERSION`** is a single constant at the top of `shared-utils.js` (currently `'1.0.0'`).
    It is the only place the version lives. **Bump it on every release.**
- **Profile** (`profile.js`): log in / sign out, username, install-app button, My Wallet (the
  real Nava Coins balance; it and Top Up open the Get Coins sheet, see Nava Coins below), the
  Narrava Membership banner (opens the Membership screen), a gold VIP badge beside your own name
  when you're a yearly member, History and Help & Feedback (above), and an Admin Panel link that
  only appears if you're an admin. Earn Rewards, Gifts, the Download row, and all four feature tiles
  (Originals, Daily Coins, Download, HD Quality — each a real `<button>` reset to look exactly like
  the old `<div>` tiles) show the same "Coming soon" toast, as does tapping a VIP poster on Home.
  Language keeps its own toast.
- **Watch page (desktop only)** (`watch.js`): video, breadcrumb, like/save/share/comments, and
  a numbered episode grid.

Mobile vs. desktop is decided at **900px** wide, both in CSS and in JavaScript
(`matchMedia('(min-width: 900px)')`). If you ever change the breakpoint, change it in both
places. The desktop "For You" tab reuses the mobile feed with simpler behaviour and does not
have per-episode swiping.

**Back button and history** (`nav.js`). The app is one page, so the browser has to be told about
real navigation or the first Back press leaves the app. On a phone this matters more than usual:
entering For You hides the bottom nav, so Back is the only way out of the feed. `nav.js` keeps one
browser-history entry per real step: a screen change (Home, For You, Library, Profile, the
desktop Watch page) and entering a series (tap a poster, or Continue in For You). Back retraces
those, so Home → For You → Continue → Back → Back lands on the feed, then Home, and a third Back
exits (or closes the installed app). Rules worth knowing:
- Swiping between episodes, or rolling into the next series, while watching adds **no** entries.
  Back leaves the series; it doesn't rewind episode by episode.
- Overlays (comment sheet, episode grid, Get Coins, sign-in / username / share popups, the desktop
  comments drawer and search) have **no** entries of their own. Back closes the topmost open one
  and stays on the same screen. To make an overlay Back-closable, add it to `NAV_OVERLAYS` in
  `nav.js`.
- The first entry is always a base entry for Home, written at load. A shared series link
  (`#series=…`) lands in the series with Home behind it, so Back goes to Home, not out of the app.
- Any new code that changes screen goes through `showScreen()` (which calls `navSync()`). Code that
  enters the watching state without a screen change must call `navSync()` itself. The desktop
  Watch page's on-screen ← calls `navBack()` so it behaves exactly like the browser's Back.
- Back out of watching stops the video and saves progress, the same as any other navigation.

**Copy and DevTools deterrents** (`js/protect.js`, consumer app only, never the admin pages).
Casual-friction only, **not security**: anyone determined can get around all of it (JavaScript off,
another browser, screen capture). Real protection is the server side: short-lived signed video
links and the lock rule in `bunny-signed-playback-url`. It does four things: blocks the right-click
/ long-press menu; blocks text selection, copy, cut and drag (`user-select:none` under
`html.protected`, plus event handlers); blocks F12, Ctrl/Cmd+Shift+I/J/C and view-source
(Ctrl+U, Cmd+Option+U); and runs a `debugger` statement every 100ms, which does nothing with
DevTools closed and pauses execution constantly with it open. Text fields are always exempt (the
comment box, sign-in, search and username need selection and paste; on iOS a field inside a
`user-select:none` page can't be typed into unless it's re-enabled, which the CSS does). Opening
DevTools from the browser menu can't be blocked. **Developer escape hatch:** run
`localStorage.narrava_devtools_ok = '1'` in the console and reload to turn every part off; remove
it with `localStorage.removeItem('narrava_devtools_ok')`. Without it, the `debugger` loop makes
debugging the live site impractical. If it ever "does nothing," first check that `protect.js` is
actually in the script list in `index.html` and deployed (it was once missing entirely).

**Scroll isolation.** The bottom sheets (comments, episode grid) sit inside `#feed`,
which owns the swipe listeners, so touches and wheel scrolls inside a sheet used to bubble up and
swipe the episode underneath. `app.js` now stops `touchstart/move/end` and `wheel` at each sheet
and backdrop. Anything new that scrolls inside `#feed` needs the same treatment.

**Data loading** (`feed-data.js`): on startup the app loads every series that has at least one
episode, plus that first episode of each, and turns them into "slides". A series' *full*
episode list is fetched only when someone actually starts watching it.

## Accounts and sign-in

There are three kinds of visitor, all handled with Supabase Auth:

1. **Anonymous.** On every page load, before anything else runs, `bootstrapAnonymousSession()`
   (`watch-progress.js`) checks for an existing session and, if there isn't one, calls
   `signInAnonymously()`. Everybody therefore has a real user id from their first visit, with no
   sign-up. That id is what likes, comments, and watch progress are attached to. It requires
   **"Allow anonymous sign-ins"** to be turned on in the Supabase project's Auth settings; if
   it's off, the failure is only logged to the console and those features silently stop working.
2. **Real account.** Email and password, through the popup in `auth.js` (`signUp` /
   `signInWithPassword`). If the project has email confirmation on, sign-up ends with "check
   your email" and the person must confirm before logging in.
3. **Admin.** A real account whose row in the `profiles` table has `is_admin = true`. Nothing
   in this repo sets that flag; it has to be set in the database.

Two helper functions in `watch-progress.js` express the difference, and it's worth knowing which
one a feature uses:

| Feature | Needs | Helper |
|---|---|---|
| Watch progress, like, comment, reply, comment-like | any session, anonymous is fine | `getSignedInUserId()` |
| Save (bookmark), Library tab | a real, non-anonymous account | `getRealAccountUserId()` |

When a signed-out or wrong-kind visitor taps an action that needs more, the app opens the
log-in popup instead of failing silently.

**Signing up upgrades the anonymous account in place.** When someone signs up while on an anonymous
session, `auth.js` calls `auth.updateUser({ email, password })` (Supabase's supported way to turn
an anonymous user into a permanent one) rather than `signUp`, which always creates a second user.
Same user id before and after, so every like, comment and bit of watch progress made as a guest
stays attached: nothing is copied or moved. It then refreshes the session, because the access
token still says `is_anonymous: true` until re-issued and row-level-security policies read the
token. Log In is a different path and is unchanged: it signs into a separate, existing account, so
whatever a guest did stays with the guest account and doesn't move. Signing up with an email that
already has an account fails with a "log in instead" message and leaves the guest account as it
was. With no anonymous session (signed out), sign-up is the plain `signUp` as before. **Project
setting that matters:** this project has email confirmation **off** (`mailer_autoconfirm: true`), so
the upgrade completes instantly. The code also handles confirmation being turned on (the email is
attached to the same account and it stays a guest until the link is clicked), but that branch has
not been exercised against the real project.

**Sign-out** ends the session but doesn't create a new anonymous one until the next page load.
Until then, like/comment prompts the log-in popup.

Every user (anonymous included) gets a `profiles` row, created by a database trigger (not in
this repo). A user can edit their own `display_name` (the "username", which is what shows next
to their comments), but not `coin_balance` or `is_admin`. The database enforces that, not the
front end.

The consumer app and the admin panel share one browser session (same origin, same default
storage). Logging into the admin panel replaces whatever session that browser had, and signing
out of it leaves the browser with no session until the consumer app is next opened.

## Video: how playback and signed links work

Videos are stored and encoded on Bunny Stream. The `episodes` table stores each episode's
`bunny_video_id`. The browser never gets a permanent public video URL.

1. To play an episode, `video-player.js` calls the Supabase Edge Function
   **`bunny-signed-playback-url`** with the user's login token and the episode id.
2. The function either refuses (no session, or its own "not allowed to watch this" check), or
   returns a short-lived signed HLS URL plus an expiry time (about 10 minutes).
3. `hls.js` plays that URL in a normal `<video>` element (Safari plays HLS natively and skips
   hls.js). Two behaviours worth knowing:
   - Bunny's signature sits in the query string of the *master* playlist URL, but the
     playlist refers to its sub-playlists and segments by relative path, and relative URLs drop
     the query string. So `narravaHlsXhrSetup` re-attaches the signature to every request
     hls.js makes. It detects "already has the signature" by looking for `token=` in the URL.
   - About 30 seconds before expiry, the player fetches a fresh signed URL and swaps the
     signature in for future requests, without interrupting playback. (On native-HLS Safari the
     only way is to reassign `src`, so it saves and restores the position and paused state.)
4. **A refusal is final.** If the function says no, the code never falls back to another URL.
5. If loading fails, it retries up to 3 times with 1s / 2s / 4s waits, then shows a "couldn't
   load, retry" state.

On the mobile feed, the *next* episode is quietly loaded off-screen while you watch the current
one, so a swipe usually lands on something already buffered. At most one preload runs at a time.
What gets preloaded depends on the state: while *watching* a series it's that series' next
episode; while just *browsing* it's the next series' first episode. `maintainPreload()` picks
it, and it is re-run when a series is entered (`enterMobileWatching`), because the target
changes at that moment. Measured on a real connection: the next episode is ready about 4s after
its preload starts (a signed-link call, the playlists, then the first segments, one after the
other), and a swipe onto a ready preload starts in roughly 60–170 ms. A swipe within about 4s of
arriving on an episode is still a cold load (0.6–2s) by design, since only one episode ahead is
loaded and it starts when the previous one appears.
Leaving the feed tears down the video and its timers properly (`destroy()`); anything new that
plays video must do the same, or `hls.js` keeps downloading in the background.

**A freshly uploaded episode can fail to play for a few minutes.** The admin upload saves the
episode row as soon as the file has gone to Bunny, but Bunny then needs time to encode it. The
admin panel says so in a toast. Until encoding finishes, playback will fail and go through the
retry/failure path above.

**Episode views.** `attachViewTracking()` (`video-player.js`) wires both real players (the mobile
For You feed's `promotePreload` in `app.js`, and the desktop Watch page's `watchPlayEpisode` in
`watch.js`) to call `record_episode_view` (RPC) once an episode has genuinely accumulated 3 real
seconds of forward playback — tracked as the sum of real progress between consecutive
`timeupdate` events while the video is actually playing, so a pause, a stall/buffer, or a seek
never counts toward it. `recordEpisodeViewOnce()` keeps an in-memory set so it fires at most once
per episode per page session (replaying the same episode, or seeking back into it, never re-counts
it in the same session) — the database function itself separately counts at most once per person
per episode per day, which is a separate, server-side rule this front end doesn't need to know
about. Fire and forget: never awaited in a way that could delay playback, and a failure only ever
reaches the console. Only the episode id is ever sent — never a user id, series id, or a count
computed in the browser.

## Nava Coins: balance, locks, unlocking, buying

Everything lives in `js/coins.js`. The rule for this code: **the browser only shows what the server
says and asks the server to act.** It never adds, subtracts or stores coins or unlocks as the source
of truth, and never sends a price, amount, coin count or user id. The old placeholder economy is
gone (removed 2026-10-03): the hard-coded `coins = 3`, the 2-coin `coinCost`, the per-slide
`unlockedEpisodeIds` Set, the NG/CA `regions` price table and the fake "Pay" button that added
coins after a 900 ms timeout.

**Balance.** `profiles.coin_balance` for the signed-in person (`coinState.balance`). Anonymous
visitors always show 0. It is shown in the feed's coin chip, Profile → My Wallet, the Get Coins
sheet and the unlock prompt (`renderCoinBalances()`; elements marked `data-coin-balance` update
too). Re-read after an unlock (the RPC returns it), after the welcome bonus, after a confirmed
purchase, whenever the account changes, and whenever the tab comes back to the foreground
(`visibilitychange`).

**The lock rule** (`isEpisodeUnlocked(freeEpisodeCount, ep)`), used by both players and every
episode grid. An episode is unlocked if ANY of these is true:
1. its number is within the series' `free_episode_count`;
2. Free Mode is on (`app_settings.free_mode_enabled`);
3. `my_subscription()` returns an active plan;
4. an `episode_unlocks` row exists for it (the person's own rows).

Otherwise it is locked. There is **no admin exception in the app**, so admins see locks like anyone
else. (The server's `can_watch_episode` *does* return true for an admin on a locked episode, checked
2026-10-03, so an admin's locked episode would actually play if requested. The app just never asks.)
Unlocks and subscription are loaded once per app load (`refreshCoinState()`, in parallel with the
slides) and again after an unlock, a confirmed purchase, sign up / log in / sign out. Every change
fires the `narrava:coins-changed` event. `app.js` (`reapplyEpisodeLocks`) and `watch.js` listen and
re-run the rule, so lock icons and the unlock button always match. A locked episode's video is
never requested. The real gate is still `bunny-signed-playback-url`.

**Unlocking** (`openUnlockPrompt(ep, onUnlocked)`), reached by tapping a locked cell in the mobile
jump grid or the desktop episode grid, the feed's "Unlock Ep N · 1 Nava Coin" button, or the desktop
player's locked panel:
- Anonymous: the sign-up popup opens with "You need an account to unlock episodes."
- Signed in with **0 coins**: `my_ad_status()` is asked first (a short loader shows meanwhile). If
  the server says `ads_enabled` and `eligible`, the prompt opens straight on "You need 1 Nava Coin"
  with Get Nava Coins **and** the ads section ([below](#watch-ads-to-unlock-google-rewarded-ads)).
  Otherwise it's the usual prompt.
- Signed in: "Unlock this episode for 1 Nava Coin", the balance, Unlock / Cancel. Unlock calls
  `unlock_episode_with_coin(p_episode_id)` (the button is disabled while it's in flight, so a double
  tap sends one request), then:
  - `unlocked` / `already_unlocked` / `free` / `subscribed`: local state is updated from the server's
    answer, the balance is the one returned, and the episode plays.
  - `insufficient_coins`: "You need 1 Nava Coin" with a button that opens Get Coins (plus the ads
    section, if the server allows ads for this person).
  - anything else, or an error: an honest toast, nothing changes.

**Buying coins** (the Get Coins sheet, `openCoinSheet()`). It opens from the feed's coin chip, the
desktop "Top Up" button, Profile → Top Up / My Wallet, and the "insufficient coins" prompt. It is a
body-level popup, so it works from any screen.
- Packs come from `coin_packs` (active, sorted by `sort_order`) and are shown in the chosen currency,
  Naira (`price_ngn_kobo / 100`) or US Dollar (`price_usd_cents / 100`). Under Naira: "Naira
  payments need a Nigerian card or bank account." Packs and the Coin Payments switch
  (`app_settings.coin_purchases_enabled`) are re-read every time the sheet opens. When the switch is
  off, the sheet only says "Buying coins isn't available right now".
- Anonymous visitors can see the packs, but tapping one opens the sign-up popup.
- Tapping a pack calls the Edge Function `paystack-init` through `supabaseClient.functions.invoke`
  with **only** `{ kind: 'coin_pack', itemId, currency }`. It returns `{ reference, accessCode }` or an
  error code: `sign_up_required` opens sign up; `coin_purchases_disabled`, `unknown_pack` and
  `paystack_unavailable` each get a clear message.
- Paystack's official inline script (`https://js.paystack.co/v2/inline.js`) is loaded on first use,
  and the payment opens with `new PaystackPop().resumeTransaction(accessCode, { onSuccess, onCancel,
  onError })`. **No Paystack key of any kind is in the frontend.**
- **`onSuccess` is not proof of payment.** Coins are credited only by the server's webhook after
  Paystack confirms. On `onSuccess` the sheet shows "Confirming your payment…" and polls
  `purchases.status` for that `paystack_reference` every 2 s for up to 60 s:
  - `completed`: balance and unlocks are refreshed, then "Coins added".
  - `refunding` / `refunded` / `refund_failed`: "Naira payments need a Nigerian card. Your payment
    is being refunded."
  - `failed`: "The payment didn't go through. No coins were added."
  - still `pending` after 60 s: "Payment received, your coins will appear shortly." The foreground
    balance refresh picks the coins up later.
- `onCancel` resets the sheet quietly. Only one purchase can run at a time, so the packs and
  currency buttons are disabled while one is in progress. Closing the sheet doesn't stop the
  confirmation; a "Coins added" toast appears when it lands.

**Welcome bonus.** `claim_welcome_bonus()` is called once per app load for signed-in email
(non-anonymous) accounts, and right after a successful sign up, account link or log in. It is never
called for anonymous visitors. The server pays it only once. On `granted`, the balance is refreshed
and a toast shows "Welcome! You got 5 free Nava Coins"; any other status is silent. A sign-up that
still needs email confirmation is still anonymous, so the bonus comes on the first load or log in
after confirming. Existing email accounts get it too, the first time they load this version.

## Watch ads to unlock (Google rewarded ads)

`js/ads.js`, shown inside the unlock prompt from `coins.js`. Same rule as coins: **the browser
never counts ads or earned episodes.** Every number on screen is the server's answer, shown as-is.

**The server (not in this repo, not changed by this work):**
- `app_settings.ad_unlock_enabled`: the Ad Unlock switch in System Settings.
- The ladder, per **Lagos calendar day** (resets at midnight Lagos time): 2 ads earn 3 episodes, then
  4 more ads earn 3 more, then 6, 8 and 10 more. 30 ads (15 episodes) is the daily maximum.
- `my_ad_status()` returns one object `{ status, ads_enabled, eligible, ads_today,
  episodes_earned_today, episodes_available, next_step_at, ads_needed_for_next,
  daily_limit_reached }` (checked live 2026-10-05).
- `record_ad_view()` records one completed ad. It accepts at most 30 a day, at least 20 seconds
  apart, and only for real email accounts with 0 coins and no subscription. It returns `status` =
  `recorded` / `too_soon` / `daily_limit` / `has_coins` / `subscribed` / `ads_disabled` /
  `sign_up_required` / `not_signed_in`, plus the fresh ad status.
- `unlock_episode_with_ad(p_episode_id)` spends one earned unlock. Returns `unlocked` /
  `already_unlocked` / `free` / `subscribed` / `no_ad_unlocks` / `ads_disabled` / `sign_up_required` /
  `not_signed_in` / `not_found` / `no_profile`, plus the fresh ad status. It writes an
  `episode_unlocks` row with `unlocked_via = 'ad'`, which stays forever like a coin unlock, so the
  app's lock rule and `can_watch_episode` already treat it as unlocked.

**Who sees the ads section:** a signed-in real account with 0 coins, no active subscription, and
`my_ad_status` saying `ads_enabled` and `eligible`. People with coins, subscribers, anonymous
visitors (they get the sign-up popup) and everyone when Ad Unlock is off see the prompt exactly as
before. `my_ad_status` isn't even called for people with coins or a subscription.

**What the section shows** (under "Get Nava Coins", after an "or watch ads" divider):
- `episodes_available > 0`: **Unlock with ads (X left today)** calls `unlock_episode_with_ad` and, on
  success, plays the episode exactly like a coin unlock (the same `onEpisodeUnlocked` in `coins.js`).
- otherwise, limit not reached: "Watch N more ads to unlock 3 episodes" (N = `ads_needed_for_next`),
  "Ads watched today: X", and a **Watch ad** button. After a recorded ad the status is re-read from
  the server; once episodes are available the unlock button appears.
- `daily_limit_reached`: "You've used today's ad unlocks. Come back tomorrow, or get Nava Coins."
- Messages: `too_soon` -> "Please wait a few seconds before the next ad."; `no_ad_unlocks` -> "No ad
  unlocks left..."; no fill -> "No ad available right now, please try again later."; closed early ->
  "The ad was closed before the end, so it didn't count."; rewarded not supported -> "Ads can't be
  shown on this device or browser..."; gpt.js blocked (ad blocker) -> its own message. If the server
  says the person is no longer eligible (e.g. `has_coins`), the section disappears and the message
  becomes a toast.
- Every button is disabled while anything is in flight (`adState.phase`), so double taps send one
  request, and only one ad can load or show at a time.

**The Google side (`runRewardedAd()` in `ads.js`):**
- **The ad unit is one constant at the top of `js/ads.js`:**
  `NARRAVA_REWARDED_AD_UNIT = '/22639388115/rewarded_web_example'`. That is **Google's public test
  unit** (it serves a Google "Linear VPAID" test video). **Once Narrava's own Google Ad Manager
  account is approved, replace that one line** with Narrava's real rewarded unit path
  (`'/<network code>/<ad unit code>'`), then bump `ads.js`'s `?v=` in `index.html` and `CACHE_NAME`
  in `sw.js` as usual. Nothing else changes.
- `https://securepubads.g.doubleclick.net/tag/js/gpt.js` is loaded **only when someone taps Watch
  ad**, never on page load, and never on the admin pages.
- `googletag.defineOutOfPageSlot(unit, googletag.enums.OutOfPageFormat.REWARDED)`. A `null` slot
  means GPT says this page/browser doesn't support rewarded, and the person is told so.
- `rewardedSlotReady` -> `makeRewardedVisible()` straight away (the tap on Watch ad is the opt-in).
- `rewardedSlotGranted` -> `record_ad_view()`. **This is the only place it is ever called.** The UI
  then re-reads `my_ad_status`.
- `rewardedSlotClosed`, `slotRenderEnded` with `isEmpty`, or nothing within 20 s -> the slot is
  destroyed (`googletag.destroySlots`) and its listeners removed, so the next request starts clean.
  Closing the unlock prompt while an ad is still *loading* drops it.
- GPT adds a `#goog_rewarded` history entry while an ad shows (so Back closes the ad) and leaves it
  in the URL afterwards. When the ad closes, `clearRewardedHash()` removes the fragment from that
  same entry with `history.replaceState` (its state kept as-is, no new entry, the app's own `nav.js`
  entries untouched). GPT's entry itself stays in the history, so the first Back after an ad
  still lands on the previous Narrava entry and closes the open prompt.
- When the ad becomes visible, the episode behind it is paused (`pauseEpisodesForAd()`, which calls
  `pauseCurrentFeedEpisode()` in `app.js` and `pauseCurrentWatchEpisode()` in `watch.js`, each
  pausing exactly like a tap: paused state shown, progress saved). After the ad it **stays paused
  at the same spot**; the person resumes it. (An episode that's still *loading* when the ad appears
  can start once it loads; not handled.)

**Where it works (tested 2026-10-05):** Google's test rewarded ad filled and played in desktop
Chrome on `localhost` (Live Server). The reward fired after the countdown, `record_ad_view` returned
`recorded`, and closing early (Google's own "Skip video? You will lose your reward") recorded
nothing. Google's docs say rewarded is only requested on mobile-optimized pages; `index.html` has
the needed `width=device-width, initial-scale=1` viewport. Not yet tried on a real phone, in
Safari/iOS, or in the installed PWA. Real (non-test) units also depend on Ad Manager approval, fill
rate and consent.

**The honest limit.** On the web, "the ad was watched" is reported **by the browser** (GPT's
`rewardedSlotGranted` event firing in the page). There is no server-to-server reward callback for
web rewarded ads like the mobile SDKs have, so a determined person could call `record_ad_view` from
the console without watching anything. That's why the server caps it: 30 a day, 20 seconds apart,
real 0-coin accounts only, at most 15 episodes a day. The cap is the protection, not the browser.

**Before ads go live with a real ad unit:** the privacy policy must name **Google** as an
advertising partner (cookies/identifiers used for ads, personalisation and measurement), and where
the law requires it, consent must be collected before ads are requested. The privacy policy files
were deliberately not changed by this work.

## Membership and VIP

**Membership screen** (`membership.js`, `#membershipScreen`). Opened from Profile's "Narrava
Membership" banner or the VIP tab's "Get yearly". It's built like History and Help & Feedback (same
`.library` shell, header and back arrow), Profile stays the highlighted tab, and Back returns to
where it was opened from. Everything on it comes from the server and is re-read each time it opens:
the plans (`subscription_plans`, active, sorted by `sort_order`), the Subscription Payments switch
(`app_settings.subscriptions_enabled`) and the person's own `my_subscription()`.
- **Not subscribed:** each plan shows its name, "N days of unlimited watching" (the plan's own
  `days`, which already include bonus days), and the price in the chosen currency, plus a
  Subscribe button. It uses the same Naira / US Dollar toggle and naira note as Get Coins (one
  shared choice). Yearly carries a small "Includes VIP" label.
- **Subscribed:** the plan name, "Unlimited watching until 12 Nov 2026" (`ends_at`, in History's
  date style via `formatShortDate`), and what's included: "Every episode unlocked", plus "VIP" when
  `is_vip`. Below it is the same plan list with **Extend** buttons and the line "Extra days are added
  after your current end date."
- **Switch off:** the plans and prices still show, with no Subscribe/Extend buttons and the line
  "Subscriptions aren't available yet." Anyone already subscribed still sees their own status.
- **Anonymous:** the plans show, and Subscribe opens the sign-up popup with "You need an account to
  subscribe."

**Subscription payments.** These use the **same** purchase flow as coin packs,
`startPaystackPurchase(kind, itemId)` in `coins.js`. There is one copy, used by both the Get Coins
sheet and the Membership screen; only one payment can run at a time, and every buy/extend button is
disabled while one does. The browser sends only `{ kind: 'subscription', itemId: 'weekly' | 'monthly'
| 'yearly', currency }`, never a price, days or a user id. Extra `paystack-init` errors:
`subscriptions_disabled` ("Subscriptions aren't available yet.") and `unknown_plan`. As with coins,
`onSuccess` isn't trusted: "Confirming your payment…" polls the purchases row every 2 s for up to
60 s. On `completed`, the balance, unlocks and `my_subscription()` are refreshed (so every lock
re-checks), the screen re-renders as subscribed, and it shows "You're subscribed. Enjoy unlimited
watching!". Refunds, failures and the 60 s timeout ("Payment received, your subscription will start
shortly.") get the same honest messages as coins. Surfaces re-render on the
`narrava:purchase-changed` event.

**Stacking renewals.** The server's webhook grants the days. Buying again while subscribed adds the
new days **after the current `ends_at`**, so renewing early never wastes days. The app never grants,
extends or stores a subscription itself; it only shows what `my_subscription()` returns.

**Staying current.** `my_subscription()` is re-read on app load, on any account change, after a
purchase, and whenever the tab comes back to the foreground. `hasActiveSubscription()` also treats a
returned plan whose `ends_at` has passed as inactive, and a timer re-asks the server at `ends_at` (if
it's within ~24 days). So an expired subscription locks episodes again without a reload.

**VIP.** VIP means an active **yearly** plan: `my_subscription().is_vip` (`isVipMember()`). The app
never works it out from the plan itself.
- The Home **VIP tab** shows only while `app_settings.vip_section_enabled` is on (read at startup with
  the other settings). Off means the tab is hidden; the desktop shelves never had one. When shown,
  a gold card sits above the existing posters, which keep their "Coming soon" toast. A VIP sees
  "You're a VIP member" with a crown and the VIP badge; everyone else sees "VIP is for yearly
  members" with a "Get yearly" button that opens Membership. **No VIP perks are listed anywhere**,
  because none have been agreed yet.
- **VIP badge:** a small gold "VIP" next to the person's own name on their own Profile, only while
  `is_vip`. It's never shown on comments or anywhere else.

## Watch progress and Continue Watching

While something plays, the position is saved to `watch_progress` (one row per user + episode,
upserted) every 15 seconds, on pause, and when leaving the episode. Reading it back uses the
`get_continue_watching` database function, which returns the viewer's in-progress rows.

That one result feeds two things: opening any series silently resumes at the saved episode and
position (if more than half a second in), and on mobile Home a small floating "Continue" bar
shows the most recent one (dismissing it lasts only until the next page load).

The History screen reads the same table through `get_watch_history`. Nothing in the front end
ever deletes a `watch_progress` row: finishing an episode or a series leaves its row in place
(only an upsert of the position). Whether the *database* removes rows — for example a cascade
when an admin deletes an episode or series — can't be seen from this repo; if it does, those
rows drop out of History too.

## Likes, saves, comments

All in `social.js` and `comments-panel.js`, against real tables (`series_likes`, `series_saves`,
`series_comments`, `comment_likes`).

- **The four numbers under the icons** (like, comment, share, save) appear in both the mobile
  feed's action rail (`#likeCount`, `#commentCount`, `#shareCount`, `#saveCount`) and the
  desktop Watch page's row (`#watchLikeCount` … `#watchSaveCount`). They're all loaded together,
  once per series, by `fetchSeriesSocialState()` (`social.js`) — called from
  `loadFeedSocialState` (`app.js`) and `loadWatchSocialState` (`watch.js`) — and shown as plain
  whole numbers (`0`, `13`, `24`; no "1.2K" shortening), in the same span that shows the word
  ("Like", "Share", "Save") only until the first render. Until a series' numbers arrive, and if
  a load fails (logged as `Narrava: …`), each shows `0`.
  - Like count: `get_series_like_count`. Comment count: the length of `get_series_comments`.
  - Save and share counts: **one** call, `get_series_social_counts(p_series_id)` →
    `fetchSeriesSaveShareCounts()`, which returns a single `{ saves, shares }` row for a
    published series (no row for anything else). The share number is the database's count —
    at most one per person per series per day.
  - After a like/unlike or save/unsave **succeeds**, the real count is re-fetched and shown
    (likes via `get_series_like_count`, saves via `get_series_social_counts`); nothing is guessed
    locally. If the write fails, or the viewer isn't allowed (signed out / anonymous for saves —
    the sign-in modal opens), the toggle returns `null` and nothing on screen changes.
  - After a share **completes** (native sheet resolved, or a fallback action finished — see
    Share counting below), `recordSeriesShare()` fires `narrava:series-shared` once
    `record_series_share` has finished; `app.js` listens, re-fetches that series'
    counts and updates the feed and, via `renderWatchSaveShareCounts()`, the Watch page. Never
    +1 locally: a second share the same day doesn't change the number, and the screen shows that.
- Comments come from one function, `get_series_comments`, which returns every comment and reply
  for a series in a flat list, with like counts, whether *you* liked each, and the author's
  display name. The front end builds the threads from `parent_comment_id`. Replies can nest to
  any depth. Only top-level comments get a "N replies" toggle, which reveals the entire chain
  below them. Long threads have a "Load more".
- Deleting a comment is allowed for its author and for admins, decided by the database's
  policy. The code just attempts it. Deleting a comment also deletes its replies (a database
  cascade, not front-end code).
- **Sharing and deep links.** Share uses the browser's native share sheet, with a small popup
  (copy link / WhatsApp / Facebook) as a fallback. Each series has its own link: the app's page
  plus `#series=<series id>`, for example `https://your-host/index.html#series=1c01…`. Opening
  such a link goes straight into that series (the mobile watching view, or the desktop watch
  page) through the same `openSeriesInFeed` every poster tap uses. The link is built by
  `seriesShareUrl()` and read by `seriesIdFromLocationHash()`, both in `shared-utils.js`, and
  acted on by `openDeepLinkedSeries()` in `app.js` once the series list has loaded. Details:
  - It is a `#` fragment on purpose: the app is one static page, a fragment never reaches the
    server, and the service worker never sees it, so no hosting or `sw.js` changes are needed.
  - The link only names a series. It carries no episode and no unlock, so it can't get around a
    lock: the recipient's app applies the normal rule (`free_episode_count` / Free Mode) itself.
    Extra parts of the fragment (such as `&ep=15`) are ignored. If the recipient has saved
    progress in that series, it resumes there like any other open.
  - The fragment is removed from the address bar after it's read, so refreshing goes to normal
    Home. Pasting a second link into a tab where Narrava is already open also works.
  - An id that isn't in the loaded series list (a draft, a deleted series, a mangled link)
    leaves the viewer on Home with a short "That series isn't available" message. With
    Maintenance Mode on, links are not acted on.
  - There are no social preview cards (title/image when the link is pasted into a chat): those
    need a server to render tags per link, and this is a static site.
  - **Share counting.** `recordSeriesShare()` (`shared-utils.js`) calls `record_series_share`
    (RPC) only when a share has genuinely *completed* — after `navigator.share()` resolves
    successfully (never on cancel or its own error), or after a fallback action in the popup
    actually finishes (the link genuinely copied, or a WhatsApp/Facebook share target genuinely
    opened) — never just from opening the fallback sheet itself. Since `shareSeries()` is the one
    place every share button in the app calls into, this is wired in one place and covers all of
    them. Fire and forget, same rules as episode views above. The browser records every
    genuinely completed share, but the database counts at most one share per person per series
    per day, the same way views are counted once per person per episode per day.

## The admin panel

Open `narrava/admin/login.html` (or the Admin Panel row in Profile). Every admin page calls
`requireAdminSession()` first: no session, or `is_admin` false, redirects to the login page.

**That check is a convenience, not the security.** The admin pages are ordinary static files
anyone can download. What actually stops a non-admin is the database (row-level security
policies restrict writes on series, episodes, genres, and settings to admins) and the admin-only
Edge Functions and database functions. If you add an admin feature, the protection has to live
there.

| Page | What it does |
|---|---|
| **Dashboard** | Stat cards; create a series (title, description, free-episode count defaulting to 10, cover image); quick feature toggle; single-episode upload. |
| **Series List** | Search; publish/draft toggle; feature toggle; edit (title, description, cover, free-episode count, genres); delete. A warning badge marks series with no episodes, since those never appear in the app. |
| **Episodes** | Search; edit number/title; delete; **batch upload** with a queue, auto-numbered episodes and per-file progress. |
| **Genres** | Add, rename, delete. |
| **User Management** | Lists real accounts (not anonymous ones); suspend / unsuspend. |
| **Analytics** | Visits today and last 7 days, unique visitors, a daily chart. |
| **Revenue & Analytics** | Real figures from `admin_revenue_overview(p_days)` only: a period choice, Overview / Coins / Subscriptions / Ads tabs, two alert cards, and the last 50 purchases (below). |
| **Most Watched** | Every series ranked by real views, from `admin_most_watched_series` (already ranked server-side — never re-sorted here). Rank, cover + title, status badge, views, likes, comments, saves, shares. |
| **System Settings** | Free Mode, Maintenance Mode, Featured Series Count, Ad Unlock, Subscription Payments, Coin Payments, VIP Section (below). |

**On a phone (≤860px wide)**, every page above is fully usable, with nothing removed. Details worth
knowing before you change admin UI:
- **The sidebar is a slide-in drawer.** A sticky top bar (menu button, "Narrava Admin", current page
  name) opens it; it closes from the backdrop, the ✕, Escape, choosing a page, or the window growing
  past 860px. Sign-out lives in the drawer (it used to be hidden on phones). Built by
  `setupAdminMobileNav()` in `admin-shared.js`.
- **Tables become stacked cards.** Below 860px each row is a card with a label in front of every
  value. The labels come from the table's own header text: `labelAdminTableCells()` in
  `admin-shared.js` sets a `data-label` on each cell, and re-runs whenever a page re-renders a table,
  so **a new table needs only a normal `<thead>`** and no per-page mobile code. Cells that span the
  whole row (the inline edit and delete-confirm forms) get no label. Icon-only buttons show their
  `title` as text on phones, since there's no hover.
- **Touch sizes.** Below 860px, or on any touch-first device, buttons, icon buttons, the drawer links
  and genre chips are at least 44px tall. Each switch has a 44px-tall hit area (its track is drawn by
  `::before`). Form fields are 16px and 46px tall; below 16px iOS zooms the page when you focus one.
  The desktop sizes are unchanged.
- **Don't put grid columns in an inline `style`** on a row that has to stack; an inline style can't be
  overridden by the phone rules. Use a class in `admin.css` (see `.admin-row-create`, `.admin-row-two`,
  `.admin-row-add`).
- Tested at 320, 360, 390 and 820px wide: no sideways page scroll, no target under 44px, no field under
  16px, on every page and in every inline edit / confirm state. Also tested: the same full sequence of
  actions on desktop and at 390px produced an identical list of backend writes. That was against a
  simulated backend, since real admin access wasn't available; it hasn't been run on a physical phone.

Details worth knowing:

- **New series start as drafts.** Publish them from Series List. The consumer app doesn't filter
  on `status` itself; hiding drafts relies on the database policy on `series`, so be careful if
  that policy ever changes. A series also needs at least one episode to show up anywhere.
- **Cover images** go to the `cover-images` Supabase Storage bucket. Replacing a cover deletes
  the old file (only if it was one of ours, not a pasted external URL).
- **Uploading an episode**, in order (`uploadEpisodeToBunny`, `admin-shared.js`): ask the
  `bunny-upload-init` Edge Function for permission → stream the file straight to Bunny over tus
  with real progress → only *after* that succeeds, insert the `episodes` row. If the last step
  fails, the message tells you the Bunny video id so the record can be recovered. `duration_seconds`
  is always saved as null; nothing fills it in, so the admin duration column shows "—".
- **Deleting an episode** removes the Bunny video first (`bunny-delete-video`) and the row second.
  If Bunny fails, the row is left alone.
- **Deleting a whole series** goes through every episode first (`handleDelete` in
  `admin-series-list.js`), in order: read the series' current episodes; for each, delete its video
  from Bunny (`bunny-delete-video`) and only then its database record; and only once every episode
  is gone, delete the series row (genre links cascade). Any failure stops right there with an error
  in the confirmation row saying which episode failed and how many were already fully removed. The
  failed episode and everything after it, and the series itself, are left intact, and the button
  becomes "Retry Delete", which carries on with what's left. A stop never leaves an episode record
  pointing at an already-deleted video. **Not verified against real Bunny:** what
  `bunny-delete-video` answers for a video that is already gone. If it returns an error, a retry
  after a failed record delete (the video is deleted, the record isn't) would stop on that
  episode; single-episode delete has the same edge. Tested only against a simulated backend so far.
- **Suspending a user** goes through the `admin-suspend-user` Edge Function, which sets
  `banned_until` on the account far in the future (unsuspend clears it). It refuses to suspend
  the admin's own account.
- **User counts exclude anonymous accounts** by requiring an email. The Dashboard's
  "Registered Users" comes from a different function (`admin_total_users`), and whether *it*
  excludes anonymous accounts can't be seen from this repo. The User Management page
  deliberately avoids `admin_user_stats` because that one was found to count them.
- **Analytics** counts one `page_visits` row per real page load of the consumer app
  (`visit-log.js`, called once from `init()`). Admin pages never log a visit. "Unique visitors" is
  unique *accounts*, and since anonymous accounts are created per browser, clearing site data
  makes someone a new visitor.
- **Revenue & Analytics** (`admin/revenue-analytics.html`, `js/admin-revenue.js`, rebuilt
  2026-10-05). **Every figure comes from one database function, `admin_revenue_overview(p_days)`,**
  which refuses non-admins. The page only displays its answer. It never reads `purchases`,
  `coin_transactions` or any other table for money, never estimates, and never shows an example
  number. The only arithmetic is adding rows of the **same** currency together (coin-pack naira +
  subscription naira) and dividing kobo/cents by 100 for display. (`coin_packs` is read only to
  label a purchase "50 coins"; no figure depends on it.)
  - **The currency rule: naira and dollars are always shown separately.** Never converted, never
    added together, each in its own card. `amount_minor` is kobo for NGN and cents for USD:
    ₦ = kobo / 100 with thousands separators (₦20,000, or ₦20,000.50 when there are kobo),
    $ = cents / 100 always with two decimals ($5.00). An unexpected currency is shown raw in its
    own card, never merged.
  - **Period:** Today, 7 days, 30 days, All time re-call the function with `p_days` 1 / 7 / 30 /
    3650. Checked live 2026-10-05: the function treats a missing `p_days` as 30, 0 as 1, and caps
    it at 3650. Money uses `totals_period`, except **All time, which uses `totals_all_time`**.
    The ads `*_period` figures always follow `p_days`, so under All time they're captioned
    "All time (last 3,650 days)". Captions say "Last 1 day" rather than "Today", because the code
    can't tell whether the server's day is the Lagos calendar day or the last 24 hours.
  - **What doesn't follow the period:** `coins` (bought / welcome / spent) came back identical for
    every `p_days` (bought 210 even for 1 day, when the coin packs were bought two days earlier),
    so they're shown as all-time figures. `active_subscribers` is "right now".
  - **Overview:** revenue per currency (coins + subscriptions), number of purchases, active
    subscribers in total, ad views (views_today under Today, views_period otherwise), and two alert
    cards that appear **only when above 0**:
    - **Needs review** (`needs_review`): failed purchases a person has to look at, typically a
      payment whose amount or currency didn't match what was expected. Text: "A payment didn't
      match what was expected. Check Paystack before refunding or crediting manually." Don't credit
      coins or days by hand until Paystack confirms what was actually paid.
    - **Refunds that failed** (`refunds.refund_failed`): the server tried to refund (e.g. a
      foreign card on a naira payment) and Paystack's refund didn't go through. Text: "Refund
      manually in Paystack."
  - **Coins:** coin-pack revenue per currency, number of coin-pack purchases, coins bought /
    welcome coins given / coins spent.
  - **Subscriptions:** subscription revenue per currency, purchases, and active subscribers per
    plan. Weekly, Monthly and Yearly are always listed (0 when none); an unexpected plan id is
    listed too.
  - **Ads:** ad views today, ad views in the period, people who watched ads, episodes unlocked
    with ads, and the line "Ad earnings are reported in your Google Ad Manager account, not here."
  - **Recent purchases** (below the tabs, independent of the period): the function's last 50
    purchases, any status. Date (Lagos time), email, what ("50 coins" from `coin_packs`, or the
    plan name), amount in its own currency, and a status badge: completed green, pending grey,
    failed red, refunded / refund_failed / refunding orange. `failure_reason` shows as small text
    under the badge. The table scrolls inside its own box (560px tall on desktop, 70% of the screen
    on a phone, where rows stack as cards like every admin table).
  - **Loading and errors:** stat-card and table skeletons while loading. A failure, or no answer
    within 20 s, shows "Couldn't load revenue figures" with a Try again button, so it never sticks
    on the skeleton. Switching period while a request is in flight only renders the latest one.
  - **Removed in the rebuild:** the old `admin_total_revenue` call and lifetime "Total Revenue"
    card, the direct reads of `purchases` (an `amount` column, every row counted regardless of
    status) and `coin_transactions`, the 7-week bar chart, the Revenue Sources legend, the
    "Inactive" Subscriptions and Ad Revenue cards, the "Top Performing Series" table (coin spend
    guessed per series through `reference_id`), and their CSS (`.admin-bar-chart`,
    `.admin-legend-*`). The Dashboard's own "Total Revenue" card still uses `admin_total_revenue`
    and wasn't changed.
- **System Settings** is one row in `app_settings`, readable by everyone and writable only by
  admins. The consumer app reads it once at startup:
  - *Free Mode*: nothing is treated as locked. Per-series free-episode counts aren't changed;
    they're just ignored while it's on.
  - *Maintenance Mode*: the consumer app replaces the whole page with an animated maintenance
    scene before doing anything else, including creating an anonymous account — the same
    `init()` gate as before, just a different screen. The animation itself comes from
    `maintenance.html` at the repo root — a hand-built reference file, kept there unmodified —
    ported into `maintenanceMarkupHtml()` (the markup) and `startMaintenanceAnimation()` (its
    script, moved into a real function since `innerHTML` doesn't execute `<script>` tags; the
    render logic, easing and timing are untouched) in `js/app.js`, styled by the scoped rules in
    `css/styles.css`. **This is the one screen in the app that draws its own version of the
    Narrava logo** (its "loose piece" has to animate separately from the rest of the shape) —
    everywhere else in the app, the loader included, uses `NARRAVA_LOGO_SVG` and only
    `NARRAVA_LOGO_SVG`. The file's seven custom properties (`--paper`/`--ink`/`--muted`/`--green`/
    `--green-deep`/`--spark`/`--metal`) are renamed `--mt-*` and defined once on `.maintenance-screen`
    itself, always at that file's dark-theme values (this app has no light mode) — every rule the
    file wrote globally (`body`, `main`, `h1`, `p`, `button`, `.ink`, `.fill-*`, `.no-fill`) is
    scoped under `.maintenance-screen` too, so none of it can leak into, or be affected by, the
    app's own `--ink`/`--muted` or its other pages' `h1`/`p`/`button` styles. The Bricolage
    Grotesque stylesheet link the file loads is added to `<head>` only while this screen is
    showing (`ensureMaintenanceFont()`), with the file's own system-font fallback stack kept as-is
    for if it doesn't load in time. While the screen is up, `checkMaintenanceStillOn()` re-runs
    the same public `app_settings` read every 60 seconds (one `setInterval`, cleared before any
    replacement so there's never more than one) and reloads with one `location.reload()` **only**
    when that read explicitly comes back with no error, a real row, and
    `maintenance_mode_enabled === false`; any error, timeout, or missing/empty/still-true data
    does nothing and waits for the next interval — no toast, no assumption that silence means
    "off". A `maintenanceCheckInFlight` guard skips a tick outright if the previous check is still
    waiting on a slow response, so a slow read can never stack a second one on top of it.
    (`loadAppSettings()` itself — the shared startup read every other page uses — is unchanged;
    this recheck performs its own explicit-success read rather than trusting that function's
    side effects.) Under `prefers-reduced-motion: reduce`, the scene freezes on one frame and only
    the heading/paragraph keep animating, exactly as `maintenance.html` itself does. The admin
    panel is unaffected, so it can always be switched back off.
  - *Featured Series Count*: how many featured series the desktop banner shows (falls back to a
    random series if none are featured).
  - *Ad Unlock* (`ad_unlock_enabled`), *Subscription Payments* (`subscriptions_enabled`), *Coin
    Payments* (`coin_purchases_enabled`): three more switches on the same row, saved through the
    same `updateSetting()` path. Coin Payments gates the Get Coins sheet and Subscription Payments
    gates the Membership screen's buttons; the server's `paystack-init` enforces both as well. Ad
    Unlock turns on watch-ads-to-unlock (see
    [Watch ads to unlock](#watch-ads-to-unlock-google-rewarded-ads)); the server enforces it.
  - *VIP Section* (`vip_section_enabled`, off by default): shows or hides the Home VIP tab. Helper
    text: "Shows the VIP tab in the app. Perks for yearly members will be added once agreed." It's
    built exactly like the other switches and saved through the same `updateSetting()`. All seven
    settings are read and written as one column list (`SETTINGS_COLUMNS` in `admin-settings.js`), so
    a new setting is added there once.
  - If the settings can't be loaded, the app quietly uses safe defaults (nothing overridden).

## Privacy policy page

`privacy.html` (next to `index.html`) is Narrava's public privacy policy — the link the app
stores ask for, at `/privacy.html`. Help & Feedback → Privacy Policy opens it in a new tab.

- **Word for word.** Its text is `PRIVACY_POLICY.md` (in the repo root, outside `narrava/`) exactly — the HTML only adds structure
  (headings, paragraphs, lists). Nothing is reworded, shortened or added; not even a site name or
  a "back" link. To change the policy, edit `PRIVACY_POLICY.md`, then mirror the change into
  `privacy.html` exactly, and re-check that the two match (strip the Markdown markers and
  compare line by line). The bracketed placeholders — `[DATE]`, `[LEGAL COMPANY NAME]`,
  `[REGISTERED ADDRESS]`, `[MINIMUM AGE]` — are deliberately still in both and stay until the
  real details exist.
- **Static.** Plain HTML with its own inline CSS (the app's dark colours and Montserrat, the
  same Google Fonts link the app uses). **No scripts of any kind**: it never loads supabase-js,
  `app.js` or anything else, so it never runs the app's init, the maintenance-mode check or the
  anonymous sign-in, and it stays readable during Maintenance Mode. Don't add scripts or link
  `styles.css` to it.
- It's in `sw.js`'s precache list, so it also opens offline once the app has been installed.
- `PRIVACY_POLICY.md` is the source text and lives in the repo root, deliberately outside the
  deployed `narrava/` folder, so it is never served — `privacy.html` is the only public copy.

## Installable app (PWA)

`manifest.json` + `sw.js` + `pwa-install.js`. On Android/Chrome the app can be installed from a
banner or a button in Profile; on iPhone (which has no install prompt for websites) it shows
"Tap Share, then Add to Home Screen" instructions. That covers **every real browser on iPhone**
(Safari, Chrome, Firefox, Edge…), not just Safari, since iOS 16.4 let them all add to the home
screen. Webviews embedded in other apps (Facebook, Instagram, Line, WeChat…) can't add to the home
screen, so they get nothing; see `isIOSBrowserThatCanInstall()` in `pwa-install.js`.

**When the install popup shows.** Two moments **every visit**, until the app is genuinely installed:
once on a normal visit, and once more after watching part of an episode (3+ seconds) and returning
to Home. Closing or cancelling it only dismisses it for the rest of that visit. Nothing about "already
shown" is stored on the device (it used to be, in `localStorage`, so anyone who closed it once never
saw it again; those old `narrava_pwa_*` keys are ignored now). The **only** thing that ends the
prompts is the app actually running installed: `isStandaloneDisplay()` (`display-mode: standalone`,
`navigator.standalone`, or an `android-app://` referrer), or the browser reporting `appinstalled`
(for the rest of that visit). One limit: a browser cannot tell a page that the app is installed
elsewhere on the device, so someone who installed it but opens it in a browser tab will still see the
popup there. Never on a desktop-width window.

**Profile "How to install" button.** Always visible near the top of the Profile screen, at the far
end of the header row opposite the avatar and username, whether or not the automatic popup has been
shown, closed or skipped. It opens the same modal the automatic popup uses, not a second flow. One
function, `installVariant()` in `pwa-install.js`, decides what that modal says, for both: the real
browser install prompt (with an Install button) where the browser offers one; the Share → Add to
Home Screen steps on an iPhone browser; "open it in Safari or Chrome first" inside another app's
embedded browser; "already installed" when running as the installed app; and an honest "this browser
doesn't offer a one-tap install" note (with what to do instead) everywhere else. The button does not
touch the automatic popup's per-visit flags, so using it never uses up an automatic chance.

**Installed iPhone: the strip at the bottom (iOS 26).** Cause found; fix applied 2026-09-30; **not yet
confirmed on a device.**

*What was measured on a real iPhone (screen 390x844):* `innerHeight` 797, i.e. 47px short. The screens
inside `.phone` all reached the full height (checked), and edge markers showed that iOS paints nothing
past its 797px drawing area, whatever height the page's CSS claims. So no CSS extension can work; the
earlier attempts (`100dvh`, `position:fixed; inset:0`, a dark `html` background, then extending `.phone`
by the shortfall in `layout-guard.js`) were all doomed for that reason.

*What it is:* a documented iOS 26 behaviour, not a bug in this app. With
`apple-mobile-web-app-status-bar-style: black-translucent`, iOS draws the page from the top of the
screen but sizes its drawing area as if the status bar were subtracted, stranding the last 47px at the
bottom. Three unrelated projects measured the identical 797/844 on iOS 26 and reached the same
conclusion; WebKit has an open iOS 26 bug that the `viewport-fit=cover` handling regressed
(bugs.webkit.org/show_bug.cgi?id=301108). Reported fixes that work: switch to an opaque status bar (iOS
then keeps the top strip for itself and gives the page the rest of the screen, to the true bottom). A
fix that does not: any CSS/JS height change.

*The fix:* `index.html` now uses `apple-mobile-web-app-status-bar-style: black` (opaque black). Because
the page then starts *below* the status bar, top-anchored UI must not also leave room for one:
`styles.css` uses `--top-safe` (46px by default, exactly as before) and, only on an installed phone app
(`html.standalone-app`, set by an inline script in `<head>`, phone widths), `env(safe-area-inset-top) +
12px`. The `layout-guard.js` bottom extension is switched off (`shortfall` is always 0); the file now only
measures and powers the diagnostics panel. **Tradeoff:** the video no longer draws under the status bar;
there is a black system status bar strip at the top. **After deploying, remove the app from the Home
Screen and add it again** (the status bar style is commonly reported to be fixed at install time; not
verified here). If a strip is still there, open the diagnostics panel (tap the Profile avatar 5 times
quickly, or `?layout=1` in a browser tab) and use **Edge markers**. Caveat on that test: RED/BLUE/GREEN
bars can only prove "not painted past the viewport" when the panel says the missing edge is BOTTOM; if it
says TOP, BLUE sits exactly under GREEN and is hidden.

*Manifest display:* it is `"display": "standalone"`. WebKit's own post says iOS 16.4+ accepts `standalone`
or `fullscreen` in the manifest and opens either as an app; nothing found says `fullscreen` changes this
viewport shortfall or hides the status bar on iOS, so it was left alone. iOS 26.1 reportedly also made
Home Screen web apps use an opaque status bar in some situations; either way `black` is the safe choice.

## Things that are easy to get wrong

**1. The service worker can keep serving old files after you deploy.** `sw.js` answers requests
for the app's own files from its cache first and only goes to the network when it has nothing
cached. The cache name is currently `narrava-shell-v31` and old caches are deleted only when the name
*changes*. So after changing any app file, people who have already visited can keep getting the
old version. **Bump `CACHE_NAME` in `sw.js` whenever you ship a change.** The service worker's
scope is the whole `narrava/` folder, so this affects the **admin pages too**, not only the
consumer app. (Read from the code, not tested against a live deployment.) The `?v=` numbers on
some script tags in `index.html` are a manual cache-busting habit and don't replace this.
`sw.js`'s precache list is also hand-maintained; it doesn't include `visit-log.js`, and a new
script won't be listed unless added (`coins.js` and `ads.js` are). **Testing locally with VS Code Live Server:**
Live Server reloads the page every time a file is saved, and the service worker then caches whatever
it fetched under the new `?v=` number, which can be a half-edited file. If a change seems to be
missing, clear the site's caches (DevTools → Application → Clear storage) and reload.

**2. Supabase's API layer can keep serving an old version of a database function.** The API in
front of Postgres (PostgREST) caches the database's structure. After creating or changing a
function (RPC) or a table, the change may not be visible to the app until that cache is told to
reload; the usual fix is running `NOTIFY pgrst, 'reload schema';` in the SQL editor. This is
general Supabase behaviour, not something demonstrated in this repo. It applies to every RPC the
app calls (listed below), and matters most for the ones you'll edit. If an RPC "isn't updating",
or returns a not-found error right after you created it, try this first.

**3. Script order matters, and everything is global.** `index.html` loads scripts in a fixed
order, and files call functions defined in other files (for example `app.js` calls
`renderProfileScreen()`, which lives in `profile.js`, loaded later). That works because those
calls happen after everything has loaded, but a new file has to go in the right place in the
list, and names must not collide across files. The current order: `protect` → `layout-guard` → `config` → supabase-js → hls.js
→ `supabase-client` → `shared-utils` → `video-player` → `watch-progress` → `visit-log` →
`social` → `comments-panel` → `feed-data` → `app` → `discover` → `library` → `history` → `help` → `watch` → `auth` →
`profile` → `pwa-install` → `nav`. Admin pages load `config`, supabase-js, `supabase-client`,
`shared-utils`, `admin-shared`, and one `admin-<page>.js` each.

**4. Most of the backend isn't in this repo.** The tables, row-level security policies, database
functions, the trigger that creates profiles, the four Edge Functions, and the storage bucket
were all set up directly in Supabase. The list below is reconstructed from what the front-end
code calls. **If the Supabase project were lost, this repo could not recreate it.** Exporting the
schema and the Edge Function source into the repo (a `supabase/` folder) would fix that and is
worth doing.

**5. The client-side "locked" state, and what the server actually enforces.** The lock icons
come from the browser's copy of the server rule (see
[Nava Coins](#nava-coins-balance-locks-unlocking-buying)), and a locked episode's video is never
requested. The real gate is `bunny-signed-playback-url`, whose source isn't in this repo.
**Verified (2026-09-20, anonymous account):** for the 29-episode series with 10 free episodes, the
function returned a link for episodes 1–10 and *refused* episodes 11–29. Two known differences
between the app and the server: admins (the server lets them watch everything, the app shows them
locks), and Free Mode (not yet checked against the function).

**6. Saving/Library don't work for anonymous visitors** until they sign up (which upgrades the
same account, so nothing is lost; see Accounts). Logging in to a *different* existing account does
not carry a guest's history over. Both are by design, but they surprise people.

**7. Errors mostly go to the browser console.** Failed Supabase calls are caught and logged as
`Narrava: …` with a friendly toast where a person needs to know. When something "just doesn't
happen", open the console first.

**8. Small leftovers:** `BUNNY_LIBRARY_ID` in `config.js` is unused now (it was for the old
iframe player). `feed-data.js` is ~370 KB because two placeholder cover images are embedded in it
as base64 text; they're only used for series with no cover. The page title still says "mockup".

**9. Mouse wheel / trackpad dead on the admin pages (fixed 2026-09-28).** `styles.css` had
`html,body{overflow-x:hidden; overscroll-behavior-y:none}`. Neither property alone does harm, but the
combination on `<body>` is fatal: `overflow-x:hidden` on both `html` and `body` makes `<body>` a scroll
container, and `overscroll-behavior-y:none` on a scroll container stops the wheel from passing on to the
page. So on every page whose *document* scrolls (all the admin pages) the wheel did nothing while
dragging the scrollbar still worked. It had been in since 2026-09-14; it was not caused by the admin
mobile work. The rule is now `html{overscroll-behavior-y:none}` only (still stops pull-to-refresh at
the page level). The consumer app was never affected (it scrolls inner containers, not the page). **Do
not put `overscroll-behavior` on `<body>` or on any element that is a scroll container unless you mean
to stop scrolling passing up.** The admin drawer's scroll lock (`body.admin-nav-locked`) had only
seemed to work because the wheel was dead everywhere; `html:has(body.admin-nav-locked){overflow:hidden}`
in `admin.css` now makes it real, for mouse wheel and touch.

**10. Most of the current catalogue isn't playable.** As of 2026-09-20, only "Ordinary Life and
Poor Husband" (29 episodes) has real Bunny video ids. The other three series ("My Maiden Slave",
"The Golden Age", "Midnight Wolf") have short numeric placeholder ids that Bunny answers with
404. They appear normally in the app, but their videos show the load-failed state after the
retries. The For You feed also tries to preload a placeholder series' first episode when you're
on the series before it, and burns roughly 8s of retries doing so. That's data, not a code bug.
It makes the feed look broken when testing with these series.

## What lives in Supabase (reconstructed from the code)

Names and columns below are only what the front end touches; the real tables may have more.

**Tables:** `series` (id, title, description, cover_image_url, free_episode_count, status
`draft`/`published`, featured_at, created_at) · `episodes` (id, series_id, episode_number, title,
bunny_video_id, duration_seconds, created_at) · `genres` · `series_genres` · `profiles` (id,
display_name, is_admin, coin_balance) · `watch_progress` (user_id + episode_id unique;
series_id, position_seconds, updated_at) · `series_likes` · `series_saves` · `series_comments`
(with `parent_comment_id`) · `comment_likes` · `app_settings` (single row, `id = true`, including
`ad_unlock_enabled`, `subscriptions_enabled`, `coin_purchases_enabled`, `vip_section_enabled`) ·
`subscription_plans` (id weekly/monthly/yearly, name, days incl. bonus days, price_ngn_kobo,
price_usd_cents, sort_order, active; public read) · `subscriptions` (own rows; starts_at, ends_at) ·
`page_visits` (user_id,
visited_at) · `purchases` and `coin_transactions` (see below).

**Coins tables:** `coin_packs` (id, coins, price_ngn_kobo, price_usd_cents, sort_order, active;
public read) · `episode_unlocks` (user_id, episode_id, created_at, unlocked_via `coin_spend` / `ad`,
coin_transaction_id; own rows readable) ·
`purchases` (own rows readable; `paystack_reference`, `item_id`, `currency`, `status` =
pending / completed / failed / refunding / refunded / refund_failed).

**Coins functions:** `my_subscription` (plan_id, plan_name, ends_at, is_vip, or no rows),
`unlock_episode_with_coin(p_episode_id)` and
`claim_welcome_bonus` (both return `{ status, balance }`), and `can_watch_episode(p_episode_id)`
(not called by the app). **Ad functions:** `my_ad_status`, `record_ad_view`,
`unlock_episode_with_ad(p_episode_id)` (see [Watch ads to unlock](#watch-ads-to-unlock-google-rewarded-ads)). Edge Function `paystack-init` (`kind` `coin_pack` or `subscription`), plus
a Paystack webhook on the server that credits coins and grants subscription days. None of their source is in this repo.

**Database functions (RPC):** `get_continue_watching`, `get_series_like_count`,
`get_series_comments`, `admin_list_users`, `admin_total_users`, `admin_total_revenue` (Dashboard
only), `admin_revenue_overview(p_days)` (Revenue page; see [The admin panel](#the-admin-panel)),
`admin_visit_stats`, `admin_daily_visits`, `record_episode_view`, `record_series_share`,
`admin_most_watched_series`, `get_series_rankings`, `get_watch_history`,
`get_series_social_counts`. (`admin_user_stats` also exists and is intentionally unused.)

**Edge Functions:** `bunny-signed-playback-url`, `paystack-init` (viewers) · `bunny-upload-init`,
`bunny-delete-video`, `admin-suspend-user` (admin only).

**Storage:** the `cover-images` bucket (public read, admin write).

**Auth:** email/password and anonymous sign-ins enabled.

**Bunny Stream:** one video library; needs its own API access (used by the Edge Functions, never
by the browser).

## Not built yet

Do not describe any of this as working.

- **Real ads.** Watch-ads-to-unlock works end to end, but only with Google's public **test** ad
  unit until Narrava's Ad Manager account is approved (swap `NARRAVA_REWARDED_AD_UNIT` in
  `js/ads.js`). The privacy policy doesn't name Google yet.
- **VIP perks.** VIP (yearly members) has a tab, a card and a badge, but no perks yet; none are
  listed until they're agreed.
- **Ad earnings.** The Revenue page counts ad views and ad unlocks, but not money from ads; that
  lives in Google Ad Manager.
- **Earn Rewards, Gifts, Download, Language, and the Originals / Daily Coins /
  Download / HD Quality tiles:** only show a toast.
- **VIP posters** only show a "Coming soon" toast.
- **Download as a feature** — there's no download button on the like/comment/save/share row.
- **Stored episode durations.** `episodes.duration_seconds` is never written; the length shown on
  the scrub bar is read live from the video once it loads, not from the database.
