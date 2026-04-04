interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export function Logo({ size = 32, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icon mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle */}
        <circle cx="20" cy="20" r="20" fill="var(--accent)" fillOpacity="0.15" />

        {/* Chart bars (rising) */}
        <rect x="7" y="26" width="5" height="7" rx="1.5" fill="var(--accent)" fillOpacity="0.5" />
        <rect x="14" y="20" width="5" height="13" rx="1.5" fill="var(--accent)" fillOpacity="0.7" />
        <rect x="21" y="14" width="5" height="19" rx="1.5" fill="var(--accent)" />

        {/* Brain/intelligence arc at top right */}
        <circle cx="30" cy="12" r="6" fill="var(--accent)" fillOpacity="0.15" />
        <path
          d="M27 12c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.1-.59 2.06-1.47 2.58L31 16h-2l-.53-1.42A2.99 2.99 0 0127 12z"
          fill="var(--accent)"
        />
        <line x1="30" y1="16" x2="30" y2="17.5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {showText && (
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-text-primary" style={{ fontSize: size * 0.42 }}>
            Investidor
          </span>
          <span className="font-semibold text-accent" style={{ fontSize: size * 0.37 }}>
            Inteligente
          </span>
        </div>
      )}
    </div>
  )
}
