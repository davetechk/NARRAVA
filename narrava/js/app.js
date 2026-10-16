// Mobile feed: slides, swipe navigation (between series, or episodes once watching),
// playback, preloading, screens and app start. Video identity is the episode id.

let slides = [];
let slidesLoaded = false; // fetchSlides() has resolved (empty feed vs still loading)
let idx = 0;

// app_settings, fetched once at load. Defaults = nothing overridden, so a failed fetch changes nothing.
let appSettings = { free_mode_enabled: false, maintenance_mode_enabled: false, featured_series_count: 5, subscriptions_enabled: false, vip_section_enabled: false };
let resolveAppSettingsReady;
const appSettingsReady = new Promise(resolve => { resolveAppSettingsReady = resolve; });

// No connection at load (offline.js). A failed read alone isn't offline.
let appStartedOffline = false;
const APP_SETTINGS_TIMEOUT_MS = 10000;

async function loadAppSettings(){
  if(navigator.onLine === false){
    appStartedOffline = true;
    resolveAppSettingsReady();
    return;
  }
  try {
    const { data, error } = await withTimeout(supabaseClient
      .from('app_settings')
      .select('free_mode_enabled, maintenance_mode_enabled, featured_series_count, subscriptions_enabled, vip_section_enabled')
      .eq('id', true)
      .single(), APP_SETTINGS_TIMEOUT_MS);
    if(error) throw error;
    if(data) appSettings = data;
  } catch(err){
    console.error('Narrava: failed to load app settings — falling back to safe defaults (nothing overridden)', err);
    if(!(await serverReachable())) appStartedOffline = true;
  }
  resolveAppSettingsReady();
}
loadAppSettings();

// Maintenance scene, ported from maintenance.html (custom properties renamed --mt-*)
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
  <p>Scheduled maintenance. Your data is safe and we'll be back soon.</p>
  <button type="button" onclick="location.reload()">Check again</button>
</main></div>`;
}

// Font for the maintenance scene, added only while it shows
function ensureMaintenanceFont(){
  if(document.getElementById('mtFontLink')) return;
  const link = document.createElement('link');
  link.id = 'mtFontLink';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap';
  document.head.appendChild(link);
}

// The scene's animation script (innerHTML doesn't run <script>)
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

// Reload only when a re-read clearly says maintenance is off; anything else waits for the next tick
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

// Replace the page with the maintenance scene and start rechecking
let maintenanceRecheckTimer = null;
function renderMaintenanceMode(){
  ensureMaintenanceFont();
  document.body.innerHTML = maintenanceMarkupHtml();
  startMaintenanceAnimation();
  if(maintenanceRecheckTimer) clearInterval(maintenanceRecheckTimer);
  maintenanceRecheckTimer = setInterval(checkMaintenanceStillOn, 60000);
}

// Playback state, keyed by episode id
let currentVideoEl = null;         // active <video>, or null
let currentPlaybackCtl = null;     // attachEpisodePlayback controller
let currentVideoEpisodeId = null;
let currentVideoSeriesId = null;   // series of that episode (for saving progress)
let pendingResumeEpisodeId = null; // episode to seek once its video is ready
let pendingResumeSeconds = 0;
let renderedMediaEpisodeId = null; // episode whose media is in #bgvideo (unrelated re-renders don't restart it)

// Playback controls
let scrubbing = false; // true while dragging the scrub bar

// Hold for 2x, release for 1x
const HOLD_SPEED = 2;
const TAP_MAX_MS = 200;
const SWIPE_CANCEL_PX = 15; // a vertical swipe cancels tap/hold
let pressStartY = null;
let pressStartTime = 0;
let pressHolding = false;
let pressMoved = false;

// Chrome group (title, synopsis, action rail, scrub bar) shows and hides together.
// Shown on entry, hides after 2s of playing; tap when hidden reveals, tap when shown pauses.
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
// Show the chrome on entry, and arm the auto-hide now if the video is already playing
function showChromeOnEntry(){
  showChrome();
  if(currentVideoEl && !currentVideoEl.paused && !currentVideoEl.ended) armChromeHideTimer();
}

// episodeId -> { video, ctl, ready } warming up off-screen in #preloadHost
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
const downloadsScreen = document.getElementById('downloadsScreen');
const profileScreen = document.getElementById('profileScreen');
const watchScreen = document.getElementById('watchScreen');
const navHome = document.getElementById('navHome');
const navForYou = document.getElementById('navForYou');
const navLibrary = document.getElementById('navLibrary');
const navProfile = document.getElementById('navProfile');
// Desktop top bar nav
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
// On by default. If the browser blocks unmuted autoplay, play muted until the first tap.
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

// Play with the viewer's sound preference; retry muted only if autoplay is blocked
function playWithSound(video){
  const attempt = video.play();
  if(!attempt || typeof attempt.catch !== 'function') return;
  attempt.catch(err => {
    if(currentVideoEl !== video) return; // replaced while starting
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
// Button taps aren't feed swipes
['touchstart', 'touchend'].forEach(evt => {
  muteBtn.addEventListener(evt, e => e.stopPropagation());
});

// First tap/key after a forced mute turns sound on (not the mute button itself)
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

// Screens stay mounted; showScreen toggles which is visible.
// activeScreenName is read by nav.js.
let activeScreenName = 'discover';

function showScreen(name){
  activeScreenName = name;
  // Switch classes first: render() checks if the feed is visible
  feed.classList.toggle('screen-hidden', name !== 'feed');
  discoverScreen.classList.toggle('screen-hidden', name !== 'discover');
  libraryScreen.classList.toggle('screen-hidden', name !== 'library');
  profileScreen.classList.toggle('screen-hidden', name !== 'profile');
  historyScreen.classList.toggle('screen-hidden', name !== 'history');
  helpScreen.classList.toggle('screen-hidden', name !== 'help');
  membershipScreen.classList.toggle('screen-hidden', name !== 'membership');
  downloadsScreen.classList.toggle('screen-hidden', name !== 'downloads');
  watchScreen.classList.toggle('screen-hidden', name !== 'watch');
  // Screens reached from Profile keep Profile highlighted
  const profileTabActive = name === 'profile' || name === 'history' || name === 'help' || name === 'membership' || name === 'downloads';
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
    // Back into the feed: reload the current slide's media
    render();
  }
  if(name !== 'watch') stopWatchPlayback();
  closeTopbarSearch();

  // Install popup's second chance (pwa-install.js)
  if(name === 'discover' && typeof notifyHomeScreenShown === 'function') notifyHomeScreenShown();

  navSync();

  // Offline start: finish the switch to online after leaving the player
  onScreenChangedForReconnect(name);
}

// Continue Watching: series_id -> latest get_continue_watching row
let continueWatchingMap = new Map();

async function refreshContinueWatchingMap(){
  const items = await fetchContinueWatching();
  continueWatchingMap = new Map(items.map(item => [item.series_id, item]));
  return continueWatchingMap;
}

// Resolves once continueWatchingMap first loads
let resolveContinueWatchingReady;
const continueWatchingReady = new Promise(resolve => { resolveContinueWatchingReady = resolve; });

// Lock rule: isEpisodeUnlocked (coins.js)
function isEpisodeLocked(s, ep){
  return !isEpisodeUnlocked(s.freeEpisodeCount, ep);
}

// Make ep the slide's current episode (never sets a video for a locked one)
function setActiveEpisode(s, ep){
  const locked = isEpisodeLocked(s, ep);
  // Lock state flipped: let renderMedia redo it
  if(s.episodeId === ep.id && s.locked !== locked && renderedMediaEpisodeId === ep.id) renderedMediaEpisodeId = null;
  s.activeEpisode = ep;
  s.currentEp = ep.episode_number;
  s.episodeId = ep.id;
  s.epBadge = 'EP ' + ep.episode_number + ' · ' + s.totalEp;
  s.locked = locked;
  s.lockedEpisode = locked ? ep : null;
  s.bunnyVideoId = locked ? null : (ep.bunny_video_id || null);
}

// Open a series by its `slides` index (desktop: the Watch page).
// resumeOverride: {episode_id, position_seconds, exactEpisode} (used by Downloads).
async function openSeriesInFeed(i, resumeOverride){
  const slide = slides[i];
  const resume = resumeOverride || (slide ? continueWatchingMap.get(slide.id) : null);

  if(window.matchMedia('(min-width: 900px)').matches){
    openWatchScreen(i, resume ? { episodeId: resume.episode_id, positionSeconds: resume.position_seconds } : null);
    return;
  }
  await enterMobileWatching(i, resume);
}

// Enter a series' watching state on mobile; fetches its episode list once
async function enterMobileWatching(i, resume){
  const slide = slides[i];
  if(!slide) return;
  pendingResumeEpisodeId = null;

  if(!slide.episodesLoaded){
    const episodes = await fetchEpisodesForSeries(slide.id);
    slide.episodes = episodes;
    slide.episodesLoaded = true;
  }
  if(!slide.episodes.length) return; // no episodes

  let targetEp = slide.episodes[0];
  let resumeSeconds = 0;
  if(resume && (resume.position_seconds > 0.5 || resume.exactEpisode)){
    const resumeEp = slide.episodes.find(e => e.id === resume.episode_id);
    if(resumeEp){ targetEp = resumeEp; resumeSeconds = resume.position_seconds || 0; }
    // Saved episode gone: start from the first
  }

  setActiveEpisode(slide, targetEp);
  if(resumeSeconds > 0.5 && !slide.locked){
    pendingResumeEpisodeId = slide.episodeId;
    pendingResumeSeconds = resumeSeconds;
  }

  goTo(i);
  feed.classList.add('watching');
  // Re-pick the preload now that we're watching (next episode, not next series)
  if(renderedMediaEpisodeId === slide.episodeId) maintainPreload();
  showChromeOnEntry(); // show the chrome group on entry
  showScreen('feed');
}

// Refresh Continue Watching each time Home opens
navHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
navForYou.addEventListener('click', ()=> showScreen('feed'));
topbarHome.addEventListener('click', ()=> { showScreen('discover'); refreshContinueWatchingMap().then(renderContinueWatchingBar); });
topbarForYou.addEventListener('click', ()=> showScreen('feed'));

navLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });
topbarLibrary.addEventListener('click', ()=> { showScreen('library'); renderLibraryScreen(); });

navProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfile.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });
topbarProfileBtn.addEventListener('click', ()=> { showScreen('profile'); renderProfileScreen(); });

topbarTopUpBtn.addEventListener('click', ()=> openCoinSheet());

// Desktop search takes over the nav row (wiring in discover.js)
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
// Backdrop click closes search (results don't bubble into it)
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
    bgvideo.innerHTML = '<img src="' + escapeHtml(art.src) + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
  } else {
    bgvideo.innerHTML = art.markup;
  }
}

// Scrub/speed controls only when a video is on screen ('has-video')
function setBgHasVideo(hasVideo){
  bgvideo.classList.toggle('has-video', hasVideo);
  videoControls.classList.toggle('has-video', hasVideo);
  if(!hasVideo) scrubDuration.textContent = ''; // no leftover duration
}

// Loader while an episode's video gets ready
function setLoadingArt(){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoaderHtml('pulse') + '</div>';
}

// Tear down the active video (hls.js and the refresh timer too)
function destroyActivePlayback(){
  if(currentPlaybackCtl) currentPlaybackCtl.destroy();
  currentVideoEl = null;
  currentPlaybackCtl = null;
  clearChromeHideTimer(); // no stale auto-hide for the next video
}

// Start loading an episode off-screen in #preloadHost. target: {id, bunnyVideoId, seriesId}.
function preloadVideo(target){
  if(!target || !target.bunnyVideoId || preloadCache[target.id]) return;

  const video = document.createElement('video');
  // Muted while warming; promotePreload applies the sound preference
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  preloadHost.appendChild(video);

  const entry = { video, ctl: null, ready: false };
  preloadCache[target.id] = entry;

  attachEpisodePlayback(video, target.id, () => onEpisodeLoadFailed(target)).then((ctl) => {
    // Preload dropped before setup finished
    if(preloadCache[target.id] !== entry) { if(ctl) ctl.destroy(); return; }
    if(!ctl){
      // Refused: drop the preload, never fall back
      delete preloadCache[target.id];
      video.remove();
      return;
    }
    entry.ctl = ctl;
    video.addEventListener('canplay', function onCanPlay(){
      video.removeEventListener('canplay', onCanPlay);
      entry.ready = true;
      // Already on this episode: promote now
      if(target.id === renderedMediaEpisodeId && currentVideoEl !== video) promotePreload(target);
    }, { once: true });
  });
}

// All retries used: drop the entry (next attempt starts fresh) and show the failure if on screen
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

// Load failed state; retry redoes the whole load
function setFailedToLoadArt(target){
  bgvideo.innerHTML = '<div class="bgvideo-loading">' + narravaLoadFailedHtml('bgvideoRetryBtn') + '</div>';
  document.getElementById('bgvideoRetryBtn').addEventListener('click', () => {
    setLoadingArt();
    preloadVideo(target);
  });
}

// Move a warmed preload into #bgvideo (moving keeps its buffer, no reload)
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

  // Seek a queued resume for this episode
  if(pendingResumeEpisodeId === target.id){
    entry.video.currentTime = pendingResumeSeconds;
    pendingResumeEpisodeId = null;
  }

  // On end: advance like a forward swipe (only if still the current episode)
  entry.video.addEventListener('ended', () => {
    if(target.id !== currentVideoEpisodeId || target.id !== renderedMediaEpisodeId) return;
    advanceForward();
  });

  // Sound on unless muted
  soundAutoplayBlocked = false;
  entry.video.muted = soundMuted;
  updateMuteButton();
  if(feed.classList.contains('paused')) entry.video.pause();
  else playWithSound(entry.video);
}

// Wire the scrub bar to the newly active video
function attachPlaybackControls(video){
  scrubRange.value = video.currentTime || 0;
  // Metadata may already be loaded (preloaded videos)
  scrubRange.max = (video.duration && isFinite(video.duration)) ? video.duration : 0;
  scrubRange.style.setProperty('--scrub-pct', '0%');
  // Blank until the duration is known
  scrubDuration.textContent = videoDurationLabel(video);

  video.addEventListener('loadedmetadata', () => {
    if(currentVideoEl !== video) return;
    scrubRange.max = video.duration || 0;
    scrubDuration.textContent = videoDurationLabel(video);
  });
  // HLS can refine the duration after loadedmetadata
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

  // Chrome shows on promotion; auto-hide armed/cleared by 'playing'/'pause'
  showChrome();
  video.addEventListener('playing', () => {
    if(currentVideoEl !== video) return;
    armChromeHideTimer();
  });
  video.addEventListener('pause', () => {
    if(currentVideoEl !== video) return;
    clearChromeHideTimer();
    showChrome(); // a paused video always shows its controls
  });
}

// Live seeking while dragging
scrubRange.addEventListener('input', () => {
  scrubbing = true;
  if(currentVideoEl) currentVideoEl.currentTime = parseFloat(scrubRange.value);
  const pct = scrubRange.max > 0 ? (scrubRange.value / scrubRange.max) * 100 : 0;
  scrubRange.style.setProperty('--scrub-pct', pct + '%');
});
scrubRange.addEventListener('change', () => { scrubbing = false; });
// Scrub drags must not reach the feed's swipe listeners
['touchstart', 'touchend', 'touchmove', 'pointerdown'].forEach(evt => {
  scrubRange.addEventListener(evt, e => e.stopPropagation());
});

// Next preload: this series' next episode while watching, the next series while browsing
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

// Keep at most one off-screen preload (the next target)
function maintainPreload(){
  const target = nextPreloadTarget();
  if(target && target.id !== renderedMediaEpisodeId) preloadVideo(target);

  const keepIds = [renderedMediaEpisodeId, target ? target.id : null];
  Object.keys(preloadCache).forEach(id => {
    if(keepIds.indexOf(id) === -1) destroyPreloadEntry(id);
  });
}

// Tear down one preload (safe before setup has finished)
function destroyPreloadEntry(episodeId){
  const entry = preloadCache[episodeId];
  if(!entry) return;
  delete preloadCache[episodeId];
  if(entry.ctl) entry.ctl.destroy();
  entry.video.remove();
}

// Static art first, upgraded to the video when ready (never times out).
// Skipped when re-rendering the same episode, so it doesn't restart.
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

  // Loader until the preload is ready and promoted
  setBgHasVideo(false);
  setLoadingArt();
  if(!existing) preloadVideo({ id: s.episodeId, bunnyVideoId: s.bunnyVideoId, seriesId: s.id });
  maintainPreload();
}

// Leaving the feed: stop playback and preloads; reset so coming back re-renders
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

// Save the current position (episode and series ids kept with the video, not looked up)
function saveCurrentFeedProgress(){
  if(!currentVideoEl || !currentVideoEpisodeId || !currentVideoSeriesId) return;
  saveWatchProgress(currentVideoEpisodeId, currentVideoSeriesId, currentVideoEl.currentTime);
}

// Every 15s
setInterval(saveCurrentFeedProgress, 15000);

// Pause for a rewarded ad (ads.js)
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

  // "No series" only once fetchSlides came back empty; loader before that
  if(slidesLoaded && appStartedOffline){
    titleEl.innerHTML = 'You’re offline';
    synopsisEl.innerHTML = '';
    synopsisEl.textContent = 'Downloaded episodes play here offline.';
  } else if(slidesLoaded){
    titleEl.innerHTML = 'No series available right now';
    synopsisEl.innerHTML = '';
    synopsisEl.textContent = 'Check back soon.';
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
  // Only load media while the feed is visible
  if(!feed.classList.contains('screen-hidden')) renderMedia(s);
  epBadge.textContent = s.epBadge;
  titleEl.innerHTML = escapeHtml(s.title).replace('\n','<br>');
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

  // Unlock prompt for the locked episode being looked at
  if(s.locked && s.lockedEpisode){
    unlockBtn.classList.remove('hidden');
    unlockLabel.textContent = 'Unlock Ep ' + s.lockedEpisode.episode_number + ' · 1 Nava Coin';
  } else {
    unlockBtn.classList.add('hidden');
  }

  Array.from(pager.children).forEach((d,i)=>d.classList.toggle('active', i===idx));
  refreshDownloadButtons(); // Download follows the current episode
}

// Like count and liked/saved state, once per slide; ignored if swiped away meanwhile
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

// Series-to-series navigation; always lands in browsing
function goTo(i){
  if(slides.length === 0) return;
  saveCurrentFeedProgress();
  idx = (i + slides.length) % slides.length;
  feed.classList.remove('watching');
  feed.classList.remove('paused');
  render();
}

// Manual navigation cancels a pending resume seek
function clearPendingResume(){
  pendingResumeEpisodeId = null;
}

// Switch the watched series to another of its episodes (locked: shows the unlock prompt)
function goToEpisodeInSlide(s, ep){
  clearPendingResume();
  setActiveEpisode(s, ep);
  render();
}

// Forward swipe or video end: next episode while watching (rolls into the next series), next series while browsing
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

// Backward: stops at episode one while watching
function advanceBackward(){
  const s = slides[idx];
  if(feed.classList.contains('watching') && s && s.episodesLoaded){
    const curPos = s.episodes.findIndex(e => e.id === s.episodeId);
    if(curPos <= 0) return; // already at episode one
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

// Video tap: browsing enters watching; watching reveals chrome or toggles pause
playToggle.addEventListener('click', ()=>{
  if(feed.classList.contains('watching')) return; // handled by the pointer handlers below
  if(slides.length === 0) return;
  // Desktop For You: just enter watching, no episode fetch
  if(window.matchMedia('(min-width: 900px)').matches){
    feed.classList.add('watching');
    showChromeOnEntry();
    navSync();
    return;
  }
  const s = slides[idx];
  enterMobileWatching(idx, continueWatchingMap.get(s.id));
});

// Tap = pause/play, hold = 2x while held, vertical drag = swipe (ignored here)
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
  if(wasHolding && currentVideoEl) currentVideoEl.playbackRate = 1;
  if(moved) return; // a swipe
  if(elapsed > TAP_MAX_MS) return; // a hold isn't a tap

  // Tap while hidden only reveals (and arms the auto-hide); tap while shown toggles pause
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

// Like (signed-out tap opens sign-in); count re-fetched after
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

// Save; totals re-fetched after
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

// Comments sheet
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

// Stop touch/wheel inside sheets reaching the feed's swipe listeners
[commentsSheet, commentsSheetBackdrop, episodeGridSheet, episodeGridBackdrop].forEach(el => {
  ['touchstart', 'touchmove', 'touchend', 'wheel'].forEach(evt => {
    el.addEventListener(evt, e => e.stopPropagation(), { passive: true });
  });
});

// Episode jump grid (from the "EP X · Y" badge); a locked cell opens the unlock prompt
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

// After a share: re-fetch counts for the feed and the Watch page (never +1 locally)
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

// Share (shareSeries, shared-utils.js)
document.getElementById('shareBtn').addEventListener('click', ()=>{
  const btn = document.getElementById('shareBtn');
  btn.classList.add('pulse');
  setTimeout(()=>btn.classList.remove('pulse'), 350);
  if(slides.length === 0) return;
  shareSeries(slides[idx].title, slides[idx].id);
});

// Continue: enter watching (desktop: no episode fetch)
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

// Unlock prompt; plays once the server says it's watchable
function promptUnlockForSlide(s, ep){
  openUnlockPrompt(ep, () => {
    if(slides[idx] !== s || s.episodeId !== ep.id) return; // moved on
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

// Coins/unlocks changed: re-run the lock rule and repaint
function reapplyEpisodeLocks(){
  slides.forEach(s => { if(s.activeEpisode) setActiveEpisode(s, s.activeEpisode); });
  if(slides.length) render();
  if(episodeGridSheet.classList.contains('open') && slides[idx] && slides[idx].episodesLoaded) renderEpisodeGrid(slides[idx]);
}
document.addEventListener('narrava:coins-changed', reapplyEpisodeLocks);

// Resolves once `slides` is filled
let resolveSlidesReady;
const slidesReady = new Promise(resolve => { resolveSlidesReady = resolve; });

async function init(){
  // Maintenance check first, before anything else
  await appSettingsReady;
  // Offline start (offline.js)
  if(appStartedOffline){
    await startOfflineMode();
    return;
  }
  if(appSettings.maintenance_mode_enabled){
    // Let a reset link's popup finish first
    await authRedirectSettled;
    renderMaintenanceMode();
    return;
  }

  // Anonymous sign-in before anything else loads.
  // A reset link's session is already saved by now, so no guest is made.
  await bootstrapAnonymousSession();

  // Coin state loads alongside the slides
  const coinStateReady = refreshCoinState();

  // Fire and forget
  logPageVisit();

  const [fetchedSlides] = await Promise.all([fetchSlides(), refreshContinueWatchingMap(), coinStateReady]);
  slides = fetchedSlides;
  slidesLoaded = true;
  pager.innerHTML = slides.map((_,i)=>'<div class="pdot ' + (i===0?'active':'') + '" data-i="' + i + '"></div>').join('');
  reapplyEpisodeLocks(); // unlocks may load after the slides

  // Welcome bonus (silent unless granted)
  claimWelcomeBonusIfEligible();
  resolveSlidesReady();
  resolveContinueWatchingReady();

  // Shared #series=<id> link, after maintenance and slides
  openDeepLinkedSeries();
}

// Open the series in a shared link, then clear the fragment
function openDeepLinkedSeries(){
  const seriesId = seriesIdFromLocationHash();
  if(!seriesId) return;
  history.replaceState(history.state, '', window.location.pathname + window.location.search); // keep nav.js's state

  const i = slides.findIndex(s => s.id === seriesId);
  if(i === -1){
    showToast('That series isn’t available');
    return;
  }
  openSeriesInFeed(i);
}

// A link pasted into an already-open tab
window.addEventListener('hashchange', () => {
  if(slidesLoaded) openDeepLinkedSeries();
});

init();
