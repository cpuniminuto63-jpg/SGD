/** Cabeceras de seguridad aplicadas a toda la app. CSP sin unsafe-inline/unsafe-eval
 * salvo lo que Next.js realmente necesita para hidratar (script-src 'self' + los
 * hashes que Next inserta automáticamente no requieren unsafe-inline en producción
 * con App Router). style-src permite 'unsafe-inline' porque Tailwind/Next generan
 * estilos inline en tiempo de ejecución (spinners, colores por variable) — es un
 * riesgo mucho menor que scripts inline y no hay forma práctica de evitarlo aquí. */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // Clickjacking: frame-ancestors 'none' arriba ya cubre esto en navegadores
  // modernos; X-Frame-Options queda como respaldo para los que no leen CSP.
  { key: "X-Frame-Options", value: "DENY" },
  // Fuerza HTTPS en el navegador durante un año, incluidas subdominios, para que un
  // enlace http:// viejo o un downgrade de TLS momentáneo en el proxy del VPS no
  // sirvan la app sin cifrar. Sin "preload": eso exige enviar el dominio a la lista
  // de precarga de los navegadores, un compromiso aparte que no se ha tomado.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // No hay integraciones cross-origin (OAuth externo, popups de terceros) que
  // dependan de romper el aislamiento de origen -- correcto dejarlo estricto.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
