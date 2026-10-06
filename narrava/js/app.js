// app.js
//
// All the interactive behaviour of the mockup: rendering the current
// slide, swipe/wheel navigation, like/save/comment/unlock buttons, and
// the "Get Coins" sheet. Like/save/comments are real now (series_likes/
// series_saves/series_comments via social.js/comments-panel.js). Nava
// Coins are real too (coins.js): the balance is the server's, which
// episode is locked is the one server-matching rule isEpisodeUnlocked,
// and unlocking/buying always goes through the server.
//
// Swiping means two different real things depending on state: while
// just browsing, it moves between series (goTo), exactly as before.
// Once a series has actually been entered (openSeriesInFeed/
// enterMobileWatching), it moves through THAT series' own real episodes
// instead (see advanceForward/advanceBackward/goToEpisodeInSlide) —
// stopping dead at episode one going backward, and rolling straight
// into the next series' own watching state going forward once the
// current one genuinely runs out. A real, numbered jump grid (opened
// from the small episode badge, still visible while watching) lets
// someone jump straight to any of a series' real episodes the same way.
// Landing on a real locked episode, by any of these paths, never plays
// it — it shows the same real unlock prompt (unlockBtn below) every
// other locked episode in this app already uses.
//
// Video/preload identity throughout is keyed by the real EPISODE id,
// not the series id — a single slide can now point at different real
// videos over its lifetime (whichever episode is currently active), so
// "which video is this" and "which series is this slide" are tracked
// as two separate ids (currentVideoEpisodeId/currentVideoSeriesId etc.)
// rather than conflating them the way a series-id-only slide could
// safely assume before real episode navigation existed.

let slides = [];
let slidesLoaded = false; // real fetchSlides() has actually resolved — see render()'s empty-feed branch, which needs this to tell "still loading" apart from "genuinely no series exist"
let idx = 0;

// Real System Settings (app_settings, admin/system-settings.html) — one
// real row, publicly readable, admin-only to write (confirmed live).
// Safe defaults here (nothing overridden, maintenance off, 5 featured)
// match today's real behavior exactly, so a failed fetch never silently
// changes anything — it just falls back to acting as if the settings
// screen had never been touched.
//
// Fetched once, immediately at script load (not inside init(), and not
// awaited by anything until it actually needs the answer) so both this
// file's own init() and discover.js's initDiscover() can await the same
// one real appSettingsReady promise before doing anything — the same
// real pattern slidesReady/continueWatchingReady already use for
// exactly this "don't act before the real data is in" reason.
let appSettings = { free_mode_enabled: false, maintenance_mode_enabled: false, featured_series_count: 5, subscriptions_enabled: false, vip_section_enabled: false };
let resolveAppSettingsReady;
const appSettingsReady = new Promise(resolve => { resolveAppSettingsReady = resolve; });

async function loadAppSettings(){
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count, subscriptions_enabled, vip_section_enabled')
      .eq('id', true)
      .single();
    if(error) throw error;
    if(data) appSettings = data;
  } catch(err){
    console.error('Narrava: failed to load app settings — falling back to safe defaults (nothing overridden)', err);
  }
  resolveAppSettingsReady();
}
loadAppSettings();

// The maintenance scene, ported verbatim from maintenance.html (repo
// root — the source reference, left untouched) into app.js so it can be
// dropped in via document.body.innerHTML. Every path, shape, id, class
// and piece of text below is identical to that file; the only things
// changed are the seven --ink/--paper/--muted/--green/--green-deep/
// --spark/--metal custom properties, renamed --mt-* and scoped under
// .maintenance-screen (see styles.css) so they can never collide with
// or be affected by the app's own --ink/--muted (different values,
// different meaning) — every rule that used them in maintenance.html is
// scoped the same way. This screen intentionally draws its own version
// of the logo, because its "loose piece" (the pill) has to move
// separately from the rest of the shape — that's the one place in the
// whole app that doesn't use NARRAVA_LOGO_SVG; everywhere else still
// does.
function maintenanceMarkupHtml(){
  return `<div class="maintenance-screen"><main>
  <svg class="scene" viewBox="40 20 680 440" role="img" aria-label="A mechanic tightening a bolt on the app logo with a wrench">
    <defs>
      <!-- Hand-drawn "line boil": the displacement seed changes a few times a second -->
      <filter id="boil" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence id="boilNoise" type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="1" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <!-- Logo silhouette (logo coordinates, 228 x 240) -->
      <mask id="logoMask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="270" height="280">
        <path d="M15 15 L213 120 L15 225 Z" fill="#fff" stroke="#fff" stroke-width="30" stroke-linejoin="round" />
      </mask>
    </defs>

    <!-- ground -->
    <g filter="url(#boil)">
      <path class="ink no-fill" d="M70 432 Q 180 429 300 433 T 520 431 T 700 433" />
      <path class="ink no-fill" d="M92 442 L 120 442 M 640 442 L 676 442" opacity=".6" />
    </g>
    <ellipse id="logoShadow" cx="292" cy="432" rx="110" ry="6" fill="var(--mt-ink)" opacity=".08" />

    <!-- gears -->
    <g filter="url(#boil)">
      <g id="gearA" transform="translate(96 108)"><path class="ink fill-paper" /><circle class="ink fill-paper" r="7" /></g>
      <g id="gearB" transform="translate(136 64)"><path class="ink fill-paper" /><circle class="ink fill-paper" r="4.5" /></g>
    </g>

    <!-- LOGO -->
    <g id="logo">
      <g transform="translate(150 90) scale(1.25)">
        <g mask="url(#logoMask)">
          <!-- rounded silhouette -->
          <path d="M15 15 L213 120 L15 225 Z" fill="#25c561" stroke="#25c561" stroke-width="30" stroke-linejoin="round" />
          <rect x="60" y="-10" width="99" height="260" fill="#1fd55e" />
          <polygon points="58,10 104,72 104,168 58,230" fill="#23e05f" />
          <rect x="-20" y="-10" width="80" height="260" fill="#3ee472" />
          <!-- socket where the loose piece belongs -->
          <rect x="104" y="57" width="55" height="126" rx="27.5" fill="#17a94f" />
          <!-- the loose piece -->
          <rect id="pillShadow" x="104" y="57" width="55" height="126" rx="27.5" fill="#0f7a39" opacity="0" />
          <g id="pill">
            <rect x="104" y="57" width="55" height="126" rx="27.5" fill="#3de471" />
          </g>
          <!-- shine on repair -->
          <rect id="shine" x="-120" y="-20" width="46" height="300" fill="#fff" opacity="0" transform="skewX(-18)" />
        </g>
        <!-- wobble lines when loose -->
        <g id="looseLines" filter="url(#boil)" opacity="0">
          <path class="ink no-fill" d="M172 52 q 8 -6 4 -16" stroke-width="2.6" />
          <path class="ink no-fill" d="M184 62 q 10 -4 10 -14" stroke-width="2.6" />
          <path class="ink no-fill" d="M172 190 q 8 6 4 16" stroke-width="2.6" />
        </g>
      </g>
    </g>

    <!-- bolt + wrench (scene coords, positioned by script) -->
    <g id="bolt" filter="url(#boil)">
      <polygon class="ink fill-metal" points="10,0 5,8.66 -5,8.66 -10,0 -5,-8.66 5,-8.66" />
      <circle class="fill-ink" r="2.2" />
    </g>
    <circle id="clickRing" r="10" fill="none" stroke="var(--mt-green)" stroke-width="4" opacity="0" />
    <g id="sparks"></g>

    <!-- MECHANIC -->
    <g filter="url(#boil)">
      <ellipse cx="520" cy="433" rx="70" ry="5" fill="var(--mt-ink)" opacity=".08" />
      <g id="body">
        <g transform="translate(-16 -18)">
          <!-- back arm, hand on hip -->
          <path class="ink no-fill" d="M530 250 L 556 290 L 537 320" stroke-width="27" />
          <path d="M530 250 L 556 290 L 537 320" fill="none" stroke="var(--mt-paper)" stroke-width="20.5" stroke-linecap="round" stroke-linejoin="round" />
          <circle class="ink fill-paper" cx="536" cy="322" r="8" />

          <!-- legs -->
          <path d="M500 335 L 468 385 L 474 432" fill="none" stroke="var(--mt-ink)" stroke-width="25" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M528 335 L 556 382 L 588 420" fill="none" stroke="var(--mt-ink)" stroke-width="25" stroke-linecap="round" stroke-linejoin="round" />
          <path class="fill-ink" d="M488 326 L 542 326 L 540 350 L 492 350 Z" />
          <path d="M478 392 l -4 10 M 482 412 l -1 9 M 556 392 l 6 8 M 571 402 l 5 7 M 503 350 l -6 10" stroke="var(--mt-paper)" stroke-width="2.2" stroke-linecap="round" />

          <!-- shoes -->
          <path class="ink fill-paper" d="M484 428 Q 488 446 478 450 L 448 450 Q 438 448 444 439 Q 458 434 466 428 Z" />
          <path class="ink no-fill" d="M442 444 L 482 444" stroke-width="2.4" />
          <path class="ink fill-paper" d="M580 412 L 600 424 Q 604 436 594 440 L 574 450 Q 564 452 566 442 Q 574 430 576 418 Z" />
          <path class="ink no-fill" d="M568 446 L 598 432" stroke-width="2.4" />

          <!-- jacket -->
          <path class="ink fill-paper" d="M482 238 Q 506 226 534 238 L 544 332 Q 514 340 486 332 Z" />
          <path class="ink no-fill" d="M498 236 L 508 258 L 518 234" stroke-width="2.6" />
          <path class="ink no-fill" d="M508 258 L 506 330" stroke-width="2.4" />
          <path class="ink no-fill" d="M520 296 L 534 296" stroke-width="2.4" />
          <path class="ink no-fill" d="M486 316 Q 514 322 543 316" stroke-width="2.4" />

          <!-- head -->
          <path class="ink no-fill" d="M505 222 L 506 232" />
          <circle class="ink fill-paper" cx="502" cy="202" r="23" />
          <circle cx="494" cy="213" r="4.5" fill="var(--mt-green)" opacity=".55" />
          <ellipse id="eye" class="fill-ink" cx="489" cy="203" rx="2.4" ry="3" />
          <path class="ink no-fill" d="M482 214 Q 487 218 492 215" stroke-width="2.4" />
          <path class="ink no-fill" d="M514 200 q 6 2 3 9" stroke-width="2.4" />
          <!-- cap -->
          <path class="ink fill-ink" d="M480 196 Q 482 176 504 175 Q 526 176 526 196 Q 504 190 480 196 Z" />
          <path class="ink fill-ink" d="M482 195 L 462 199 Q 460 193 470 191 L 484 189 Z" />
          <circle cx="506" cy="183" r="3.2" fill="var(--mt-green)" />
        </g>
      </g>

      <!-- working arm + wrench (positioned by script) -->
      <g id="wrench">
        <path class="ink fill-metal" d="M14 -6 L 98 -6 Q 104 0 98 6 L 14 6 Z" />
        <path class="ink fill-metal" d="M-2 -17 A 17 17 0 1 1 -2 17 L 6 9 A 9 9 0 1 0 6 -9 Z" transform="rotate(180)" />
        <circle class="ink fill-paper" cx="86" cy="0" r="3" />
      </g>
      <path id="armOutline" fill="none" stroke="var(--mt-ink)" stroke-width="27" stroke-linecap="round" stroke-linejoin="round" />
      <path id="armFill" fill="none" stroke="var(--mt-paper)" stroke-width="20.5" stroke-linecap="round" stroke-linejoin="round" />
      <path id="cuff" class="ink no-fill" stroke-width="2.4" />
      <circle id="fist" class="ink fill-paper" r="8.5" />
    </g>

    <!-- toolbox -->
    <g filter="url(#boil)">
      <path class="ink no-fill" d="M104 396 L 104 386 Q 116 378 128 386 L 128 396" />
      <rect class="ink fill-metal" x="92" y="394" width="40" height="8" rx="2" transform="rotate(-8 112 398)" />
      <path class="ink fill-ink" d="M86 386 L 92 370 L 98 372 L 94 388 Z" />
      <path class="ink no-fill" d="M92 372 L 100 346" />
      <path class="ink fill-paper" d="M144 390 L 150 356 L 160 358 L 154 392 Z" />
      <rect class="ink" x="143" y="350" width="26" height="12" rx="3" fill="var(--mt-green)" transform="rotate(10 156 356)" />
      <rect class="ink fill-paper" x="66" y="394" width="110" height="38" rx="5" />
      <path class="ink no-fill" d="M66 406 L 176 406" />
      <rect class="ink" x="112" y="400" width="18" height="11" rx="2" fill="var(--mt-green)" />
    </g>
  </svg>

  <h1>Tightening a few bolts</h1>
  <p>We're doing scheduled maintenance to keep things running smoothly. Your data is safe, and we'll be back shortly.</p>
  <button type="button" onclick="location.reload()">Check again</button>
</main></div>`;
}

// The Bricolage Grotesque stylesheet link maintenance.html loads in its
// own <head> — added to the real page's head only while this screen is
// showing (never on a normal visit), and only once even if this somehow
// ran twice. .maintenance-screen's own font-family keeps the file's
// exact fallback stack, so the scene still looks right if this never
// finishes loading.
function ensureMaintenanceFont(){
  if(document.getElementById('mtFontLink')) return;
  const link = document.createElement('link');
  link.id = 'mtFontLink';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap';
  document.head.appendChild(link);
}

// The animation's own script, from maintenance.html, moved into a named
// function since setting innerHTML doesn't run <script> tags — every
// statement inside is exactly as that file has it (only the two
// var(--spark)/var(--ink) string literals near the bottom are renamed
// to var(--mt-spark)/var(--mt-ink), the same rename as everywhere else
// this screen's markup/CSS references those custom properties).
function startMaintenanceAnimation(){
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Logo placement (must match the transform on the logo's inner group)
  const LX = 150, LY = 90, K = 1.25;
  const PILL_C = { x: 131.5, y: 120 };     // pill centre in logo coords
  const SHOULDER = { x: 478, y: 232 };     // working shoulder in scene coords
  const L1 = 50, L2 = 50;                   // upper arm, forearm
  const GRIP = 86;                          // distance bolt -> hand along wrench
  const PERIOD = 6.4;

  // Gear shapes
  function gearPath(R, r, teeth) {
    const pts = [];
    const step = (Math.PI * 2) / (teeth * 4);
    for (let i = 0; i < teeth * 4; i++) {
      const rad = (i % 4 < 2) ? R : r;
      const a = i * step;
      pts.push(`${(Math.cos(a) * rad).toFixed(2)},${(Math.sin(a) * rad).toFixed(2)}`);
    }
    return "M" + pts.join(" L") + " Z";
  }
  $("gearA").querySelector("path").setAttribute("d", gearPath(24, 18, 9));
  $("gearB").querySelector("path").setAttribute("d", gearPath(15, 11, 7));

  // Sparks
  const SPARK_N = 7;
  const sparks = [];
  for (let i = 0; i < SPARK_N; i++) {
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("stroke", i % 2 ? "var(--mt-spark)" : "var(--mt-ink)");
    l.setAttribute("stroke-width", i % 2 ? 3.4 : 2.6);
    l.setAttribute("stroke-linecap", "round");
    l.setAttribute("opacity", 0);
    $("sparks").appendChild(l);
    sparks.push({ el: l, a: 0 });
  }

  // Easing helpers
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inCubic = (t) => t * t * t;
  const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);

  // Impacts: three wrench pulls, the third seats the piece
  const IMPACTS = [0.5, 1.7, 2.9];
  const POP_AT = 5.4;

  function stateAt(t) {
    const s = { theta: -25, off: 1, hop: 0, shine: -1, ring: -1, pop: -1 };

    if (t < 3.6) {
      const c = Math.min(2, Math.floor(t / 1.2));
      const u = t - c * 1.2;
      s.theta = u < 0.5 ? lerp(-25, 18, inCubic(u / 0.5)) : lerp(18, -25, inOutSine(clamp((u - 0.5) / 0.7)));
      // pill slides a third of the way home on each impact
      let off = 1;
      IMPACTS.forEach((ti, i) => { off -= (1 / 3) * outCubic(clamp((t - ti) / 0.14)); });
      s.off = off;
    } else if (t < POP_AT) {
      s.off = 0;
      s.theta = lerp(-25, -8, inOutSine(clamp((t - 3.6) / 0.8)));
    } else {
      const p = clamp((t - POP_AT) / 0.35);
      s.off = outBack(p);
      s.pop = t - POP_AT;
      s.theta = lerp(-8, -25, inOutSine(clamp((t - POP_AT) / 0.9)));
    }

    // celebration after the final impact
    const done = t - 2.9;
    if (done > 0 && done < 0.7) s.ring = done / 0.7;
    if (t > 3.0 && t < 3.7) s.shine = (t - 3.0) / 0.7;
    if (t > 3.05 && t < 3.45) s.hop = -Math.sin(Math.PI * (t - 3.05) / 0.4) * 11;
    if (t > 3.55 && t < 3.85) s.hop = -Math.sin(Math.PI * (t - 3.55) / 0.3) * 6;
    return s;
  }

  function lastImpact(t) {
    let last = -99;
    for (const ti of IMPACTS) if (t >= ti) last = ti;
    if (t >= POP_AT) last = POP_AT;
    return last;
  }

  let gearAngle = 0, lastNow = null, seed = 1, lastSeed = 0;
  let blinkAt = 2.2;

  function render(now) {
    const sec = now / 1000;
    const dt = lastNow == null ? 0 : Math.min(0.05, sec - lastNow);
    lastNow = sec;
    const t = reduce ? 1.5 : sec % PERIOD;
    const s = reduce ? { theta: -10, off: 0.4, hop: 0, shine: -1, ring: -1, pop: -1 } : stateAt(t);

    // logo shake after impacts
    const since = t - lastImpact(t);
    const shakeAmp = (!reduce && since >= 0 && since < 0.4) ? 3.2 * Math.exp(-since * 9) : 0;
    const sx = Math.sin(since * 70) * shakeAmp;
    const sy = Math.cos(since * 55) * shakeAmp * 0.6;
    $("logo").setAttribute("transform", `translate(${sx.toFixed(2)} ${sy.toFixed(2)})`);

    // loose piece
    const wob = reduce ? 0 : Math.sin(sec * 9) * 2.2 * s.off;
    const pdx = s.off * 12, pdy = -s.off * 5, prot = s.off * 9 + wob;
    $("pill").setAttribute("transform", `translate(${pdx} ${pdy}) rotate(${prot} ${PILL_C.x} ${PILL_C.y})`);
    $("pillShadow").setAttribute("transform", `translate(${pdx * 0.5 + 4} ${pdy * 0.5 + 5}) rotate(${prot} ${PILL_C.x} ${PILL_C.y})`);
    $("pillShadow").setAttribute("opacity", (0.35 * clamp(s.off * 1.5)).toFixed(2));
    $("looseLines").setAttribute("opacity", clamp(s.off * 1.4 - 0.2).toFixed(2));

    // shine sweep
    $("shine").setAttribute("opacity", s.shine >= 0 ? (0.5 * Math.sin(Math.PI * s.shine)).toFixed(2) : 0);
    $("shine").setAttribute("x", lerp(-40, 280, s.shine >= 0 ? s.shine : 0));

    // bolt position (scene)
    const bx = LX + K * (PILL_C.x + pdx) + sx;
    const by = LY + K * (PILL_C.y + pdy) + sy;
    $("bolt").setAttribute("transform", `translate(${bx} ${by}) rotate(${s.theta + prot})`);

    // click ring
    if (s.ring >= 0) {
      $("clickRing").setAttribute("cx", bx); $("clickRing").setAttribute("cy", by);
      $("clickRing").setAttribute("r", 10 + s.ring * 60);
      $("clickRing").setAttribute("opacity", (1 - s.ring).toFixed(2));
    } else $("clickRing").setAttribute("opacity", 0);

    // sparks on each impact
    sparks.forEach((sp, i) => {
      const age = since;
      if (reduce || age < 0 || age > 0.38 || lastImpact(t) === POP_AT) { sp.el.setAttribute("opacity", 0); return; }
      const ang = (-160 + i * (140 / (SPARK_N - 1)) + (lastImpact(t) * 37) % 20) * Math.PI / 180;
      const p = outCubic(age / 0.38);
      const r1 = 14 + p * 34, r2 = r1 + 10 * (1 - p) + 3;
      sp.el.setAttribute("x1", bx + Math.cos(ang) * r1); sp.el.setAttribute("y1", by + Math.sin(ang) * r1);
      sp.el.setAttribute("x2", bx + Math.cos(ang) * r2); sp.el.setAttribute("y2", by + Math.sin(ang) * r2);
      sp.el.setAttribute("opacity", (1 - p).toFixed(2));
    });

    // body lean + hop
    const lean = -((s.theta + 25) / 43) * 4;
    $("body").setAttribute("transform", `translate(${lean.toFixed(2)} ${s.hop.toFixed(2)})`);

    // wrench
    const th = s.theta * Math.PI / 180;
    $("wrench").setAttribute("transform", `translate(${bx} ${by}) rotate(${s.theta})`);

    // arm IK: shoulder -> elbow -> hand on the wrench grip
    const hx = bx + Math.cos(th) * GRIP, hy = by + Math.sin(th) * GRIP;
    const shx = SHOULDER.x + lean, shy = SHOULDER.y + s.hop;
    let dx = hx - shx, dy = hy - shy;
    let d = Math.hypot(dx, dy);
    d = clamp(d, 10, L1 + L2 - 0.5);
    const base = Math.atan2(dy, dx);
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const e1 = { x: shx + Math.cos(base + a) * L1, y: shy + Math.sin(base + a) * L1 };
    const e2 = { x: shx + Math.cos(base - a) * L1, y: shy + Math.sin(base - a) * L1 };
    const el = e1.y > e2.y ? e1 : e2;              // elbow bends downward
    const fx = hx - el.x, fy = hy - el.y, fl = Math.hypot(fx, fy) || 1;
    const wx = hx - (fx / fl) * 9, wy = hy - (fy / fl) * 9;  // wrist, just short of the fist
    const armD = `M${shx.toFixed(1)} ${shy.toFixed(1)} L${el.x.toFixed(1)} ${el.y.toFixed(1)} L${wx.toFixed(1)} ${wy.toFixed(1)}`;
    $("armOutline").setAttribute("d", armD);
    $("armFill").setAttribute("d", armD);
    const nx = -fy / fl, ny = fx / fl, cx = hx - (fx / fl) * 13, cy = hy - (fy / fl) * 13;
    $("cuff").setAttribute("d", `M${cx + nx * 10} ${cy + ny * 10} L${cx - nx * 10} ${cy - ny * 10}`);
    $("fist").setAttribute("cx", hx); $("fist").setAttribute("cy", hy);

    // gears (spin faster right after an impact)
    const boost = (since >= 0 && since < 0.6) ? 260 * (1 - since / 0.6) : 0;
    gearAngle += dt * (28 + boost);
    $("gearA").setAttribute("transform", `translate(96 108) rotate(${gearAngle})`);
    $("gearB").setAttribute("transform", `translate(136 64) rotate(${-gearAngle * 1.6 + 12})`);

    // blink
    if (!reduce) {
      const bt = sec % 3.4;
      $("eye").setAttribute("ry", (bt > blinkAt && bt < blinkAt + 0.12) ? 0.6 : 3);
    }

    // line boil
    if (!reduce && sec - lastSeed > 0.13) {
      seed = (seed % 4) + 1;
      $("boilNoise").setAttribute("seed", seed);
      lastSeed = sec;
    }

    if (!reduce) requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

// Re-checks the same public app_settings read loadAppSettings() already
// does at startup, but — unlike loadAppSettings() itself, which is left
// completely unchanged for normal startup — this never infers success
// from a side effect. It reloads ONLY when this read explicitly comes
// back with no error, a real row, and that row's maintenance_mode_enabled
// is literally false. Any error, timeout, thrown exception, or a row
// that's missing/empty/still-true all fall through to "do nothing,
// silently try again next interval" — no toast, no assumption. A
// maintenanceCheckInFlight guard skips a tick outright if the previous
// check is still waiting on a slow response, so a slow request can
// never stack a second one on top of it.
let maintenanceCheckInFlight = false;
async function checkMaintenanceStillOn(){
  if(maintenanceCheckInFlight) return;
  maintenanceCheckInFlight = true;
  try {
    const { data, error } = await supabaseClient
      .from('app_settings')
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count')
      .eq('id', true)
      .single();
    if(!error && data && data.maintenance_mode_enabled === false){
      location.reload();
    }
  } catch(err){
    console.error('Narrava: maintenance recheck failed — staying on screen, retrying at the next interval', err);
  } finally {
    maintenanceCheckInFlight = false;
  }
}

// Real maintenance mode (see init() below and discover.js's
// initDiscover(), both of which bail out before loading anything real
// once appSettingsReady confirms it's on) — replaces the entire real
// page with the maintenance scene above, nothing else, starts its
// animation (innerHTML doesn't run <script> tags, so this has to happen
// explicitly right after), and starts the one and only recheck timer
// (guarded so a second call, if it ever happened, could never leave two
// running). The admin panel lives under admin/*.html, an entirely
// separate set of pages this function never touches, so it stays fully
// reachable regardless — confirmed live, not just assumed from separate
// file boundaries.
let maintenanceRecheckTimer = null;
function renderMaintenanceMode(){
  ensureMaintenanceFont();
  document.body.innerHTML = maintenanceMarkupHtml();
  startMaintenanceAnimation();
  if(maintenanceRecheckTimer) clearInterval(maintenanceRecheckTimer);
  maintenanceRecheckTimer = setInterval(checkMaintenanceStillOn, 60000);
}

// Real video playback state — a real native <video> element plus hls.js
// (video-player.js), identity is the real EPISODE id throughout (see
// header comment above), not the series/slide id, since one slide can
// point at different real episodes over time.
let currentVideoEl = null;         // the real, active <video> element for the visible episode, or null
let currentPlaybackCtl = null;     // its attachEpisodePlayback() controller (video-player.js) — owns auth refresh, .destroy() tears the real playback down
let currentVideoEpisodeId = null;  // real episode id currentVideoEl belongs to
let currentVideoSeriesId = null;   // the slide/series that episode belongs to, kept in lockstep with currentVideoEpisodeId — saveCurrentFeedProgress needs both, and this avoids re-deriving the series by searching `slides` after it may have already moved on to a different episode
let pendingResumeEpisodeId = null; // real episode id the automatic resume wants seeked once its video is ready (see enterMobileWatching/promotePreload)
let pendingResumeSeconds = 0;
let renderedMediaEpisodeId = null; // real episode id whose media (video or art) is currently in #bgvideo, so unrelated re-renders (unlock, continue) don't restart a playing video

// Real playback controls (video-controls in index.html) — the same real
// <video> element's own currentTime/duration/playbackRate throughout,
// never a fabricated position or speed.
let scrubbing = false; // true while the viewer's own finger/pointer is actively dragging scrubRange — timeupdate skips updating it meanwhile so it never fights the drag

// Press-and-hold-to-fast-forward on the video itself (playToggle below)
// — separate, already-confirmed mechanic, untouched by the real chrome
// show/hide sequence below: holding anywhere on the video jumps
// instantly to 2x for exactly as long as it's actually held, snapping
// back to 1x the instant it's released, no ramp either direction.
// HOLD_SPEED/TAP_MAX_MS aren't from the reference itself (only the real
// 2x value and the "instant, no ramp" shape are confirmed) —
// TAP_MAX_MS is a standard tap-vs-hold threshold, open to correction if
// it doesn't feel right live.
const HOLD_SPEED = 2;
const TAP_MAX_MS = 200;
const SWIPE_CANCEL_PX = 15; // a real vertical swipe (forward/backward nav) cancels the tap/hold read entirely — feed's own touchstart/touchend already owns that gesture
let pressStartY = null;
let pressStartTime = 0;
let pressHolding = false;
let pressMoved = false;

// The real chrome group while watching — name (.title), description
// (.synopsis), social icons (.actionrail), and the scrub bar
// (.video-controls) — confirmed directly, more than once, as one
// single group that always moves together, replacing the old
// reference-matched "tap pauses and shows controls together" behavior
// entirely, not merging with it:
//   1. Entering an episode shows the whole group immediately.
//   2. After 2 real seconds of actually playing, the whole group
//      auto-hides together — the video itself keeps playing.
//   3. A tap while hidden reveals the whole group and does NOT touch
//      play/pause at all.
//   4. A tap while already showing pauses (or resumes) the video —
//      the real toggle every tap here has always done, just decided by
//      "is the group visible" now, not by a fixed two-tap sequence.
//   5. Resuming playback (from either path above) rearms the same real
//      2-second timer, driven off the video's own real 'playing'/
//      'pause' events (see attachPlaybackControls) rather than guessed
//      at from when a tap happened — so it fires the same way whether
//      playback resumed from this tap logic or from anywhere else.
// feed.chrome-hidden (styles.css) is the one and only thing that ever
// hides the group, and it always hides all of it together.
const CHROME_AUTOHIDE_MS = 2000;
let chromeHideTimer = null;
function showChrome(){
  feed.classList.remove('chrome-hidden');
}
function hideChrome(){
  feed.classList.add('chrome-hidden');
}
function clearChromeHideTimer(){
  if(chromeHideTimer){ clearTimeout(chromeHideTimer); chromeHideTimer = null; }
}
function armChromeHideTimer(){
  clearChromeHideTimer();
  chromeHideTimer = setTimeout(() => { chromeHideTimer = null; hideChrome(); }, CHROME_AUTOHIDE_MS);
}
// Entering the watching state: reveal the group and start the 2s
// auto-hide. The 'playing' listener in attachPlaybackControls is the other
// place that arms the timer, and it only fires when playback *starts or
// resumes* — an already-playing video never fires it again. That is exactly
// what happens when the viewer taps Continue (or the video) in the For You
// feed while it's already playing: entry only ever called showChrome(), so
// the group stayed up until someone paused and resumed (found by measuring
// the real timeline: no armChromeHideTimer call at all after entry). So
// entry arms the timer itself when the active video is already playing; a
// video that isn't playing yet (a cold entry from Home, a new episode)
// still arms from its own 'playing' event as before.
function showChromeOnEntry(){
  showChrome();
  if(currentVideoEl && !currentVideoEl.paused && !currentVideoEl.ended) armChromeHideTimer();
}

// episodeId -> { video, ctl, ready } for a video warming up off-screen
// ahead of time (see preloadVideo/promotePreload) — a real <video> element
// in #preloadHost, already fetching its real signed URL and buffering via
// hls.js, well before it's ever shown, so a swipe can land on an
// already-playing video instead of waiting on it cold.
const preloadCache = {};
const preloadHost = document.getElementById('preloadHost');

const bgvideo = document.getElementById('bgvideo');
const spine = document.getElementById('spine');
const pager = document.getElementById('pager');
const epBadge = document.getElementById('epBadge');
const titleEl = document.getElementById('title');
const synopsisEl = document.getElementById('synopsis');
const likeCount = document.getElementById('likeCount');
const likeBtn = document.getElementById('likeBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const commentBtn = document.getElementById('commentBtn');
const commentCount = document.getElementById('commentCount');
const saveCount = document.getElementById('saveCount');
const shareCount = document.getElementById('shareCount');
const commentsSheetBackdrop = document.getElementById('commentsSheetBackdrop');
const commentsSheet = document.getElementById('commentsSheet');
const commentsSheetClose = document.getElementById('commentsSheetClose');
const episodeGridBackdrop = document.getElementById('episodeGridBackdrop');
const episodeGridSheet = document.getElementById('episodeGridSheet');
const episodeGridClose = document.getElementById('episodeGridClose');
const episodeGridBody = document.getElementById('episodeGridBody');
const unlockBtn = document.getElementById('unlockBtn');
const unlockLabel = document.getElementById('unlockLabel');
const scrubRange = document.getElementById('scrubRange');
const videoControls = document.getElementById('videoControls');
const scrubDuration = document.getElementById('scrubDuration');
const coinBalance = document.getElementById('coinBalance');
const feed = document.getElementById('feed');
const playToggle = document.getElementById('playToggle');
const coinsChip = document.getElementById('coinsChip');
const ctaRow = document.querySelector('.ctarow');
const discoverScreen = document.getElementById('discoverScreen');
const libraryScreen = document.getElementById('libraryScreen');
const historyScreen = document.getElementById('historyScreen');
const helpScreen = document.getElementById('helpScreen');
const membershipScreen = document.getElementById('membershipScreen');
const profileScreen = document.getElementById('profileScreen');
const watchScreen = document.getElementById('watchScreen');
const navHome = document.getElementById('navHome');
const navForYou = document.getElementById('navForYou');
const navLibrary = document.getElementById('navLibrary');
const navProfile = document.getElementById('navProfile');
// Desktop-only top bar nav (>=900px, replaces the old left sidebar — see
// styles.css). Same destinations as navHome/navForYou/navProfile above,
// just a second set of clickable elements for the wide-screen layout;
// they call the exact same showScreen() function, no separate
// navigation logic.
const topbarHome = document.getElementById('topbarHome');
const topbarForYou = document.getElementById('topbarForYou');
const topbarLibrary = document.getElementById('topbarLibrary');
const topbarProfile = document.getElementById('topbarProfile');
const topbarSearchBtn = document.getElementById('topbarSearchBtn');
const topbarProfileBtn = document.getElementById('topbarProfileBtn');
const topbarTopUpBtn = document.getElementById('topbarTopUpBtn');
const topbarDesktopInner = document.getElementById('topbarDesktopInner');
const topbarSearchBar = document.getElementById('topbarSearchBar');
const topbarSearchBackdrop = document.getElementById('topbarSearchBackdrop');
const topbarSearchInput = document.getElementById('topbarSearchInput');

// ================= Sound =================
//
// Sound is ON by default, in browsing and in watching alike — nothing
// here ever starts a video muted on its own choice. The viewer's only
// control is the mute button (#muteBtn, top-left of the stage), which
// mutes/unmutes whichever real video is currently the active one, in
// either state, and whose choice then carries to every later video this
// visit (soundMuted). It is not saved across page loads.
//
// One thing is out of our hands: browsers refuse to start *unmuted*
// playback in a page the visitor hasn't interacted with yet (autoplay
// policy — in practice only a cold load straight into a video, such as
// opening a shared series link, or an iOS Safari play() that isn't tied
// to a tap). When play() is refused for exactly that reason, playWithSound
// falls back to playing that video muted (so it still plays, never a
// black frame) and the button honestly shows "muted". The visitor's first
// tap or key press anywhere then turns sound on by itself
// (unblockSoundOnGesture), without them having to find the button.
// soundAutoplayBlocked tracks that browser-forced state; soundMuted is
// only ever the viewer's own choice.
let soundMuted = false;
let soundAutoplayBlocked = false;
const muteBtn = document.getElementById('muteBtn');

function isSoundOff(){
  return soundMuted || soundAutoplayBlocked;
}

function updateMuteButton(){
  const off = isSoundOff();
  muteBtn.classList.toggle('muted', off);
  muteBtn.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  muteBtn.setAttribute('aria-pressed', off ? 'true' : 'false');
}

// Starts playback with the viewer's sound preference. If — and only if —
// the browser refuses because unmuted autoplay isn't allowed yet, retries
// muted and flags it (see the block comment above).
function playWithSound(video){
  const attempt = video.play();
  if(!attempt || typeof attempt.catch !== 'function') return;
  attempt.catch(err => {
    if(currentVideoEl !== video) return; // torn down or replaced while it was starting
    if(err && err.name === 'NotAllowedError' && !video.muted){
      soundAutoplayBlocked = true;
      video.muted = true;
      updateMuteButton();
      video.play().catch(() => {});
    }
  });
}

muteBtn.addEventListener('click', () => {
  const nowOff = !isSoundOff();
  soundMuted = nowOff;
  soundAutoplayBlocked = false;
  if(currentVideoEl) currentVideoEl.muted = nowOff;
  updateMuteButton();
});
// A tap on the button must never also count as a feed swipe/tap.
['touchstart', 'touchend'].forEach(evt => {
  muteBtn.addEventListener(evt, e => e.stopPropagation());
});

// The first real tap/key after a browser-forced mute turns sound on. The
// button's own tap is skipped — its click handler above decides that one.
function unblockSoundOnGesture(e){
  if(!soundAutoplayBlocked) return;
  if(muteBtn.contains(e.target)) return;
  soundAutoplayBlocked = false;
  if(currentVideoEl) currentVideoEl.muted = soundMuted;
  updateMuteButton();
}
['pointerup', 'keydown'].forEach(evt => {
  document.addEventListener(evt, unblockSoundOnGesture, true);
});
updateMuteButton();

// Screen switching between the "Home" (Discover) grid and the "For You"
// swipe feed. Both screens stay mounted and populated at all times —
// this just toggles which one is visible, so switching back to a
// screen never re-fetches or re-renders it from scratch.
//
// Also toggles `discover-active` / `feed-active` on <body>: above the
// desktop breakpoint, styles.css uses these to switch each screen into
// its own desktop layout (top bar + grid for Discover, top bar + centered
// video + beside-video info/actions for For You) instead of the mobile
// phone-frame presentation. Below the breakpoint neither class does
// anything — mobile stays exactly as it was.
// Which screen is showing ('discover' | 'feed' | 'library' | 'profile' |
// 'history' | 'help' | 'watch'), kept by showScreen — nav.js reads it to keep the browser history
// in step with real navigation.
let activeScreenName = 'discover';

function showScreen(name){
  activeScreenName = name;
  // Screen/nav classes are switched FIRST, before anything below reacts
  // to them — render()'s own "is the feed actually visible" check (see
  // its guard around renderMedia) reads feed's screen-hidden class, so
  // that class has to already reflect the screen being switched TO by
  // the time render() runs, not the one being left.
  feed.classList.toggle('screen-hidden', name !== 'feed');
  discoverScreen.classList.toggle('screen-hidden', name !== 'discover');
  libraryScreen.classList.toggle('screen-hidden', name !== 'library');
  profileScreen.classList.toggle('screen-hidden', name !== 'profile');
  historyScreen.classList.toggle('screen-hidden', name !== 'history');
  helpScreen.classList.toggle('screen-hidden', name !== 'help');
  membershipScreen.classList.toggle('screen-hidden', name !== 'membership');
  watchScreen.classList.toggle('screen-hidden', name !== 'watch');
  // History, Help & Feedback and Membership are reached from Profile, so
  // Profile stays the highlighted tab.
  const profileTabActive = name === 'profile' || name === 'history' || name === 'help' || name === 'membership';
  navHome.classList.toggle('active', name === 'discover');
  navForYou.classList.toggle('active', name === 'feed');
  navLibrary.classList.toggle('active', name === 'library');
  navProfile.classList.toggle('active', profileTabActive);
  topbarHome.classList.toggle('active', name === 'discover');
  topbarForYou.classList.toggle('active', name === 'feed');
  topbarLibrary.classList.toggle('active', name === 'library');
  topbarProfile.classList.toggle('active', profileTabActive);
  document.body.classList.toggle('discover-active', name === 'discover');
  document.body.classList.toggle('feed-active', name === 'feed');

  if(name !== 'feed'){
    stopFeedPlayback();
  } else if(slides.length && renderedMediaEpisodeId !== slides[idx].episodeId){
    // Coming back into the feed after stopFeedPlayback tore its video
    // down (or before the very first render) — reload the current
    // slide's media the same way goTo/render always do.
    render();
  }
  // Same idea as stopFeedPlayback, for the desktop watch page's own
  // separate video (see watch.js) — leaving it for any other screen
  // must actually tear its iframe down too.
  if(name !== 'watch') stopWatchPlayback();
  // Any navigation closes the search takeover — openTopbarSearch()
  // itself calls showScreen('discover') before opening it, so this
  // no-ops harmlessly in that order rather than fighting it.
  closeTopbarSearch();

  // The real "returned to the home screen" moment pwa-install.js waits
  // for to offer its one real second install chance — see
  // notifyHomeScreenShown() there, which no-ops unless that chance is
  // genuinely earned (already watched part of an episode, first chance
  // already shown, second chance not shown yet).
  if(name === 'discover' && typeof notifyHomeScreenShown === 'function') notifyHomeScreenShown();

  // Tell the browser this is a real navigation step (nav.js).
  navSync();
}

// Continue Watching: {series_id -> latest get_continue_watching row for
// that series}. One source of truth, read by two things — the silent
// auto-resume inside openSeriesInFeed below (every series-open, mobile
// and desktop) and discover.js's small floating "Continue" bar (mobile
// Home only). Neither of those is a separate lookup; both just read
// this map. get_continue_watching (unchanged, per the hard constraint
// against touching watch_progress/RLS/the RPC itself) already does the
// real signed-in-viewer + "has anyone actually watched anything"
// filtering server-side.
let continueWatchingMap = new Map();

async function refreshContinueWatchingMap(){
  const items = await fetchContinueWatching();
  continueWatchingMap = new Map(items.map(item => [item.series_id, item]));
  return continueWatchingMap;
}

// Resolved once continueWatchingMap has its first real data, same
// pattern as slidesReady below — discover.js awaits both before its
// first render of the floating bar, so it never renders empty just
// because slides happened to resolve first.
let resolveContinueWatchingReady;
const continueWatchingReady = new Promise(resolve => { resolveContinueWatchingReady = resolve; });

// Real per-episode lock check — the one rule in coins.js
// (isEpisodeUnlocked): unlocked if within the series' own
// free_episode_count, Free Mode is on, the viewer has an active
// subscription, or the server has an episode_unlocks row for it. Same
// rule the desktop watch page's grid uses, and the same one the video
// signing function enforces on the server.
function isEpisodeLocked(s, ep){
  return !isEpisodeUnlocked(s.freeEpisodeCount, ep);
}

// Moves slide s to real episode ep as its current position — used by
// entering watching, in-series swipe navigation, and the jump grid
// alike, so all three ever do this exactly one way. Never sets a real
// bunnyVideoId for a locked episode (renderMedia's own honest "no video
// yet" static-art fallback handles that instead of ever actually
// playing it) — s.locked/s.lockedEpisode are what the real unlock
// prompt (unlockBtn) reads to know what it's actually prompting for.
function setActiveEpisode(s, ep){
  const locked = isEpisodeLocked(s, ep);
  // Same episode, lock state flipped (just unlocked, or signed out): the
  // art/video already on screen for it is now wrong, so let renderMedia
  // redo it instead of skipping it as "already rendered".
  if(s.episodeId === ep.id && s.locked !== locked && renderedMediaEpisodeId === ep.id) renderedMediaEpisodeId = null;
  s.activeEpisode = ep;
  s.currentEp = ep.episode_number;
  s.episodeId = ep.id;
  s.epBadge = 'EP ' + ep.episode_number + ' · ' + s.totalEp;
  s.locked = locked;
  s.lockedEpisode = locked ? ep : null;
  s.bunnyVideoId = locked ? null : (ep.bunny_video_id || null);
}

// Used by discover.js: open a specific series (by its index in `slides`)
// — every poster/hero/shelf/search-result tap, and the floating bar's
// own Continue button, all funnel through this one function. On desktop
// this opens the dedicated watch page (watch.js) instead of the mobile
// swipe feed. matchesMedia mirrors the exact 900px breakpoint styles.css
// uses everywhere else, not a separate cutoff.
async function openSeriesInFeed(i){
  const slide = slides[i];
  const resume = slide ? continueWatchingMap.get(slide.id) : null;

  if(window.matchMedia('(min-width: 900px)').matches){
    openWatchScreen(i, resume ? { episodeId: resume.episode_id, positionSeconds: resume.position_seconds } : null);
    return;
  }
  await enterMobileWatching(i, resume);
}

// The one general mechanism for a series actually entering its watching
// state on mobile — a normal tap, Continue Watching's resume, and a
// swipe rolling forward off the real end of the previous series (see
// advanceForward) all funnel through this, rather than the old one-off
// "guess whether the resume lands on the first episode or fetch that
// one episode specially" workaround this replaced. Fetches this one
// series' real, full episode list via fetchEpisodesForSeries (the same
// one real source the desktop watch page and admin panel already use),
// once — guarded by episodesLoaded so re-entering the same series later
// this session (tapping it again, resuming again) never re-fetches.
async function enterMobileWatching(i, resume){
  const slide = slides[i];
  if(!slide) return;
  pendingResumeEpisodeId = null;

  if(!slide.episodesLoaded){
    const episodes = await fetchEpisodesForSeries(slide.id);
    slide.episodes = episodes;
    slide.episodesLoaded = true;
  }
  if(!slide.episodes.length) return; // genuinely no episodes to watch

  let targetEp = slide.episodes[0];
  let resumeSeconds = 0;
  if(resume && resume.position_seconds > 0.5){
    const resumeEp = slide.episodes.find(e => e.id === resume.episode_id);
    if(resumeEp){ targetEp = resumeEp; resumeSeconds = resume.position_seconds; }
    // Saved episode no longer in this series' real list: targetEp stays
    // the real first episode, same honest fallback as no saved progress.
  }

  setActiveEpisode(slide, targetEp);
  if(resumeSeconds > 0.5 && !slide.locked){
    pendingResumeEpisodeId = slide.episodeId;
    pendingResumeSeconds = resumeSeconds;
  }

  goTo(i);
  feed.classList.add('watching');
  // What to preload depends on 'watching' (this series' NEXT episode while
  // watching, the next series' first episode while browsing — see
  // nextPreloadTarget). goTo() above strips 'watching' and re-renders, so
  // if this episode is already on screen, renderMedia returned early
  // without re-picking, and if it isn't, it picked the *browsing* target
  // before 'watching' was put back. Either way nothing re-ran once we
  // were actually watching, so the next episode was never warmed up and
  // the first swipe out of a series was always a cold load (found by
  // logging real preload starts: none for episode 2 until the swipe
  // itself). Re-pick now, but only if media is already rendered for this
  // episode — when it isn't (a tap from Home, feed still hidden),
  // showScreen('feed') below renders it with 'watching' already set,
  // which picks correctly on its own. maintainPreload also drops the
  // stale browsing-target preload, so nothing extra stays loaded.
  if(renderedMediaEpisodeId === slide.episodeId) maintainPreload();
  showChromeOnEntry(); // entering an episode always starts with the real chrome group visible, even during the brief loading-art wait before promotion — and, if its video is already playing, starts the 2s auto-hide right now
  showScreen('feed');
}

// Re-checked every time Home is opened (rather than only once at
// startup) so the floating bar (see discover.js) reflects anything that
// changed since — just signed in, just watched something, just resumed
// elsewhere — instead of a stale snapshot from page load.
navHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
navForYou.addEventListener('click', ()=> showScreen('feed'));
topbarHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
topbarForYou.addEventListener('click', ()=> showScreen('feed'));

// Library: re-checked fresh every time the tab is opened (renderLibraryScreen,
// library.js) rather than trusting a possibly-stale snapshot from earlier
// this session — same reasoning as Home's own refreshContinueWatchingMap above.
navLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });
topbarLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });

// Profile: check the current Supabase Auth session each time the tab is
// opened (renderProfileScreen, defined in auth.js) rather than tracking
// it continuously — simple, and sufficient since nothing else on screen
// depends on auth state while the user is on a different tab.
navProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfileBtn.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });

// Top bar "Top Up" pill: the real Get Coins sheet (coins.js).
topbarTopUpBtn.addEventListener('click', ()=> openCoinSheet());

// Top bar search icon: takes over the whole nav row with a full search
// input and dims the rest of the page behind it — checked directly
// against reelshort.com's own search behaviour (see discover.js for the
// close/input/results wiring, which reuses the exact same
// searchQuery/matchesSearch logic the mobile search bar already has —
// no second search implementation). Always switches to Discover first
// since the results panel only makes visual sense over that screen.
function openTopbarSearch(){
  showScreen('discover');
  topbarDesktopInner.classList.add('search-hidden');
  topbarSearchBar.classList.add('open');
  topbarSearchBackdrop.classList.add('open');
  setTimeout(()=> topbarSearchInput.focus(), 150);
}
function closeTopbarSearch(){
  topbarDesktopInner.classList.remove('search-hidden');
  topbarSearchBar.classList.remove('open');
  topbarSearchBackdrop.classList.remove('open');
}
topbarSearchBtn.addEventListener('click', openTopbarSearch);
// Clicking anywhere on the dimmed backdrop outside the results panel
// closes search, same as clicking outside it on the real site. The
// listener is on the backdrop itself, not the panel inside it, so
// clicks on real results/inputs never bubble into a false close.
topbarSearchBackdrop.addEventListener('click', (e)=> {
  if(e.target === topbarSearchBackdrop) closeTopbarSearch();
});

function buildSpine(currentEp,totalEp){
  const count = 14;
  const filled = Math.round((currentEp/totalEp)*count);
  let html = '';
  for(let i=0;i<count;i++){
    if(i === filled){ html += '<div class="tick current"></div>'; }
    else if(i < filled){ html += '<div class="tick watched"></div>'; }
    else { html += '<div class="tick"></div>'; }
  }
  spine.innerHTML = html;
}

function setArt(art){
  if(art.type === 'img'){
    bgvideo.innerHTML = '<img src="' + art.src + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
  } else {
    bgvideo.innerHTML = art.markup;
  }
}

// Keeps the real playback controls (scrub bar, speed) in lockstep with
// whether a real video is actually the thing on screen right now — art
// (locked episode, still loading) never gets scrub/speed controls
// floating uselessly over it. bgvideo's own 'has-video' class is the
// single real source of truth for this everywhere it's set.
function setBgHasVideo(hasVideo){
  bgvideo.classList.toggle('has-video', hasVideo);
  videoControls.classList.toggle('has-video', hasVideo);
  if(!hasVideo) scrubDuration.textContent = ''; // no video, no duration — never a leftover from the previous episode
}

// The real wait for a real episode's video to actually become playable
// (renderMedia below) — replaces the series' own cover image for that
// wait specifically, never used for a genuinely video-less/locked
// episode (there's nothing being waited on there, see renderMedia).
function setLoadingArt(){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoaderHtml('pulse') + '</div>';
}

// Tears down whatever's currently the real, active video — real hls.js
// resources (its segment-loading loop, the scheduled auth-refresh
// timer), not just the DOM element, which merely removing/replacing
// #bgvideo's own content never released on its own. A no-op if nothing
// is actually playing.
function destroyActivePlayback(){
  if(currentPlaybackCtl) currentPlaybackCtl.destroy();
  currentVideoEl = null;
  currentPlaybackCtl = null;
  clearChromeHideTimer(); // never let a stale timer from the outgoing video hide the next one's chrome mid-flight
}

// Starts loading a real episode's video off-screen, in #preloadHost,
// well before it's ever shown — a real <video> element plus hls.js
// (video-player.js), already fetching its real signed URL and buffering
// real segments, so a swipe can land on an already-playing video
// instead of waiting on it cold. target is {id (real episode id),
// bunnyVideoId, seriesId} — see nextPreloadTarget. No-ops if there's
// nothing to preload or it's already in flight.
function preloadVideo(target){
  if(!target || !target.bunnyVideoId || preloadCache[target.id]) return;

  const video = document.createElement('video');
  // Warming up off-screen, never playing — muted so it can never make noise
  // by accident. promotePreload applies the viewer's real sound preference
  // (see the Sound block) the moment it becomes the active video.
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  preloadHost.appendChild(video);

  const entry = { video, ctl: null, ready: false };
  preloadCache[target.id] = entry;

  attachEpisodePlayback(video, target.id, () => onEpisodeLoadFailed(target)).then((ctl) => {
    // Preload was torn down (maintainPreload dropped it, or the whole
    // feed navigated away) before the real signed URL/hls.js setup
    // resolved — nothing left to attach this real playback to.
    if(preloadCache[target.id] !== entry) { if(ctl) ctl.destroy(); return; }
    if(!ctl){
      // The function's own real refusal (see video-player.js) — this
      // episode genuinely isn't playable right now. Never fall back to
      // anything else; just drop the preload attempt.
      delete preloadCache[target.id];
      video.remove();
      return;
    }
    entry.ctl = ctl;
    video.addEventListener('canplay', function onCanPlay(){
      video.removeEventListener('canplay', onCanPlay);
      entry.ready = true;
      // If the feed is sitting on this exact episode right now (it
      // loaded faster than the viewer swiped away), promote it
      // immediately instead of leaving it preloaded and unused.
      if(target.id === renderedMediaEpisodeId && currentVideoEl !== video) promotePreload(target);
    }, { once: true });
  });
}

// Every real bounded retry (attachEpisodePlayback, video-player.js) has
// now genuinely been exhausted for this episode — confirmed live: before
// this existed, nothing upstream ever learned a load had failed, so a
// preload that died just sat on a dead <video> forever while the loading
// spinner (or, if the viewer had already swiped to it, the same spinner
// on screen) never went anywhere. Drops the dead preload entry so the
// next time this episode is actually needed (goTo/renderMedia calling
// preloadVideo again), it gets a genuinely fresh attempt with its own
// full set of retries — never a permanently poisoned cache entry. If
// the viewer is looking at this exact episode right now, replaces the
// loading spinner with the honest failure state immediately, rather than
// leaving them staring at a spinner that's already dead underneath it.
function onEpisodeLoadFailed(target){
  const entry = preloadCache[target.id];
  if(entry){
    if(entry.ctl) entry.ctl.destroy();
    entry.video.remove();
    delete preloadCache[target.id];
  }
  if(target.id === renderedMediaEpisodeId && !currentVideoEl){
    setFailedToLoadArt(target);
  }
}

// The honest failure state in #bgvideo — real retry button wired to
// genuinely redo the whole load (preloadVideo again, from scratch, not
// just re-showing a spinner over the same dead attempt).
function setFailedToLoadArt(target){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoadFailedHtml('bgvideoRetryBtn') + '</div>';
  document.getElementById('bgvideoRetryBtn').addEventListener('click', () => {
    setLoadingArt();
    preloadVideo(target);
  });
}

// Moves an already-warmed preload from the off-screen host into #bgvideo
// and makes it the real, active video — the "instant start" case.
// Moving a <video> element in the DOM (rather than removing/re-adding
// it, or ever touching its src) preserves its real playback/buffer
// state, so this is a genuine handoff, not a reload. target is the same
// {id, bunnyVideoId, seriesId} descriptor preloadVideo was given.
function promotePreload(target){
  const entry = preloadCache[target.id];
  if(!entry) return;
  delete preloadCache[target.id];

  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(true);
  bgvideo.appendChild(entry.video);
  currentVideoEl = entry.video;
  currentPlaybackCtl = entry.ctl;
  currentVideoEpisodeId = target.id;
  currentVideoSeriesId = target.seriesId;
  attachPlaybackControls(entry.video);
  attachViewTracking(entry.video, () => (currentVideoEpisodeId === target.id) ? target.id : null);

  // The automatic resume's jump-back-in (see enterMobileWatching): this
  // episode's video has just genuinely become the active one for the
  // first time, so if a resume was queued for exactly this episode,
  // this is when to seek it — a real, direct, synchronous currentTime
  // assignment, already reliable the moment canplay has fired (which
  // promotion itself is gated on), no polling needed.
  if(pendingResumeEpisodeId === target.id){
    entry.video.currentTime = pendingResumeSeconds;
    pendingResumeEpisodeId = null;
  }

  // 'ended' is wired here, once, only on the video that's actually
  // becoming active — never during preload. Checking that this episode
  // is still the current one guards against a stale listener on a
  // video that's since been torn down. Advances the same real way a
  // forward swipe would (see advanceForward) — the next real episode in
  // this series while watching, or the next series while just browsing.
  entry.video.addEventListener('ended', () => {
    if(target.id !== currentVideoEpisodeId || target.id !== renderedMediaEpisodeId) return;
    advanceForward();
  });

  // Sound on unless the viewer has muted it (see the Sound block above).
  soundAutoplayBlocked = false;
  entry.video.muted = soundMuted;
  updateMuteButton();
  if(feed.classList.contains('paused')) entry.video.pause();
  else playWithSound(entry.video);
}

// Wires the real scrub bar to whichever <video> just became active —
// called once per promotion (video-player.js's own instance is
// per-episode, so this re-wires fresh each time rather than trying to
// move listeners between elements).
function attachPlaybackControls(video){
  scrubRange.value = video.currentTime || 0;
  // A preloaded video (the normal case — see promotePreload) has
  // usually already buffered well past loadedmetadata by the time this
  // runs, so that event has already fired and would never come again —
  // read a real, already-known duration straight away rather than only
  // ever waiting for a future event that a fresh (non-preloaded) video
  // still genuinely needs this same listener for.
  scrubRange.max = (video.duration && isFinite(video.duration)) ? video.duration : 0;
  scrubRange.style.setProperty('--scrub-pct', '0%');
  // Episode length at the bar's right end: this video's own real
  // duration if already known, otherwise blank until loadedmetadata
  // (videoDurationLabel, shared-utils.js, returns '' before metadata) — display
  // only, nothing here touches seeking or playback.
  scrubDuration.textContent = videoDurationLabel(video);

  video.addEventListener('loadedmetadata', () => {
    if(currentVideoEl !== video) return;
    scrubRange.max = video.duration || 0;
    scrubDuration.textContent = videoDurationLabel(video);
  });
  // HLS can refine the duration after loadedmetadata.
  video.addEventListener('durationchange', () => {
    if(currentVideoEl !== video) return;
    scrubDuration.textContent = videoDurationLabel(video);
  });
  video.addEventListener('timeupdate', () => {
    if(currentVideoEl !== video || scrubbing) return;
    scrubRange.value = video.currentTime;
    const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
    scrubRange.style.setProperty('--scrub-pct', pct + '%');
  });

  // The real chrome group (see CHROME_AUTOHIDE_MS above) always starts
  // visible the moment this episode's video actually becomes the active
  // one. Arming/clearing the 2-second auto-hide off this video's own
  // real 'playing'/'pause' events (rather than only from the tap
  // handler below) means it fires the same real way regardless of
  // *why* playback started or stopped — the initial autoplay right
  // after promotion, a tap-to-unpause, or anything else that genuinely
  // plays or pauses this video.
  showChrome();
  video.addEventListener('playing', () => {
    if(currentVideoEl !== video) return;
    armChromeHideTimer();
  });
  video.addEventListener('pause', () => {
    if(currentVideoEl !== video) return;
    clearChromeHideTimer();
    showChrome(); // a genuinely paused video never sits there with no visible way to unpause it
  });
}

// Real, draggable seeking — a real <input type=range>'s own native drag
// handling, not hand-rolled pointer math. scrubbing is set for the
// whole real drag (not just the final release) so the timeupdate
// handler above never fights the viewer's own finger mid-drag; seeking
// live on 'input' (not only on release) is what makes this a genuine
// scrub, not just a tap-to-jump.
scrubRange.addEventListener('input', () => {
  scrubbing = true;
  if(currentVideoEl) currentVideoEl.currentTime = parseFloat(scrubRange.value);
  const pct = scrubRange.max > 0 ? (scrubRange.value / scrubRange.max) * 100 : 0;
  scrubRange.style.setProperty('--scrub-pct', pct + '%');
});
scrubRange.addEventListener('change', () => { scrubbing = false; });
// Never let a drag that starts on the scrub bar reach #feed's own
// vertical swipe listeners (touchstart/touchend) — touch-action:none
// (styles.css) already stops the browser's native panning from
// interfering, but JS event bubbling is a separate concern: without
// this, the feed would still see the same touch sequence and could
// misread it as a swipe.
['touchstart', 'touchend', 'touchmove', 'pointerdown'].forEach(evt => {
  scrubRange.addEventListener(evt, e => e.stopPropagation());
});

// What to warm up next depends on which of the two real states the
// current slide is actually in: its own next real episode while
// watching, or the next series' first episode while just browsing —
// same preload mechanism either way (preloadVideo/maintainPreload never
// know or care which case produced the target), just pointed at a
// different real target.
function nextPreloadTarget(){
  const s = slides[idx];
  if(!s) return null;
  if(feed.classList.contains('watching') && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    const nextEp = curPos !== -1 ? s.episodes[curPos + 1] : null;
    return nextEp ? { id: nextEp.id, bunnyVideoId: nextEp.bunny_video_id || null, seriesId: s.id } : null;
  }
  const nextSlide = slides[(idx + 1) % slides.length];
  return nextSlide ? { id: nextSlide.episodeId, bunnyVideoId: nextSlide.bunnyVideoId, seriesId: nextSlide.id } : null;
}

// Kicks off preloading the real next target (see nextPreloadTarget), and
// tears down any preload that's neither the current episode nor that
// next one — so there's never more than one silent, warming-up video
// sitting in the background at a time, on top of whatever's actually on
// screen.
function maintainPreload(){
  const target = nextPreloadTarget();
  if(target && target.id !== renderedMediaEpisodeId) preloadVideo(target);

  const keepIds = [renderedMediaEpisodeId, target ? target.id : null];
  Object.keys(preloadCache).forEach(id => {
    if(keepIds.indexOf(id) === -1) destroyPreloadEntry(id);
  });
}

// Tears down one off-screen preload for real — .destroy() (video-player.js)
// releases hls.js's own real resources (its segment-loading loop, the
// scheduled auth-refresh timer), not just the DOM element, and is a
// no-op if the real signed URL/hls.js setup hasn't resolved yet (that
// callback notices the cache entry is gone and cleans up itself once it
// does — see preloadVideo).
function destroyPreloadEntry(episodeId){
  const entry = preloadCache[episodeId];
  if(!entry) return;
  delete preloadCache[episodeId];
  if(entry.ctl) entry.ctl.destroy();
  entry.video.remove();
}

// Renders whichever media the current slide's real active episode
// should show. Default is always the existing static art — honest, no
// regression, identical to an episode with no video at all (including a
// real locked one, see setActiveEpisode) — and it *upgrades* to the real
// video the moment that video is actually ready, whenever that turns
// out to be: instantly if it was already preloaded, later if it just
// started loading now, or never if bunny_video_id doesn't point at a
// real video (Bunny's own 404 page for a bad id never sends a 'ready' at
// all, so this deliberately never times out and gives up — there's no
// reliable way to tell "still loading" and "genuinely broken" apart from
// out here, and wrongly giving up on a real, just-slow video would be
// worse than staying on art a little longer than strictly necessary).
//
// destroyActivePlayback (above) tears down whatever real video was
// already active — its own hls.js resources, not just the DOM element —
// so at most one *active* video is ever really running.
//
// Guarded by renderedMediaEpisodeId so re-rendering the *same* episode
// (unlocking it, tapping Continue) only updates the surrounding UI, not
// the video itself — otherwise every unrelated re-render would tear
// down and restart whatever was already playing. Keyed by the real
// episode id, not the slide/series id, since one slide can now point at
// different real episodes over time (see header comment).
function renderMedia(s){
  if(s.episodeId === renderedMediaEpisodeId) return;
  renderedMediaEpisodeId = s.episodeId;
  destroyActivePlayback();
  currentVideoEpisodeId = s.episodeId;
  currentVideoSeriesId = s.id;

  if(!s.bunnyVideoId){
    setBgHasVideo(false);
    setArt(s.art);
    maintainPreload();
    return;
  }

  const existing = preloadCache[s.episodeId];
  if(existing && existing.ready){
    promotePreload({ id: s.episodeId, bunnyVideoId: s.bunnyVideoId, seriesId: s.id });
    maintainPreload();
    return;
  }

  // Not preloaded yet (or still warming up) — a real episode's video
  // that's genuinely on its way, so this shows the real loading state
  // instead of the series' own cover image while it loads (the cover
  // image showing here was never actually honest — there IS something
  // real being waited on). preloadVideo's own 'ready' handler
  // (registered below, or already registered if `existing` is truthy)
  // promotes it — and replaces this loader with the real video — the
  // moment it's actually ready.
  setBgHasVideo(false);
  setLoadingArt();
  if(!existing) preloadVideo({ id: s.episodeId, bunnyVideoId: s.bunnyVideoId, seriesId: s.id });
  maintainPreload();
}

// Leaving the feed for any other screen must actually stop playback, not
// just hide it — destroyActivePlayback (above) is what tears down the
// video for real (see renderMedia above), so this does the same
// teardown renderMedia already does on every episode switch, just
// triggered by navigation away from the feed instead. Also clears any
// off-screen preload in flight, since those are real videos quietly
// loading too.
// renderedMediaEpisodeId is reset to null so coming back to the feed
// re-renders its media from scratch via the normal render() path,
// instead of render() thinking the current episode's video is already
// showing.
function stopFeedPlayback(){
  if(renderedMediaEpisodeId === null && Object.keys(preloadCache).length === 0) return;
  saveCurrentFeedProgress();
  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(false);
  currentVideoEpisodeId = null;
  currentVideoSeriesId = null;
  renderedMediaEpisodeId = null;
  Object.keys(preloadCache).forEach(destroyPreloadEntry);
}

// Reads the currently-playing episode's real position straight off the
// real <video> element (never assumed/estimated) and upserts it via
// watch-progress.js. No-ops quietly if there's no real video playing
// right now. Both the real episode id AND its series id are read
// straight off currentVideoEpisodeId/currentVideoSeriesId (kept in
// lockstep wherever they're set — see renderMedia/promotePreload)
// rather than looked up from `slides` by id here: the slide that
// episode belongs to may already have moved on to a different real
// episode by the time this runs (real in-series swiping makes that a
// normal, frequent case now, not just a rare race), so searching
// `slides` for it could silently find nothing, or worse, the slide's
// now-different current episode. Called periodically, on pause, and
// whenever the feed leaves the current episode (goTo, stopFeedPlayback,
// in-series navigation).
function saveCurrentFeedProgress(){
  if(!currentVideoEl || !currentVideoEpisodeId || !currentVideoSeriesId) return;
  saveWatchProgress(currentVideoEpisodeId, currentVideoSeriesId, currentVideoEl.currentTime);
}

// 15s: frequent enough that a crash/refresh never loses more than a few
// seconds of real progress, infrequent enough not to spam the DB with
// upserts for something the user isn't actively pausing/leaving anyway.
setInterval(saveCurrentFeedProgress, 15000);

// Pauses the feed's episode exactly as a tap on it would (paused state,
// progress saved) and leaves it paused for the viewer to resume. Used by
// ads.js while a rewarded ad is showing.
function pauseCurrentFeedEpisode(){
  if(!currentVideoEl || currentVideoEl.paused) return;
  feed.classList.add('paused');
  currentVideoEl.pause();
  saveCurrentFeedProgress();
}

function renderEmptyFeed(){
  destroyActivePlayback();
  bgvideo.innerHTML = '';
  setBgHasVideo(false);
  currentVideoEpisodeId = null;
  currentVideoSeriesId = null;
  renderedMediaEpisodeId = null;
  Object.keys(preloadCache).forEach(destroyPreloadEntry);
  spine.innerHTML = '';
  pager.innerHTML = '';
  epBadge.textContent = '';
  coinBalance.textContent = coinState.balance;
  ctaRow.classList.add('hidden');

  // "No series available" is a real, honest statement only once
  // fetchSlides() has actually come back empty — while it's still in
  // flight (slidesLoaded false), this was wrongly showing that same
  // permanent-sounding message during what's actually just a real,
  // temporary wait on real data. The loading state replaces the title/
  // synopsis area for that wait instead.
  if(slidesLoaded){
    titleEl.innerHTML = 'No series available right now';
    synopsisEl.innerHTML = '';
    synopsisEl.textContent = 'Please check back soon.';
  } else {
    titleEl.innerHTML = '';
    synopsisEl.innerHTML = narravaLoaderHtml('pulse', 'Loading Narrava…');
  }
}

function render(){
  if(slides.length === 0){
    renderEmptyFeed();
    return;
  }
  ctaRow.classList.remove('hidden');

  const s = slides[idx];
  // Only actually load/play media while the feed is the visible screen.
  // render() also runs at startup (init(), before the user has ever
  // navigated anywhere — Discover is the default screen) and gets
  // called by like/save/unlock while already on the feed; in both of
  // those cases skipping this is either correct (startup: nothing
  // should be preloading or playing yet) or a harmless no-op
  // (renderMedia is itself guarded against re-running for a slide
  // that's already loaded). Without this, a fresh page load on
  // Discover was creating a real Bunny iframe and promoting it into
  // #bgvideo — invisible (the feed is display:none) but still actually
  // playing — never something a shelf poster caused, purely this
  // startup path running before any navigation happened.
  if(!feed.classList.contains('screen-hidden')) renderMedia(s);
  epBadge.textContent = s.epBadge;
  titleEl.innerHTML = s.title.replace('\n','<br>');
  synopsisEl.textContent = s.synopsis;
  likeCount.textContent = s.likes;
  likeBtn.classList.toggle('liked', s.liked);
  bookmarkBtn.classList.toggle('saved', s.saved);
  commentCount.textContent = s.commentCount;
  saveCount.textContent = s.saves;
  shareCount.textContent = s.shares;
  if(!s.socialLoaded) loadFeedSocialState(s);
  coinBalance.textContent = coinState.balance;
  buildSpine(s.currentEp, s.totalEp);

  // The real unlock prompt — shown whenever the episode actually being
  // looked at right now (browsing preview, or wherever watching/
  // swiping/the jump grid landed) is genuinely locked, targeting that
  // exact real episode. Nothing to prompt once it isn't, so it just
  // hides rather than switching to some "already unlocked" cosmetic
  // state (see unlockBtn's own click handler, which asks the server).
  if(s.locked && s.lockedEpisode){
    unlockBtn.classList.remove('hidden');
    unlockLabel.textContent = 'Unlock Ep ' + s.lockedEpisode.episode_number + ' · 1 Nava Coin';
  } else {
    unlockBtn.classList.add('hidden');
  }

  Array.from(pager.children).forEach((d,i)=>d.classList.toggle('active', i===idx));
}

// Real like count + this viewer's own liked/saved state (social.js),
// fetched once per slide — not on every render() call, which happens
// often (every swipe, every unlock) — and guarded by s.socialLoaded so
// a second render() before this resolves doesn't kick off a duplicate
// fetch. Applied to the DOM only if this slide is still the current one
// by the time it resolves, so a fetch from a slide already swiped away
// from never overwrites whatever's actually on screen now.
async function loadFeedSocialState(s){
  s.socialLoaded = true;
  const state = await fetchSeriesSocialState(s.id);
  s.likes = state.likeCount;
  s.liked = state.liked;
  s.saved = state.saved;
  s.commentCount = state.commentCount;
  s.saves = state.saveCount;
  s.shares = state.shareCount;
  if(slides[idx] === s){
    likeCount.textContent = s.likes;
    likeBtn.classList.toggle('liked', s.liked);
    bookmarkBtn.classList.toggle('saved', s.saved);
    commentCount.textContent = s.commentCount;
    saveCount.textContent = s.saves;
    shareCount.textContent = s.shares;
  }
}

// Scrolling/swiping to a (possibly new) slide always lands back in the
// default browsing state — overlay visible, autoplaying, not paused —
// even if the slide you're leaving was in watching or paused. This is
// pure series-to-series navigation (pager dots, a browsing swipe/wheel
// tick) — callers that want to land directly in watching
// (enterMobileWatching) explicitly add that back right after calling
// this, same as before.
function goTo(i){
  if(slides.length === 0) return;
  saveCurrentFeedProgress();
  idx = (i + slides.length) % slides.length;
  feed.classList.remove('watching');
  feed.classList.remove('paused');
  render();
}

// A manual navigation always supersedes any still-pending automatic
// resume seek (see enterMobileWatching/promotePreload) — without this,
// swiping away and later swiping back onto the same episode could replay
// a stale resume-seek the viewer never asked for this time.
function clearPendingResume(){
  pendingResumeEpisodeId = null;
}

// Moves the CURRENTLY WATCHED slide to a different one of its own real
// episodes — idx/pager/the "watching" state itself never change, only
// which of this series' real episodes is active. Used by in-series
// swipe navigation and the jump grid alike. If ep is locked, this never
// plays it — setActiveEpisode leaves it showing the same real unlock
// prompt (unlockBtn) every other locked episode in this app already
// uses, not a new one.
function goToEpisodeInSlide(s, ep){
  clearPendingResume();
  setActiveEpisode(s, ep);
  render();
}

// The one real "move forward" action — used by a forward swipe/wheel
// tick AND by a video actually finishing (see promotePreload's 'ended'
// handling), so both do exactly the same real thing. While actually
// watching a series with its real episode list already loaded, this
// moves to its next real episode, or — once genuinely past the last
// one — rolls straight into the next series' own watching state at its
// first episode (never back to browsing, same continuous feel). While
// just browsing, it's plain series-to-series navigation, unchanged.
function advanceForward(){
  const s = slides[idx];
  if(feed.classList.contains('watching') && s && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    if(curPos === -1) return;
    if(curPos + 1 < s.episodes.length){
      goToEpisodeInSlide(s, s.episodes[curPos + 1]);
    } else {
      enterMobileWatching((idx + 1) % slides.length, null);
    }
    return;
  }
  clearPendingResume();
  goTo(idx + 1);
}

// The mirror of advanceForward for a backward swipe/wheel tick. While
// watching, this stops dead at the real episode one — no wrapping
// around to a previous series — rather than doing anything at all past
// that point.
function advanceBackward(){
  const s = slides[idx];
  if(feed.classList.contains('watching') && s && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    if(curPos <= 0) return; // already at episode one — stays put
    goToEpisodeInSlide(s, s.episodes[curPos - 1]);
    return;
  }
  clearPendingResume();
  goTo(idx - 1);
}

pager.addEventListener('click', e=>{
  if(e.target.dataset.i !== undefined){ clearPendingResume(); goTo(parseInt(e.target.dataset.i)); }
});

let touchStartY = null;
feed.addEventListener('touchstart', e=>{ touchStartY = e.touches[0].clientY; });
feed.addEventListener('touchend', e=>{
  if(touchStartY===null) return;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if(dy < -40){ advanceForward(); }
  else if(dy > 40){ advanceBackward(); }
  touchStartY = null;
});
let wheelLock = false;
feed.addEventListener('wheel', e=>{
  if(wheelLock) return;
  wheelLock = true;
  if(e.deltaY > 8){ advanceForward(); }
  else if(e.deltaY < -8){ advanceBackward(); }
  setTimeout(()=>wheelLock=false, 500);
});

// The single tap target covering the whole video, with two different
// jobs depending on state:
//   - Browsing (the default): tapping commits to watching this slide —
//     the same real "enter the watching state" mechanism as tapping a
//     poster from Discover or Continue Watching (enterMobileWatching),
//     so a normal in-feed tap gets a real episode list and real resume
//     too, not just a bare CSS class flip with no episode data behind
//     it. The video keeps playing exactly as it was, untouched, if
//     there's no saved progress to resume from.
//   - Watching: a real tap either reveals the real chrome group or
//     toggles play/pause, depending on whether that group is already
//     showing (see the CHROME_AUTOHIDE_MS comment above for the full
//     real sequence) — and press-and-hold anywhere on the video is
//     real, temporary 2x, a separate, untouched mechanic (see
//     HOLD_SPEED). Neither ever brings the browsing overlay itself
//     back — that only happens by swiping/scrolling to a new slide
//     (goTo already resets to browsing there).
playToggle.addEventListener('click', ()=>{
  if(feed.classList.contains('watching')) return; // tap/hold here now fully owned by the pointer handlers below
  if(slides.length === 0) return;
  // This shared feed also gets reused, restyled, as desktop's own
  // "For You" tab (see styles.css's body.feed-active rules) — but
  // real episode swiping/the jump grid/the real per-episode unlock
  // prompt are mobile-only (matching how openSeriesInFeed already
  // sends desktop to its own dedicated watch.js page instead of this
  // feed for the actual "watch a series" experience there). Desktop's
  // For You tab keeps its exact prior simple behavior — just commit
  // to watching, no real episode fetch — rather than this task's new
  // mechanism leaking into a screen it was never meant to touch.
  if(window.matchMedia('(min-width: 900px)').matches){
    feed.classList.add('watching');
    showChromeOnEntry();
    navSync();
    return;
  }
  const s = slides[idx];
  enterMobileWatching(idx, continueWatchingMap.get(s.id));
});

// Real press-and-hold-to-2x, confirmed directly against reelshort.com:
// instant on press (no delay/ramp — see HOLD_SPEED above), instant back
// to normal the moment it's released, exactly wherever playback
// actually is at that instant — never a lingering faster speed. A tap
// (a press released within TAP_MAX_MS) still toggles play/pause, same
// as before, just decided here now instead of a separate 'click'
// listener, since only a real press/release pair can tell a tap and a
// hold apart. A real vertical drag (SWIPE_CANCEL_PX or more) cancels
// this read entirely — that's #feed's own forward/backward swipe
// gesture, not a tap or a hold, and must never also toggle pause or
// flash 2x on top of navigating.
playToggle.addEventListener('pointerdown', (e) => {
  if(!feed.classList.contains('watching') || !currentVideoEl) return;
  pressStartY = e.clientY;
  pressStartTime = performance.now();
  pressMoved = false;
  pressHolding = !currentVideoEl.paused;
  if(pressHolding) currentVideoEl.playbackRate = HOLD_SPEED;
});
playToggle.addEventListener('pointermove', (e) => {
  if(pressStartY === null) return;
  if(Math.abs(e.clientY - pressStartY) > SWIPE_CANCEL_PX) pressMoved = true;
});
function endPlayTogglePress(){
  if(pressStartY === null) return;
  const wasHolding = pressHolding;
  const moved = pressMoved;
  const elapsed = performance.now() - pressStartTime;
  pressStartY = null;
  pressHolding = false;
  pressMoved = false;
  if(wasHolding && currentVideoEl) currentVideoEl.playbackRate = 1; // instant, exactly where playback actually is — no seeking, no easing
  if(moved) return; // a real swipe — #feed's own touchstart/touchend already handles navigation
  if(elapsed > TAP_MAX_MS) return; // a genuine hold already did its one real job above

  // The real chrome group's own tap rule (see CHROME_AUTOHIDE_MS above):
  // a tap while hidden only ever reveals it, never touches play/pause —
  // and, from that moment, the same 2s auto-hide timer starts as on entry,
  // so the group hides itself again if nobody taps. Nothing else would
  // arm it here: the timer is otherwise armed by the video's 'playing'
  // event, and a reveal-tap never stops the video, so no such event
  // comes (before this, a revealed group stayed up until a pause and
  // resume). A second tap inside that window takes the branch below
  // instead — it pauses, and the video's real 'pause' event clears the
  // timer (see attachPlaybackControls), which only re-arms once the
  // video is actually playing again. A tap while already showing still
  // does exactly what every tap here has always done: toggle play/pause.
  if(feed.classList.contains('chrome-hidden')){
    showChrome();
    if(currentVideoEl && !currentVideoEl.paused && !currentVideoEl.ended) armChromeHideTimer();
    return;
  }
  const nowPaused = feed.classList.toggle('paused');
  if(currentVideoEl){
    if(nowPaused){
      currentVideoEl.pause();
      saveCurrentFeedProgress();
    } else {
      currentVideoEl.play().catch(() => {});
    }
  }
}
playToggle.addEventListener('pointerup', endPlayTogglePress);
playToggle.addEventListener('pointercancel', endPlayTogglePress);

// Real like: series_likes (social.js), not a session-only toggle. A
// signed-out tap opens the same sign-in modal every other account-gated
// action in this app already uses (toggleSeriesLike's own job) instead
// of silently doing nothing — returns null in that case, so the button
// is left exactly as it was rather than flipping to a state that didn't
// really happen. The count is re-fetched for real after a successful
// toggle rather than guessed locally, so it can never drift from what's
// actually in the database.
likeBtn.addEventListener('click', async ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  const newLiked = await toggleSeriesLike(s.id, s.liked);
  if(newLiked === null) return;
  s.liked = newLiked;
  s.likes = await fetchSeriesLikeCount(s.id);
  likeBtn.classList.add('pulse');
  setTimeout(()=>likeBtn.classList.remove('pulse'), 350);
  if(slides[idx] === s) render();
});

// Same real shape as like, against series_saves: a failed (or signed-
// out) toggle returns null and nothing on screen changes; a successful
// one re-fetches the real save total (and share total — same call)
// rather than guessing it locally.
bookmarkBtn.addEventListener('click', async ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  const newSaved = await toggleSeriesSave(s.id, s.saved);
  if(newSaved === null) return;
  s.saved = newSaved;
  const counts = await fetchSeriesSaveShareCounts(s.id);
  s.saves = counts.saves;
  s.shares = counts.shares;
  bookmarkBtn.classList.add('pulse');
  setTimeout(()=>bookmarkBtn.classList.remove('pulse'), 350);
  if(slides[idx] === s) render();
});

// Real comments (comments-panel.js/social.js) in this app's existing
// bottom-sheet shell.
commentBtn.addEventListener('click', () => {
  if(slides.length === 0) return;
  const s = slides[idx];
  commentsSheetBackdrop.classList.add('open');
  commentsSheet.classList.add('open');
  feedCommentsController.load(s.id);
});
function closeCommentsSheet(){
  commentsSheetBackdrop.classList.remove('open');
  commentsSheet.classList.remove('open');
}
commentsSheetClose.addEventListener('click', closeCommentsSheet);
commentsSheetBackdrop.addEventListener('click', closeCommentsSheet);

// Scroll isolation for every bottom sheet in the feed. These sheets (and
// their dimmed backdrops) are DOM children of #feed, and #feed owns the
// touchstart/touchend and wheel listeners that turn a vertical drag or
// wheel tick into advanceForward/advanceBackward — so, by ordinary event
// bubbling, a finger drag or wheel scroll *inside* the comment list (or
// the episode grid) also arrived at #feed and swiped
// the episode underneath. Measured before this: 7 touch drags + 5 wheel
// ticks inside the open comment sheet fired 12 episode swipes. Stopping
// these events at the sheet keeps them from ever reaching #feed; the
// sheet's own native scrolling is untouched (nothing here calls
// preventDefault, and the listeners are passive). Only touch/wheel are
// stopped — clicks and everything else still bubble as before.
[commentsSheet, commentsSheetBackdrop, episodeGridSheet, episodeGridBackdrop].forEach(el => {
  ['touchstart', 'touchmove', 'touchend', 'wheel'].forEach(evt => {
    el.addEventListener(evt, e => e.stopPropagation(), { passive: true });
  });
});

// Real episode jump grid — same real per-episode data and honest
// free_episode_count lock rule as the desktop watch page's own grid
// (watchEpCardHtml in watch.js), in this app's existing bottom-sheet
// shell. Opened from the small "EP X · Y" badge, which stays visible
// while watching specifically so this has somewhere to open from (see
// styles.css). Tapping any cell — locked or not — closes the sheet and
// runs it through the exact same goToEpisodeInSlide a swipe would: an
// unlocked one plays for real; a locked one lands there AND opens the
// unlock prompt (coins.js), since tapping it is asking to watch it.
function epgridCellHtml(s, ep){
  const locked = isEpisodeLocked(s, ep);
  const isActive = ep.id === s.episodeId;
  const lockBadge = locked
    ? '<svg class="epgrid-cell-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>'
    : '';
  return '<button type="button" class="epgrid-cell' + (isActive ? ' active' : '') + (locked ? ' locked' : '') +
    '" data-ep-id="' + ep.id + '">' + lockBadge + ep.episode_number + '</button>';
}

function renderEpisodeGrid(s){
  episodeGridBody.innerHTML = s.episodes.map(ep => epgridCellHtml(s, ep)).join('');
  episodeGridBody.querySelectorAll('.epgrid-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = s.episodes.find(e => e.id === btn.dataset.epId);
      if(!ep) return;
      closeEpisodeGrid();
      goToEpisodeInSlide(s, ep);
      if(s.locked && s.lockedEpisode === ep) promptUnlockForSlide(s, ep);
    });
  });
}

function openEpisodeGrid(){
  if(slides.length === 0) return;
  const s = slides[idx];
  if(!feed.classList.contains('watching') || !s.episodesLoaded) return;
  renderEpisodeGrid(s);
  episodeGridBackdrop.classList.add('open');
  episodeGridSheet.classList.add('open');
}
function closeEpisodeGrid(){
  episodeGridBackdrop.classList.remove('open');
  episodeGridSheet.classList.remove('open');
}
epBadge.addEventListener('click', openEpisodeGrid);
episodeGridClose.addEventListener('click', closeEpisodeGrid);
episodeGridBackdrop.addEventListener('click', closeEpisodeGrid);

// A share has completed and record_series_share has finished (see
// recordSeriesShare, shared-utils.js): re-fetch that series' real
// counts — one call — and show them wherever that series is on screen,
// the feed here and the desktop Watch page (renderWatchSaveShareCounts,
// watch.js). Never +1 locally: the database counts at most one share
// per person per series per day.
document.addEventListener('narrava:series-shared', async (e) => {
  const s = slides.find(x => x.id === e.detail.seriesId);
  if(!s) return;
  const counts = await fetchSeriesSaveShareCounts(s.id);
  s.saves = counts.saves;
  s.shares = counts.shares;
  if(slides[idx] === s){
    saveCount.textContent = s.saves;
    shareCount.textContent = s.shares;
  }
  renderWatchSaveShareCounts(s);
});

// Real sharing (shareSeries, shared-utils.js) — the browser's own native
// share sheet where available, a small fallback popup where it isn't.
document.getElementById('shareBtn').addEventListener('click', ()=>{
  const btn = document.getElementById('shareBtn');
  btn.classList.add('pulse');
  setTimeout(()=>btn.classList.remove('pulse'), 350);
  if(slides.length === 0) return;
  shareSeries(slides[idx].title, slides[idx].id);
});

// Real "enter the watching state" trigger — the same real mechanism as
// the video's own tap target (playToggle below) and Discover/Continue
// Watching's own opens (openSeriesInFeed/enterMobileWatching), not the
// old fake progress-bump left over from the original mockup. Same
// desktop-vs-mobile split as playToggle: desktop's own "For You" tab
// keeps its simple no-episode-fetch behavior, real episode
// fetch/resume is mobile-only.
document.getElementById('continueBtn').addEventListener('click', ()=>{
  if(slides.length === 0) return;
  if(window.matchMedia('(min-width: 900px)').matches){
    feed.classList.add('watching');
    showChromeOnEntry();
    navSync();
    return;
  }
  const s = slides[idx];
  enterMobileWatching(idx, continueWatchingMap.get(s.id));
});

// Tapping the unlock prompt on a locked episode (browsing preview, or
// wherever a swipe/the jump grid landed). The decision and the charge
// are entirely the server's (openUnlockPrompt, coins.js): this only
// plays the episode once the server says it's watchable.
function promptUnlockForSlide(s, ep){
  openUnlockPrompt(ep, () => {
    if(slides[idx] !== s || s.episodeId !== ep.id) return; // moved on meanwhile — the lock icons update via narrava:coins-changed
    goToEpisodeInSlide(s, ep);
  });
}

unlockBtn.addEventListener('click', ()=>{
  if(slides.length === 0) return;
  const s = slides[idx];
  if(!s.locked || !s.lockedEpisode) return;
  promptUnlockForSlide(s, s.lockedEpisode);
});

coinsChip.addEventListener('click', ()=> openCoinSheet());

// The viewer's unlocks/subscription/balance changed (loaded, unlocked,
// bought, signed in or out — see coins.js): re-run the lock rule for
// every slide's current episode and repaint, so lock icons and the
// unlock prompt always agree with the server.
function reapplyEpisodeLocks(){
  slides.forEach(s => { if(s.activeEpisode) setActiveEpisode(s, s.activeEpisode); });
  if(slides.length) render();
  if(episodeGridSheet.classList.contains('open') && slides[idx] && slides[idx].episodesLoaded) renderEpisodeGrid(slides[idx]);
}
document.addEventListener('narrava:coins-changed', reapplyEpisodeLocks);

// Resolved once `slides` has been populated. discover.js awaits this
// before its first render, so the poster grid never renders empty just
// because its own (unrelated) genre queries happened to resolve first.
let resolveSlidesReady;
const slidesReady = new Promise(resolve => { resolveSlidesReady = resolve; });

async function init(){
  // Real maintenance mode check — the one thing that happens before
  // literally anything else, including the anonymous account bootstrap.
  // On, this renders the honest back-soon screen and returns — nothing
  // else in this function (or discover.js's own initDiscover, gated the
  // same real way) ever runs.
  await appSettingsReady;
  if(appSettings.maintenance_mode_enabled){
    renderMaintenanceMode();
    return;
  }

  // Real anonymous account bootstrap (watch-progress.js) — first thing
  // this app does, before slides/continue-watching are even fetched, so
  // every visitor already has a real, genuine account (anonymous or
  // not) for the rest of init and everything after it.
  await bootstrapAnonymousSession();

  // Real Nava Coins state (coins.js) — balance, unlocks, subscription —
  // loaded alongside the slides so locks are right from the first render.
  const coinStateReady = refreshCoinState();

  // Real visit logging (visit-log.js) — once per real page load of the
  // actual consumer app, now that a real account genuinely exists to
  // attribute it to. Fire-and-forget: invisible to the viewer, so it
  // never delays real content on a slow connection.
  logPageVisit();

  const [fetchedSlides] = await Promise.all([fetchSlides(), refreshContinueWatchingMap(), coinStateReady]);
  slides = fetchedSlides;
  slidesLoaded = true;
  pager.innerHTML = slides.map((_,i)=>'<div class="pdot ' + (i===0?'active':'') + '" data-i="' + i + '"></div>').join('');
  reapplyEpisodeLocks(); // fetchSlides may have finished before the viewer's unlocks did (also renders)

  // Welcome bonus (coins.js): signed-in email accounts only, once per
  // load — the server only ever pays it once. Silent unless granted.
  claimWelcomeBonusIfEligible();
  resolveSlidesReady();
  resolveContinueWatchingReady();

  // A shared series link (#series=<id>, see seriesShareUrl in
  // shared-utils.js) — only ever acted on here, after maintenance mode
  // has had its say and real slides exist to look the series up in.
  openDeepLinkedSeries();
}

// Opens straight into the series a shared link names, through the exact
// same openSeriesInFeed every poster tap uses — so the normal lock rule
// (isEpisodeLocked/setActiveEpisode), Free Mode, and resume all apply
// exactly as they do everywhere else; the link itself carries nothing
// about episodes or unlocks. The fragment is cleared once read so a
// refresh (or Back) lands on normal Home instead of re-opening it. An id
// that matches nothing in `slides` (a draft, a deleted series, a mangled
// link) just leaves the viewer on Home with a short honest note.
function openDeepLinkedSeries(){
  const seriesId = seriesIdFromLocationHash();
  if(!seriesId) return;
  history.replaceState(history.state, '', window.location.pathname + window.location.search); // keep nav.js's state on this entry

  const i = slides.findIndex(s => s.id === seriesId);
  if(i === -1){
    showToast('That series isn’t available');
    return;
  }
  openSeriesInFeed(i);
}

// Someone pasting a second series link into a tab where Narrava is
// already open only changes the fragment (no reload), so init()'s own
// call above never runs for it. Before slides exist, init() will pick
// the fragment up itself, so this only acts once they're loaded.
window.addEventListener('hashchange', () => {
  if(slidesLoaded) openDeepLinkedSeries();
});

init();
