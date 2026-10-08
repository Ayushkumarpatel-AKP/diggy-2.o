/**
 * Golden-D mascot mark, reproduced as inline SVG from
 * `diggy motion/Cheerful Golden D Mascot Logo.png` — gold rounded square, three browser
 * dots, white "D" with a gold face. Vector keeps it crisp at chip and hero sizes and avoids
 * shipping a raster asset into the extension bundle.
 *
 * // INTERFACE FOR INTEGRATION
 * function DiggyLogo(props: { size?: number; dots?: boolean; className?: string }): JSX.Element;
 * function BrowserDots(props: { small?: boolean; className?: string }): JSX.Element;
 * // END INTERFACE FOR INTEGRATION
 */

export interface DiggyLogoProps {
  size?: number;
  /** Show the three browser dots inside the mark (default true, matches the logo). */
  dots?: boolean;
  className?: string;
}

export function DiggyLogo({ size = 30, dots = true, className }: DiggyLogoProps) {
  return (
    <svg
      className={className ? `dg-logo ${className}` : "dg-logo"}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="DIGGY"
    >
      <defs>
        <linearGradient id="dg-logo-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD65A" />
          <stop offset="100%" stopColor="#F5B301" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="92" height="92" rx="26" fill="url(#dg-logo-gold)" />
      {dots ? (
        <g>
          <circle cx="24" cy="22" r="4.2" fill="#FF5F57" />
          <circle cx="36.5" cy="22" r="4.2" fill="#FEBC2E" />
          <circle cx="49" cy="22" r="4.2" fill="#28C840" />
        </g>
      ) : null}
      <path
        d="M33 29h17c13.8 0 25 11.2 25 25s-11.2 25-25 25H33c-2.2 0-4-1.8-4-4V33c0-2.2 1.8-4 4-4Z"
        fill="#FFFFFF"
      />
      <circle cx="47" cy="48" r="4" fill="#F5B301" />
      <circle cx="61" cy="48" r="4" fill="#F5B301" />
      <path
        d="M48 59.5q8 8 16 0"
        fill="none"
        stroke="#F5B301"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M75 46v14" stroke="#FFFFFF" strokeWidth="0" />
    </svg>
  );
}

export interface BrowserDotsProps {
  small?: boolean;
  className?: string;
}

/** The macOS-style three dots — used on page-preview chrome and panel headers. */
export function BrowserDots({ small, className }: BrowserDotsProps) {
  return (
    <span
      className={["dg-dots", small ? "dg-dots--sm" : "", className ?? ""].join(" ").trim()}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}
