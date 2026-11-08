/*
AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-08
Scope: Inline SVG icons and illustrations for the redesign: route logo, pins, coin, courier bike, route preview, dispatched-order and empty-state art.
Author review: Pending review by Jie Yang.
*/
// AI-generated (pending review by Jie Yang)
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>{children}</svg>;
}

/** The FoC mark: a pickup dot and a drop-off square joined by a route. */
export function RouteMark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="9" fill="var(--ink)" />
    <path d="M9 22c0-6 14-6 14-12" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 4.4" />
    <circle cx="9" cy="22.5" r="3.4" fill="var(--accent)" />
    <rect x="19.6" y="6.6" width="6.8" height="6.8" rx="1.6" fill="#fff" />
  </svg>;
}

export const PinIcon = (props: IconProps) => <Svg {...props}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></Svg>;
export const FlagIcon = (props: IconProps) => <Svg {...props}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></Svg>;
export const ClockIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const BuildingIcon = (props: IconProps) => <Svg {...props}><path d="M4 21V5l8-2v18" /><path d="M12 8h8v13" /><path d="M2.5 21h19M7.5 8v.01M7.5 12v.01M7.5 16v.01M16 12v.01M16 16v.01" /></Svg>;
export const PlusIcon = (props: IconProps) => <Svg {...props}><path d="M12 5v14M5 12h14" /></Svg>;
export const EditIcon = (props: IconProps) => <Svg {...props}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></Svg>;
export const CloseIcon = (props: IconProps) => <Svg {...props}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const SearchIcon = (props: IconProps) => <Svg {...props}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
export const BagIcon = (props: IconProps) => <Svg {...props}><path d="M5 8h14l-1.2 12H6.2L5 8Z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></Svg>;
export const BikeIcon = (props: IconProps) => <Svg {...props}><circle cx="6" cy="16.5" r="3.5" /><circle cx="18" cy="16.5" r="3.5" /><path d="M6 16.5 9.5 9h5l3.5 7.5M9.5 9 12 16.5h-6M14 6h2.5" /></Svg>;

export function CoinIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="9" fill="var(--gold-bright)" />
    <circle cx="10" cy="10" r="6.3" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
    <path d="M10 6.6v6.8M8 8.3c0-.9.9-1.4 2-1.4s2 .5 2 1.3c0 1.8-4 1-4 2.9 0 .8.9 1.4 2 1.4s2-.5 2-1.4" fill="none" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
  </svg>;
}

/** Pickup → drop-off preview used in the order form. The courier dot travels once both ends are chosen. */
export function RoutePreview({ from, to }: { from?: string; to?: string }) {
  const ready = Boolean(from && to);
  return <div className={`route-preview${ready ? " is-ready" : ""}`} aria-hidden="true">
    <div className="route-preview-end"><span className="route-node route-node--pickup"><PinIcon size={16} /></span><span>{from || "Pickup"}</span></div>
    <div className="route-preview-track"><span className="route-preview-courier"><BikeIcon size={15} /></span></div>
    <div className="route-preview-end route-preview-end--drop"><span className="route-node route-node--drop"><FlagIcon size={16} /></span><span>{to || "Drop-off"}</span></div>
  </div>;
}

/** Played once when an order is created. */
export function DispatchedArt() {
  return <svg className="dispatched-art" viewBox="0 0 160 110" aria-hidden="true" focusable="false">
    <path className="dispatched-trail" d="M12 72h26M4 58h30M16 86h20" />
    <g className="dispatched-parcel">
      <path d="M52 36 88 22l36 14v40l-36 14-36-14V36Z" fill="var(--gold-wash)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M52 36l36 14 36-14M88 50v40" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m70 29 36 14" stroke="var(--accent)" strokeWidth="5" />
    </g>
    <g className="dispatched-check">
      <circle cx="126" cy="80" r="17" fill="var(--green)" />
      <path d="m118 80 6 6 11-12" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}

/** Empty states: an open tote for orders, a dropped pin for locations. */
export function EmptyArt({ kind }: { kind: "orders" | "locations" }) {
  return <svg className="empty-art" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
    <ellipse cx="48" cy="64" rx="30" ry="4" fill="var(--line)" />
    {kind === "orders" ? <>
      <path d="M26 26h44l-4 34H30l-4-34Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M38 30v-8a10 10 0 0 1 20 0v8" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M34 44h28" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 6" />
    </> : <>
      <path d="M48 58S30 42 30 28a18 18 0 1 1 36 0c0 14-18 30-18 30Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.2" />
      <circle cx="48" cy="28" r="6" fill="var(--accent)" />
    </>}
  </svg>;
}
