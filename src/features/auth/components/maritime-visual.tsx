/**
 * Decorative operations-console scene for the sign-in page (pure SVG/CSS, no external
 * images): sea chart graticule, islands, a shipping lane, a subsea pipeline, an AIS radar
 * sweep and vessels with safety rings. Hidden from assistive technology.
 */

interface Vessel {
  x: number;
  y: number;
  heading: number;
  color: string;
  ring?: string;
  label?: string;
  detail?: string;
  trail?: string;
}

const VESSELS: Vessel[] = [
  {
    x: 520,
    y: 352,
    heading: 248,
    color: '#f5b301',
    ring: '#ef4444',
    label: 'MMSI 525005223',
    detail: 'EWS · 420 m',
    trail: 'M640 300 Q 600 320 560 338 T 520 352',
  },
  { x: 300, y: 520, heading: 72, color: '#38bdf8', trail: 'M170 560 Q 220 545 260 532 T 300 520' },
  {
    x: 610,
    y: 560,
    heading: 300,
    color: '#f5b301',
    ring: '#d946ef',
    label: 'CPA 0.4 nm',
    detail: 'TCPA 6 min',
  },
  { x: 655, y: 600, heading: 120, color: '#a3e635', ring: '#d946ef' },
  { x: 230, y: 300, heading: 160, color: '#38bdf8' },
  { x: 420, y: 690, heading: 20, color: '#fb923c', trail: 'M400 780 Q 405 750 412 720 T 420 690' },
  { x: 700, y: 240, heading: 210, color: '#38bdf8' },
  { x: 140, y: 420, heading: 95, color: '#a3e635' },
  { x: 360, y: 210, heading: 135, color: '#f5b301' },
];

function VesselGlyph({ vessel }: { vessel: Vessel }) {
  return (
    <g>
      {vessel.trail && (
        <path
          d={vessel.trail}
          fill="none"
          stroke={vessel.color}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeDasharray="2 5"
        />
      )}
      {vessel.ring && (
        <>
          <circle
            cx={vessel.x}
            cy={vessel.y}
            r="16"
            fill={vessel.ring}
            fillOpacity="0.12"
            stroke={vessel.ring}
            strokeWidth="1.5"
          />
          <circle
            cx={vessel.x}
            cy={vessel.y}
            r="16"
            fill="none"
            stroke={vessel.ring}
            strokeWidth="1"
            className="animate-pulse-ring"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          />
        </>
      )}
      <path
        d="M0 -10 L6.5 8 L0 4.5 L-6.5 8 Z"
        fill={vessel.color}
        stroke="#020617"
        strokeWidth="0.8"
        transform={`translate(${vessel.x} ${vessel.y}) rotate(${vessel.heading})`}
      />
      {vessel.label && (
        <g transform={`translate(${vessel.x + 22} ${vessel.y - 26})`}>
          <rect
            width="118"
            height="34"
            rx="6"
            fill="#020617"
            fillOpacity="0.72"
            stroke="#7dd3fc"
            strokeOpacity="0.25"
          />
          <text
            x="9"
            y="14"
            fill="#e0f2fe"
            fontSize="10.5"
            fontFamily="JetBrains Mono Variable, monospace"
          >
            {vessel.label}
          </text>
          {vessel.detail && (
            <text
              x="9"
              y="27"
              fill={vessel.ring ?? '#94a3b8'}
              fontSize="10"
              fontFamily="JetBrains Mono Variable, monospace"
            >
              {vessel.detail}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

export function MaritimeVisual({ className }: { className?: string }) {
  const cx = 470;
  const cy = 450;
  return (
    <svg
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="mv-sea" cx="58%" cy="48%" r="75%">
          <stop offset="0%" stopColor="#0c3550" />
          <stop offset="45%" stopColor="#082238" />
          <stop offset="100%" stopColor="#030a14" />
        </radialGradient>
        <linearGradient id="mv-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#12344a" />
          <stop offset="100%" stopColor="#0b2536" />
        </linearGradient>
        <radialGradient
          id="mv-sweep"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform={`translate(${cx} ${cy}) scale(330)`}
        >
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <pattern id="mv-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="#7dd3fc" strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="800" height="900" fill="url(#mv-sea)" />
      <rect width="800" height="900" fill="url(#mv-grid)" />

      {/* Islands (stylized Riau archipelago) */}
      <g fill="url(#mv-land)" stroke="#2b6b84" strokeOpacity="0.55" strokeWidth="1.2">
        <path d="M555 95c40-12 92 4 118 30 22 22 18 58-8 72-30 16-52 4-84 14-34 10-64 2-74-24-12-32 12-80 48-92z" />
        <path d="M86 640c26-30 78-38 110-22 30 15 30 48 12 70-20 24-58 22-84 36-30 16-62 6-66-20-3-22 10-44 28-64z" />
        <path d="M690 700c22-10 60-4 74 16 12 18 4 44-18 52-24 10-52 2-64-14-12-18-12-44 8-54z" />
        <path d="M250 110c18-10 44-6 54 8 9 14 2 32-14 38-18 6-38 0-46-12-8-12-6-28 6-34z" />
      </g>

      {/* Traffic separation scheme lane */}
      <path
        d="M-20 420 C 180 380 360 400 520 470 S 760 560 840 540"
        fill="none"
        stroke="#38bdf8"
        strokeOpacity="0.18"
        strokeWidth="46"
      />
      <path
        d="M-20 420 C 180 380 360 400 520 470 S 760 560 840 540"
        fill="none"
        stroke="#7dd3fc"
        strokeOpacity="0.35"
        strokeWidth="1"
        strokeDasharray="10 10"
      />

      {/* Subsea pipeline with EWS buffer */}
      <path
        d="M470 -10 L520 230 L505 420 L560 640 L540 910"
        fill="none"
        stroke="#f59e0b"
        strokeOpacity="0.12"
        strokeWidth="30"
      />
      <path
        d="M470 -10 L520 230 L505 420 L560 640 L540 910"
        fill="none"
        stroke="#fbbf24"
        strokeOpacity="0.75"
        strokeWidth="1.6"
        strokeDasharray="14 6 2 6"
      />
      {[
        [520, 230],
        [505, 420],
        [560, 640],
      ].map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={(x ?? 0) - 3.5}
          y={(y ?? 0) - 3.5}
          width="7"
          height="7"
          fill="#fbbf24"
          transform={`rotate(45 ${x} ${y})`}
        />
      ))}

      {/* AIS radar */}
      <g fill="none" stroke="#7dd3fc">
        {[90, 180, 270, 360].map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} strokeOpacity={0.16} strokeWidth="1" />
        ))}
        <path
          d={`M${cx - 380} ${cy}H${cx + 380}M${cx} ${cy - 380}V${cy + 380}`}
          strokeOpacity="0.1"
        />
      </g>
      <g
        className="animate-[spin_9s_linear_infinite]"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <path
          d={`M${cx} ${cy} L${cx + 330} ${cy} A330 330 0 0 0 ${cx + 233} ${cy - 233} Z`}
          fill="url(#mv-sweep)"
        />
        <line
          x1={cx}
          y1={cy}
          x2={cx + 330}
          y2={cy}
          stroke="#67e8f9"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
      </g>
      <circle cx={cx} cy={cy} r="4" fill="#67e8f9" />

      {VESSELS.map((vessel) => (
        <VesselGlyph key={`${vessel.x}-${vessel.y}`} vessel={vessel} />
      ))}

      {/* Scale bar and coordinates */}
      <g
        fontFamily="JetBrains Mono Variable, monospace"
        fontSize="10"
        fill="#7dd3fc"
        fillOpacity="0.55"
        textAnchor="end"
      >
        <text x="760" y="60">
          01°08′35″N 103°51′23″E
        </text>
        <text x="760" y="76">
          SINGAPORE STRAIT · ZOOM 9
        </text>
      </g>
    </svg>
  );
}
