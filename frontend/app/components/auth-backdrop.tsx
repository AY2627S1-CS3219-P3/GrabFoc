/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Decorative campus-map backdrop for the sign-in, sign-up, verify and recovery screens: streets, buildings, dotted delivery routes, pickup/drop-off pins and couriers riding the routes; static when reduced motion is requested.
Author review: Pending review by Jie Yang.
*/
// AI-generated (pending review by Jie Yang)
"use client";

import { useSyncExternalStore } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const reducedSnapshot = () => window.matchMedia(REDUCED).matches;
const serverSnapshot = () => true; // render the static map on the server, animate after hydration

// Streets double as delivery routes. `rest` is where the courier sits when motion is reduced.
const ROUTES = [
  { id: "foc-route-a", color: "var(--orange)", dur: "16s", begin: "0s", rest: [620, 400],
    d: "M-40 650 C 240 600, 360 420, 620 400 S 1000 470, 1180 300 S 1400 120, 1500 100" },
  { id: "foc-route-b", color: "var(--blue)", dur: "13s", begin: "-4s", rest: [300, 520],
    d: "M170 -40 C 220 200, 140 360, 300 520 S 520 760, 470 960" },
  { id: "foc-route-c", color: "var(--ink)", dur: "15s", begin: "-9s", rest: [900, 180],
    d: "M540 -40 C 600 140, 760 200, 900 180 S 1160 120, 1320 -40" },
  { id: "foc-route-d", color: "var(--orange)", dur: "12s", begin: "-2s", rest: [1160, 640],
    d: "M880 960 C 870 770, 1040 690, 1160 640 S 1380 560, 1500 610" },
] as const;

const SIDE_STREETS = [
  "M-40 240 C 200 230, 380 260, 560 300 S 900 360, 1500 330",
  "M1000 -40 C 1010 200, 980 420, 1060 560 S 1100 800, 1060 960",
  "M-40 820 C 300 800, 600 840, 900 790",
  "M700 960 C 720 800, 640 640, 700 500",
];

const BUILDINGS: [number, number, number, number][] = [
  [60, 60, 120, 80], [230, 90, 90, 110], [380, 40, 140, 90], [700, 40, 110, 70], [1080, 180, 120, 90],
  [1250, 230, 150, 80], [1340, 380, 80, 120], [60, 330, 150, 100], [400, 330, 120, 60], [760, 520, 160, 100],
  [1200, 440, 110, 110], [80, 720, 120, 80], [560, 580, 90, 120], [960, 760, 150, 90], [1250, 720, 140, 110],
  [340, 700, 100, 120],
];
const PARKS: [number, number, number, number][] = [[820, 300, 180, 110], [40, 480, 160, 150], [1180, 820, 230, 100]];
const PLACES: [number, number, string][] = [[1180, 268, "COM3"], [610, 372, "Central Library"], [900, 152, "UTown"],
  [300, 492, "Science"], [1160, 612, "PGP"], [470, 640, "Engineering"]];

export function AuthBackdrop() {
  const reduced = useSyncExternalStore(subscribe, reducedSnapshot, serverSnapshot);
  return <svg className="auth-backdrop" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      {ROUTES.map((route) => <path key={route.id} id={route.id} d={route.d} />)}
      <radialGradient id="foc-backdrop-calm" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--paper)" stopOpacity=".92" />
        <stop offset="55%" stopColor="var(--paper)" stopOpacity=".55" />
        <stop offset="100%" stopColor="var(--paper)" stopOpacity="0" />
      </radialGradient>
    </defs>

    {PARKS.map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="28" className="auth-backdrop-park" />)}
    {BUILDINGS.map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="10" className="auth-backdrop-building" />)}

    {SIDE_STREETS.map((d) => <path key={d} d={d} className="auth-backdrop-street auth-backdrop-street--side" />)}
    {ROUTES.map((route) => <use key={route.id} href={`#${route.id}`} className="auth-backdrop-street" />)}

    {ROUTES.map((route) => <use key={route.id} href={`#${route.id}`} className="auth-backdrop-route" style={{ stroke: route.color }} />)}

    {/* Calms the middle behind the card; pins and couriers stay on top at full strength. */}
    <rect className="auth-backdrop-calm" width="1440" height="900" fill="url(#foc-backdrop-calm)" />

    {PLACES.map(([x, y, label]) => <text key={label} x={x} y={y - 22} className="auth-backdrop-label" textAnchor="middle">{label}</text>)}
    {PLACES.map(([x, y], index) => index % 2 === 0
      ? <circle key={`${x}-${y}`} cx={x} cy={y} r="9" className="auth-backdrop-pickup" />
      : <rect key={`${x}-${y}`} x={x - 8} y={y - 8} width="16" height="16" rx="4" className="auth-backdrop-drop" />)}

    {ROUTES.map((route) => <g key={route.id} transform={reduced ? `translate(${route.rest[0]} ${route.rest[1]})` : undefined}>
      {!reduced && <animateMotion dur={route.dur} begin={route.begin} repeatCount="indefinite" rotate="0">
        <mpath href={`#${route.id}`} />
      </animateMotion>}
      <circle r="21" fill={route.color} opacity=".18" className={reduced ? undefined : "auth-backdrop-halo"} />
      <circle r="15" fill={route.color} />
      <g transform="translate(-9 -9) scale(.75)" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="16.5" r="3.5" /><circle cx="18" cy="16.5" r="3.5" />
        <path d="M6 16.5 9.5 9h5l3.5 7.5M9.5 9 12 16.5h-6M14 6h2.5" />
      </g>
    </g>)}

  </svg>;
}
