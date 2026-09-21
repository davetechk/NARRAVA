> **Keep this file current.** It only stays useful if it matches the code. Whenever a real
> feature is added, removed, or meaningfully changed (a new screen, a new Supabase table or
> function, a change to how sign-in, video, or the admin panel works), update this file in the
> same piece of work. If you are a new session opening this file: read it, trust it only as far
> as it has been kept up, and fix anything you find that has drifted. Move things out of
> "Not built yet" only when they genuinely work.
>
> Last reviewed against the code: 2026-09-28.

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

**Not built:** payments, and everything that hangs off them. The coin balance shown in the
app is not a real economy. See [Not built yet](#not-built-yet) for exactly what exists and what
doesn't. Nothing else in this document should be read as implying otherwise.

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
- **`narrava/css/`**: `styles.css` (the app, and also used by admin) and `admin.css` (admin only).
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
Profile. On desktop, opening a series goes to a dedicated Watch page instead.

- **Home** (`discover.js`): on mobile, a search box, tabs, and a poster grid. Popular is just
  the order the database returns; New sorts by creation date; Categories filters by genre;
  Rankings and VIP are placeholders (Rankings says plainly that view counts aren't tracked; VIP
  posters do nothing when tapped). On desktop: a rotating banner of featured series plus
  horizontal shelves (New Release, Top, then one per genre that has series). "Top" is not a
  popularity ranking. It puts featured series first, and it says so on screen.
- **For You** (`app.js`): the mobile swipe feed. One series at a time, full screen. Tapping
  enters "watching" that series: swipe up/down now moves between that series' *episodes*
  (stops at episode 1 going back; rolls into the next series after the last episode). The small
  "EP 3 · 12" badge opens a grid to jump to any episode. Tap toggles the on-screen controls
  and pause; press-and-hold plays at 2×. The controls (name, description, icons, scrub bar) auto-hide
  two seconds after entering a series, and again two seconds after a tap reveals them if nobody
  taps again. A second tap inside that window pauses instead, and the timer only restarts once
  the video is playing again. Name, description and the like/comment/share/save icons use the same bottom offsets
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
  - Mute is a feed feature. The desktop watch page plays with sound (its `<video>` is not muted)
    but has no mute button.
- **Library** (`library.js`): series you've saved. Needs a real (non-anonymous) account.
- **Profile** (`profile.js`): log in / sign out, username, install-app button, wallet balance
  (see below), and an Admin Panel link that only appears if you're an admin. Most of the other
  rows (Earn Rewards, Gifts, History, Download, Language, Help) just show a "coming soon" toast.
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

**Scroll isolation.** The bottom sheets (comments, episode grid, Get Coins) sit inside `#feed`,
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

## Watch progress and Continue Watching

While something plays, the position is saved to `watch_progress` (one row per user + episode,
upserted) every 15 seconds, on pause, and when leaving the episode. Reading it back uses the
`get_continue_watching` database function, which returns the viewer's in-progress rows.

That one result feeds two things: opening any series silently resumes at the saved episode and
position (if more than half a second in), and on mobile Home a small floating "Continue" bar
shows the most recent one (dismissing it lasts only until the next page load).

## Likes, saves, comments

All in `social.js` and `comments-panel.js`, against real tables (`series_likes`, `series_saves`,
`series_comments`, `comment_likes`).

- Like count comes from the `get_series_like_count` function. Saves are personal, with no public
  count.
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
| **Revenue & Analytics** | Exists, but every number is honestly zero right now. See [Not built yet](#not-built-yet). |
| **System Settings** | Free Mode, Maintenance Mode, Featured Series Count (below). |

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
- **System Settings** is one row in `app_settings`, readable by everyone and writable only by
  admins. The consumer app reads it once at startup:
  - *Free Mode*: nothing is treated as locked. Per-series free-episode counts aren't changed;
    they're just ignored while it's on.
  - *Maintenance Mode*: the consumer app replaces the whole page with a "We'll be back soon"
    message before doing anything else, including creating an anonymous account. The admin
    panel is unaffected, so it can always be switched back off.
  - *Featured Series Count*: how many featured series the desktop banner shows (falls back to a
    random series if none are featured).
  - If the settings can't be loaded, the app quietly uses safe defaults (nothing overridden).

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

**Installed iPhone: the strip at the bottom.** Status: **not confirmed fixed on a real iPhone.** What
is established: with a simulated safe area, every Narrava screen and state paints all the way to
the bottom edge, so the app itself leaves no gap, and `viewport-fit=cover` has been in the page
since the first commit. The strip is therefore iOS handing the page a layout viewport shorter than
the physical screen, with the page background showing below it. That is why the earlier attempts
(sizing with `100dvh`, then `position:fixed; inset:0` plus a dark `html` background) could not
work or only changed the strip's colour: all of them measure against that same short viewport.
What `js/layout-guard.js` does now: an invisible probe measures the viewport iOS really provided;
on an installed iPhone (portrait, phone width), if it is 2-120px shorter than `screen`, it sets
`--app-shortfall` and `styles.css` extends `.phone` that far past the viewport bottom and treats
the extension as bottom safe area (`--safe-bottom`, also used for the bottom nav, name block,
icons, scrub bar and sheets, so controls still clear the home indicator). Everywhere else it is
`0px` and nothing changes. **Not proven:** whether iOS actually paints content in the strip it
left out of the viewport. That could only be tested with a simulated shortfall in Chrome. **If a
strip remains on a real iPhone**, open the diagnostics panel (tap the avatar on the Profile screen
5 times quickly, or load the page with `?layout=1` in a browser tab); it prints `screen`, `inner`,
`visualViewport`, the safe-area values, the `.phone` position and the viewport meta, which say
exactly what iOS is doing and what to change next.

## Things that are easy to get wrong

**1. The service worker can keep serving old files after you deploy.** `sw.js` answers requests
for the app's own files from its cache first and only goes to the network when it has nothing
cached. The cache name is currently `narrava-shell-v13` and old caches are deleted only when the name
*changes*. So after changing any app file, people who have already visited can keep getting the
old version. **Bump `CACHE_NAME` in `sw.js` whenever you ship a change.** The service worker's
scope is the whole `narrava/` folder, so this affects the **admin pages too**, not only the
consumer app. (Read from the code, not tested against a live deployment.) The `?v=` numbers on
some script tags in `index.html` are a manual cache-busting habit and don't replace this.
`sw.js`'s precache list is also hand-maintained; it doesn't include `visit-log.js`, and a new
script won't be listed unless added.

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
`social` → `comments-panel` → `feed-data` → `app` → `discover` → `library` → `watch` → `auth` →
`profile` → `pwa-install` → `nav`. Admin pages load `config`, supabase-js, `supabase-client`,
`shared-utils`, `admin-shared`, and one `admin-<page>.js` each.

**4. Most of the backend isn't in this repo.** The tables, row-level security policies, database
functions, the trigger that creates profiles, the four Edge Functions, and the storage bucket
were all set up directly in Supabase. The list below is reconstructed from what the front-end
code calls. **If the Supabase project were lost, this repo could not recreate it.** Exporting the
schema and the Edge Function source into the repo (a `supabase/` folder) would fix that and is
worth doing.

**5. The client-side "locked" state, and what the server actually enforces.** Locked episodes
are decided in the browser from the series' `free_episode_count` (or overridden by Free Mode),
and a locked episode's video is never requested. The real gate is `bunny-signed-playback-url`,
whose source isn't in this repo. **Verified (2026-09-20, anonymous account):** for the 29-episode
series with 10 free episodes, the function returned a link for episodes 1–10 and *refused*
episodes 11–29. So the server does enforce `free_episode_count`, and the fake coin unlock (below)
cannot actually make a locked episode play, since the browser would still be refused a link. Still
unchecked: whether the function respects Free Mode. The app shows everything unlocked when Free
Mode is on, but if the function ignores it, locked episodes won't play.

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
(with `parent_comment_id`) · `comment_likes` · `app_settings` (single row, `id = true`) ·
`page_visits` (user_id, visited_at) · `purchases` and `coin_transactions` (see below).

**Database functions (RPC):** `get_continue_watching`, `get_series_like_count`,
`get_series_comments`, `admin_list_users`, `admin_total_users`, `admin_total_revenue`,
`admin_visit_stats`, `admin_daily_visits`. (`admin_user_stats` also exists and is intentionally
unused.)

**Edge Functions:** `bunny-signed-playback-url` (viewers) · `bunny-upload-init`,
`bunny-delete-video`, `admin-suspend-user` (admin only).

**Storage:** the `cover-images` bucket (public read, admin write).

**Auth:** email/password and anonymous sign-ins enabled.

**Bunny Stream:** one video library; needs its own API access (used by the Edge Functions, never
by the browser).

## Not built yet

Do not describe any of this as working.

- **Payments.** No payment provider is connected. The Profile "Top Up" row says "Coming soon —
  Paystack integration is on the way." Nothing charges anyone.
- **The coin economy.** Two disconnected things exist, and neither is a working economy:
  - The **Wallet** row on Profile shows the real `profiles.coin_balance` for the signed-in user.
    Nothing in the app can change that number.
  - The "Get Coins" sheet, the coin chip on the feed, and the "Unlock Ep N · 2 coins" button run
    on a **browser-only variable** that starts at 3. "Paying" in the sheet just adds coins to
    that variable after a fake delay; unlocking spends from it; a page refresh resets it. The
    price (2 coins) and the NG/CA package prices are hard-coded in `app.js` / `feed-data.js`.
    Nothing is written to the database.
- **Revenue.** The Revenue & Analytics page reads `purchases` and `coin_transactions`, but
  nothing in this repo writes to either, so its numbers are zero. Subscriptions and ad revenue
  are labelled "Inactive".
- **Membership, Earn Rewards, Gifts, History, Download, Language, Help & Feedback:** menu rows
  that only show a toast.
- **Rankings** (no view tracking) and **VIP** (posters do nothing).
- **Episode durations**, which are never recorded.
