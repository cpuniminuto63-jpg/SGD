"use client";

import { useEffect, useRef } from "react";

/** Fondo interactivo del login: gradiente con blobs a la deriva, una laptop con
 * documentos que fluyen en bucle (algunos detrás de la tarjeta, algunos delante, para
 * dar profundidad real), y parallax por mouse — cada capa se mueve a distinta
 * velocidad según qué tan "cerca" está, así se siente interactivo en vez de un fondo
 * estático (2026-09-22, a pedido del usuario: fondo centrado, capas por encima/debajo
 * de la tarjeta, interactivo, con mejor calidad visual que la versión anterior). */

const BACK_DOCS = [
  { x: "8%", y: "18%", rot: -14, delay: "0s", depth: 10, color: "var(--brand-secondary)" },
  { x: "88%", y: "16%", rot: 12, delay: "0.9s", depth: 14, color: "var(--status-cumple)" },
  { x: "6%", y: "72%", rot: 10, delay: "1.8s", depth: 8, color: "var(--brand-accent)" },
  { x: "90%", y: "70%", rot: -10, delay: "2.7s", depth: 16, color: "var(--brand-secondary)" },
  { x: "20%", y: "45%", rot: -6, delay: "3.6s", depth: 6, color: "var(--status-cumple)" },
  { x: "78%", y: "45%", rot: 8, delay: "1.3s", depth: 12, color: "var(--brand-accent)" },
];

const FRONT_DOCS = [
  { x: "14%", y: "30%", rot: -18, delay: "0.4s", depth: 34, color: "var(--brand-secondary)" },
  { x: "84%", y: "28%", rot: 16, delay: "2.1s", depth: 40, color: "var(--status-cumple)" },
  { x: "16%", y: "62%", rot: 14, delay: "3.2s", depth: 30, color: "var(--brand-accent)" },
  { x: "82%", y: "64%", rot: -12, delay: "1.5s", depth: 38, color: "var(--brand-secondary)" },
];

function DocIcon({ color, size = 30 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.24} viewBox="0 0 30 37" fill="none">
      <rect x="1" y="1" width="28" height="35" rx="4" fill="white" stroke={color} strokeWidth="2" />
      <rect x="6" y="9" width="18" height="2.2" rx="1.1" fill={color} opacity="0.55" />
      <rect x="6" y="15" width="18" height="2.2" rx="1.1" fill={color} opacity="0.4" />
      <rect x="6" y="21" width="11" height="2.2" rx="1.1" fill={color} opacity="0.4" />
    </svg>
  );
}

export function LoginBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const root = rootRef.current;
        if (!root) return;
        const mx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
        const my = (e.clientY / window.innerHeight - 0.5) * 2;
        root.style.setProperty("--mx", mx.toFixed(3));
        root.style.setProperty("--my", my.toFixed(3));
      });
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="pointer-events-none fixed inset-0 overflow-hidden bg-gradient-to-br from-[#eaf1ff] via-[#f4f8ff] to-[#dde9fc]">
      {/* Blobs de gradiente a la deriva, muy al fondo */}
      <div className="login-blob login-blob-a absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-secondary/25 blur-3xl" />
      <div className="login-blob login-blob-b absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-brand-accent/20 blur-3xl" />
      <div className="login-blob login-blob-c absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-status-cumple/15 blur-3xl" />

      {/* Laptop central, detrás de la tarjeta */}
      <div
        className="login-parallax-layer absolute left-1/2 top-1/2 z-0 opacity-80"
        style={{ "--depth": 4 } as React.CSSProperties}
      >
        <svg width="220" height="160" viewBox="0 0 220 160" fill="none" className="-translate-x-1/2 -translate-y-1/2">
          <rect x="30" y="10" width="160" height="102" rx="8" fill="var(--brand-primary)" />
          <rect x="38" y="18" width="144" height="86" rx="4" fill="#eaf1ff" />
          <rect x="4" y="112" width="212" height="14" rx="5" fill="var(--brand-primary-hover)" />
          <circle className="login-laptop-pulse" cx="110" cy="61" r="30" fill="var(--brand-secondary)" opacity="0.18" />
          <rect x="88" y="45" width="44" height="34" rx="4" fill="white" stroke="var(--brand-secondary)" strokeWidth="2.5" />
          <path d="M98 61l8 8 15-17" stroke="var(--status-cumple)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Documentos detrás de la tarjeta (z-0) */}
      {BACK_DOCS.map((d, i) => (
        <div
          key={`back-${i}`}
          className="login-parallax-layer absolute z-0"
          style={{ left: d.x, top: d.y, "--depth": d.depth } as React.CSSProperties}
        >
          <div className="login-doc" style={{ "--rot": `${d.rot}deg`, animationDelay: d.delay } as React.CSSProperties}>
            <DocIcon color={d.color} />
          </div>
        </div>
      ))}

      {/* Documentos delante de la tarjeta (z-20), solo en las esquinas para no tapar el formulario */}
      {FRONT_DOCS.map((d, i) => (
        <div
          key={`front-${i}`}
          className="login-parallax-layer absolute z-20"
          style={{ left: d.x, top: d.y, "--depth": d.depth } as React.CSSProperties}
        >
          <div className="login-doc" style={{ "--rot": `${d.rot}deg`, animationDelay: d.delay } as React.CSSProperties}>
            <DocIcon color={d.color} size={26} />
          </div>
        </div>
      ))}
    </div>
  );
}
