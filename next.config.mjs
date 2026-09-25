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
