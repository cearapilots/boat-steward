interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * CEMAPI Fleet Intelligence Hub — logo
 * Lancha de frente dentro de um círculo com trilhas de circuito e ondas.
 * Cores: navy #1B2A4A + teal #2ABFBF
 */
export function BrandLogo({ size = 32, className }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CEMAPI Fleet Intelligence Hub"
    >
      {/* Círculo (anel parcial) */}
      <path
        d="M10 32 A22 22 0 0 1 32 10"
        stroke="#2ABFBF"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M54 32 A22 22 0 0 0 38 11"
        stroke="#1B2A4A"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Trilhas de circuito (esquerda) */}
      <g stroke="#2ABFBF" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M16 24 L20 24 L22 22" />
        <path d="M14 30 L19 30" />
        <circle cx="13" cy="30" r="1.2" fill="#2ABFBF" />
        <circle cx="22" cy="22" r="1.2" fill="#2ABFBF" />
      </g>
      {/* Trilhas de circuito (direita) */}
      <g stroke="#1B2A4A" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M48 24 L44 24 L42 22" />
        <path d="M50 30 L45 30" />
        <circle cx="51" cy="30" r="1.2" fill="#1B2A4A" />
        <circle cx="42" cy="22" r="1.2" fill="#1B2A4A" />
      </g>
      {/* Antena topo */}
      <line x1="32" y1="14" x2="32" y2="20" stroke="#2ABFBF" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="32" cy="13" r="1.3" fill="#2ABFBF" />

      {/* Cabine */}
      <path
        d="M26 28 L38 28 L36 34 L28 34 Z"
        fill="#1B2A4A"
      />
      {/* Casco */}
      <path
        d="M18 38 L46 38 L40 46 L24 46 Z"
        fill="#1B2A4A"
      />
      {/* Vela / triângulo de detalhe teal */}
      <path d="M32 34 L34 44 L31 44 Z" fill="#2ABFBF" />

      {/* Ondas */}
      <path
        d="M8 50 Q20 46 32 50 T56 50"
        stroke="#2ABFBF"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M10 55 Q22 51 32 55 T54 55"
        stroke="#1B2A4A"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
