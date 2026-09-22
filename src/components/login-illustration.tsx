import Image from "next/image";

/** Panel decorativo del login: los 3 logos institucionales fijos arriba, y debajo un
 * computador con documentos que fluyen de/hacia la pantalla en loop — representa el
 * traslado de evidencias documentales que es el corazón de RevisaSGD. Todo hecho con
 * SVG + CSS (sin depender de una imagen plana), para poder animar cada documento por
 * separado (2026-09-22, a pedido del usuario). */

const DOCS = [
  { tx: -170, ty: -120, rot: -18, delay: "0s", color: "var(--brand-secondary)" },
  { tx: 160, ty: -140, rot: 15, delay: "0.6s", color: "var(--status-cumple)" },
  { tx: -190, ty: 40, rot: -8, delay: "1.2s", color: "var(--brand-accent)" },
  { tx: 190, ty: 60, rot: 10, delay: "1.8s", color: "var(--brand-secondary)" },
  { tx: -80, ty: -180, rot: -4, delay: "2.4s", color: "var(--status-cumple)" },
  { tx: 90, ty: -190, rot: 6, delay: "3s", color: "var(--brand-accent)" },
];

export function LoginIllustration() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 overflow-hidden bg-gradient-to-br from-[#eaf1ff] to-[#dbe7fb] px-8 py-12">
      <div className="flex flex-wrap items-center justify-center gap-6">
        <Image src="/logos/computadores-para-educar.png" alt="Computadores para Educar" width={140} height={48} className="h-10 w-auto object-contain" priority />
        <Image src="/logos/tecnologias-para-aprender.png" alt="Tecnologías para Aprender" width={140} height={48} className="h-10 w-auto object-contain" priority />
        <div className="flex h-10 items-center rounded bg-brand-primary px-3">
          <Image src="/logos/uniminuto.png" alt="UNIMINUTO" width={131} height={35} className="h-7 w-auto object-contain" priority />
        </div>
      </div>

      <div className="relative flex h-72 w-full max-w-md items-center justify-center">
        {DOCS.map((d, i) => (
          <svg
            key={i}
            className="login-doc absolute"
            style={
              {
                "--tx": `${d.tx}px`,
                "--ty": `${d.ty}px`,
                "--rot": `${d.rot}deg`,
                animationDelay: d.delay,
              } as React.CSSProperties
            }
            width="34"
            height="42"
            viewBox="0 0 34 42"
            fill="none"
          >
            <rect x="1" y="1" width="32" height="40" rx="4" fill="white" stroke={d.color} strokeWidth="2" />
            <rect x="7" y="10" width="20" height="2.5" rx="1.25" fill={d.color} opacity="0.55" />
            <rect x="7" y="17" width="20" height="2.5" rx="1.25" fill={d.color} opacity="0.4" />
            <rect x="7" y="24" width="13" height="2.5" rx="1.25" fill={d.color} opacity="0.4" />
          </svg>
        ))}

        <svg width="180" height="130" viewBox="0 0 180 130" fill="none" className="relative z-10 drop-shadow-md">
          <rect x="20" y="8" width="140" height="88" rx="7" fill="var(--brand-primary)" />
          <rect x="27" y="15" width="126" height="74" rx="3" fill="#eaf1ff" />
          <rect x="0" y="96" width="180" height="12" rx="4" fill="var(--brand-primary-hover)" />
          <circle className="login-laptop-pulse" cx="90" cy="52" r="26" fill="var(--brand-secondary)" opacity="0.18" />
          <rect x="72" y="38" width="36" height="28" rx="3" fill="white" stroke="var(--brand-secondary)" strokeWidth="2" />
          <path d="M80 50l6 6 12-14" stroke="var(--status-cumple)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p className="max-w-xs text-center text-sm font-medium text-brand-primary/80">
        Seguimiento documental de las 306 sedes en tiempo real
      </p>
    </div>
  );
}
