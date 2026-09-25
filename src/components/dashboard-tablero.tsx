"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { REVIEW_STATUS_META } from "@/lib/review-status";

type EstadoKey = "ps" | "nd" | "pr" | "vc";

interface TableroSede {
  id: string;
  dane: string;
  sede: string;
  inst: string;
  dep: string;
  mun: string;
  lin: string;
  coo: string;
  men: string;
  rev: string;
  t: number;
  pr: number;
  nd: number;
  ps: number;
  vc: number;
  c: number;
}

/** [institutionId, idxDocumento, estado, idxTexto, idxComentadoPor, fechaISO | null] */
type Comentario = [string, number, EstadoKey, number, number, string | null];

interface TableroData {
  corte: string;
  rows: TableroSede[];
  cd: string[];
  ct: string[];
  cw: string[];
  com: Comentario[];
  checks: { pendientesSedes: number; filasComentarios: number; ok: boolean };
}

const ESTADOS: { k: EstadoKey | "c"; label: string; colorVar: string }[] = [
  { k: "c", label: REVIEW_STATUS_META.cumple.label, colorVar: REVIEW_STATUS_META.cumple.colorVar },
  { k: "ps", label: REVIEW_STATUS_META.pendiente_subsanar.label, colorVar: REVIEW_STATUS_META.pendiente_subsanar.colorVar },
  { k: "nd", label: REVIEW_STATUS_META.no_esta.label, colorVar: REVIEW_STATUS_META.no_esta.colorVar },
  { k: "pr", label: REVIEW_STATUS_META.pendiente_revision.label, colorVar: REVIEW_STATUS_META.pendiente_revision.colorVar },
  { k: "vc", label: REVIEW_STATUS_META.volver_a_campo.label, colorVar: REVIEW_STATUS_META.volver_a_campo.colorVar },
];
const ESTADO_META = Object.fromEntries(ESTADOS.map((s) => [s.k, s])) as Record<EstadoKey | "c", (typeof ESTADOS)[number]>;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const fmt = (n: number) => n.toLocaleString("es-CO");
// con pendientes nunca 100 %
function pct(c: number, t: number): number {
  if (!t) return 0;
  let p = Math.floor((c / t) * 100);
  if (c < t && p >= 100) p = 99;
  return p;
}
function pillClass(p: number): string {
  if (p === 100) return "bg-status-cumple/15 text-status-cumple";
  if (p >= 80) return "bg-status-subsanar/15 text-status-subsanar";
  return "bg-status-no-esta/15 text-status-no-esta";
}

interface Agg {
  t: number;
  c: number;
  ps: number;
  nd: number;
  pr: number;
  vc: number;
  n: number;
  ok: number;
  p: number;
}
function agg(rows: TableroSede[]): Agg {
  const a: Agg = { t: 0, c: 0, ps: 0, nd: 0, pr: 0, vc: 0, n: rows.length, ok: 0, p: 0 };
  for (const r of rows) {
    a.t += r.t;
    a.c += r.c;
    a.ps += r.ps;
    a.nd += r.nd;
    a.pr += r.pr;
    a.vc += r.vc;
    if (r.c === r.t) a.ok++;
  }
  a.p = a.t - a.c;
  return a;
}
function groupBy<T, K>(rows: T[], f: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = f(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function MiniBar({ a }: { a: Agg }) {
  if (!a.t) return <div className="flex h-3.5 w-full overflow-hidden rounded bg-surface-muted" />;
  return (
    <div className="flex h-3.5 w-full overflow-hidden rounded bg-surface-muted">
      {ESTADOS.map((s) =>
        a[s.k as keyof Agg] ? (
          <span
            key={s.k}
            style={{ width: `${((a[s.k as keyof Agg] as number) / a.t) * 100}%`, background: `var(${s.colorVar})` }}
            title={`${s.label}: ${fmt(a[s.k as keyof Agg] as number)}`}
          />
        ) : null
      )}
    </div>
  );
}

function ClickRow({
  label,
  sublabel,
  a,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  a: Agg;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-[minmax(90px,160px)_1fr_44px] items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-surface-muted ${
        active ? "bg-brand-primary/5" : ""
      }`}
    >
      <div className="min-w-0 overflow-hidden">
        <p className={`truncate text-sm font-medium ${active ? "text-brand-primary" : "text-foreground"}`} title={label}>
          {label}
        </p>
        <p className="truncate text-[11px] text-foreground-muted">{sublabel}</p>
      </div>
      <MiniBar a={a} />
      <p className="text-right font-mono text-sm font-semibold text-foreground">{pct(a.c, a.t)}%</p>
    </button>
  );
}

function HBar({ label, value, max, prefix }: { label: string; value: number; max: number; prefix?: string }) {
  return (
    <div className="grid grid-cols-[1fr_48px] items-center gap-2.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate">
          {prefix ? <span className="mr-1.5 text-[11px] font-semibold text-foreground-muted">{prefix}</span> : null}
          {label}
        </span>
      </div>
      <div className="col-span-2 h-2 overflow-hidden rounded bg-surface-muted">
        <div className="h-full rounded bg-brand-primary" style={{ width: max ? `${(value / max) * 100}%` : 0 }} />
      </div>
      <span className="col-span-2 -mt-1 text-right font-mono text-xs text-foreground-muted">{fmt(value)}</span>
    </div>
  );
}

function Kpi({ label, value, hint, hero, color }: { label: string; value: string; hint?: string; hero?: boolean; color?: string }) {
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${hero ? "border-transparent text-white" : "border-border bg-surface"}`}
      style={hero ? { background: color ?? "var(--color-brand-primary)" } : undefined}
    >
      <p className={`text-xs font-medium ${hero ? "text-white/85" : "text-foreground-muted"}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className={`mt-0.5 text-xs ${hero ? "text-white/75" : "text-foreground-muted"}`}>{hint}</p> : null}
    </div>
  );
}

export function DashboardTablero() {
  const [data, setData] = useState<TableroData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    fetch("/api/tablero", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error && e.name === "AbortError" ? "La carga tardó demasiado. Intenta recargar la página." : e instanceof Error ? e.message : "Error desconocido";
        setError(msg);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  const [coo, setCoo] = useState("");
  const [dep, setDep] = useState("");
  const [lin, setLin] = useState("");
  const [men, setMen] = useState("");
  const [estado, setEstado] = useState<"" | "ok" | "pend" | "crit">("");
  const [q, setQ] = useState("");
  const [docFocus, setDocFocus] = useState<EstadoKey | "">("");

  const [cEst, setCEst] = useState<EstadoKey | "">("");
  const [cWho, setCWho] = useState("");
  const [cAp, setCAp] = useState("");
  const [cQ, setCQ] = useState("");
  const [comLim, setComLim] = useState(30);
  const [menLim, setMenLim] = useState(15);
  const [sedLim, setSedLim] = useState(25);
  const [openSede, setOpenSede] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const coordinadores = useMemo(() => [...new Set(rows.map((r) => r.coo).filter(Boolean))].sort(), [rows]);
  const departamentos = useMemo(() => [...new Set(rows.map((r) => r.dep))].sort(), [rows]);
  const mentores = useMemo(() => [...new Set(rows.map((r) => r.men))].sort((a, b) => a.localeCompare(b, "es")), [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (coo && r.coo !== coo) return false;
      if (dep && r.dep !== dep) return false;
      if (lin && r.lin !== lin) return false;
      if (men && r.men !== men) return false;
      if (estado === "ok" && r.c !== r.t) return false;
      if (estado === "pend" && r.c === r.t) return false;
      if (estado === "crit" && r.t > 0 && r.c / r.t >= 0.5) return false;
      if (query && !`${r.sede} ${r.inst} ${r.dane} ${r.men} ${r.mun} ${r.rev}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [rows, coo, dep, lin, men, estado, q]);

  const rs0 = filtered;
  const A0 = useMemo(() => agg(rs0), [rs0]);
  const rs = useMemo(() => (docFocus ? rs0.filter((r) => r[docFocus] > 0) : rs0), [rs0, docFocus]);
  const A = useMemo(() => agg(rs), [rs]);

  const byCoo = useMemo(
    () => [...groupBy(rs, (r) => r.coo)].map(([k, g]) => [k, agg(g)] as const).sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t),
    [rs]
  );
  const byLin = useMemo(
    () => [...groupBy(rs, (r) => r.lin)].map(([k, g]) => [k, agg(g)] as const).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    [rs]
  );
  const byDep = useMemo(
    () =>
      [...groupBy(rs, (r) => r.dep)]
        .map(([k, g]) => [k, agg(g)] as const)
        .sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t || b[1].p - a[1].p),
    [rs]
  );

  const byDane = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const comByInst = useMemo(() => {
    const m = new Map<string, Comentario[]>();
    for (const c of data?.com ?? []) {
      const arr = m.get(c[0]);
      if (arr) arr.push(c);
      else m.set(c[0], [c]);
    }
    return m;
  }, [data]);

  const { phs, dcs } = useMemo(() => {
    const ph = new Map<string, number>();
    const dc = new Map<number, number>();
    const cd = data?.cd ?? [];
    for (const r of rs) {
      const seenP = new Set<string>();
      const seenD = new Set<number>();
      for (const c of comByInst.get(r.id) ?? []) {
        if (docFocus && c[2] !== docFocus) continue;
        const p = cd[c[1]].split("|")[0];
        if (!seenP.has(p)) {
          seenP.add(p);
          ph.set(p, (ph.get(p) ?? 0) + 1);
        }
        if (!seenD.has(c[1])) {
          seenD.add(c[1]);
          dc.set(c[1], (dc.get(c[1]) ?? 0) + 1);
        }
      }
    }
    const phs = [...ph].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, v]) => ({ pre: p.slice(0, 2), l: p.replace(/^\d{2} /, ""), v }));
    const dcs = [...dc]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([i, v]) => {
        const [p, doc] = cd[i].split("|");
        return { pre: p, l: doc, v };
      });
    return { phs, dcs };
  }, [rs, comByInst, docFocus, data]);

  const comBase = useMemo(() => {
    const ids = new Set(rs.map((r) => r.id));
    return (data?.com ?? []).filter((c) => ids.has(c[0]));
  }, [rs, data]);

  const efectivoEst = docFocus || cEst;
  const comList = useMemo(() => {
    const query = cQ.trim().toLowerCase();
    const ct = data?.ct ?? [];
    const cd = data?.cd ?? [];
    const cw = data?.cw ?? [];
    return comBase.filter((c) => {
      if (efectivoEst && c[2] !== efectivoEst) return false;
      if (cWho && cw[c[4]] !== cWho) return false;
      if (cAp && !cd[c[1]].startsWith(`${cAp}|`)) return false;
      if (query && !ct[c[3]].toLowerCase().includes(query)) return false;
      return true;
    });
  }, [comBase, efectivoEst, cWho, cAp, cQ, data]);

  const apartados = useMemo(() => [...new Set((data?.cd ?? []).map((d) => d.split("|")[0]))].sort(), [data]);
  const revisoresComentario = useMemo(() => [...new Set(data?.cw ?? [])].sort((a, b) => a.localeCompare(b, "es")), [data]);

  const CORTE = data ? new Date(`${data.corte}T23:59`) : new Date();
  const age = (d: string | null) => (d ? Math.max(0, Math.floor((CORTE.getTime() - new Date(d).getTime()) / 864e5)) : null);
  const fdt = (d: string) => {
    const x = new Date(d);
    return `${x.getDate()} ${MESES[x.getMonth()]} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  };

  const AGE_BUCKETS = [
    { l: "0–7 días", t: (n: number | null) => n !== null && n <= 7, color: "var(--color-status-cumple)" },
    { l: "8–14 días", t: (n: number | null) => n !== null && n >= 8 && n <= 14, color: "var(--color-status-pendiente)" },
    { l: "15–21 días", t: (n: number | null) => n !== null && n >= 15 && n <= 21, color: "var(--color-status-subsanar)" },
    { l: "Más de 21 días", t: (n: number | null) => n !== null && n > 21, color: "var(--color-status-no-esta)" },
    { l: "Sin fecha (nunca revisado)", t: (n: number | null) => n === null, color: "var(--color-foreground-muted)" },
  ];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- age() solo depende de CORTE, que ya depende de data
  const ages = useMemo(() => comList.map((c) => age(c[5])), [comList, data]);
  const ageAgg = AGE_BUCKETS.map((b) => ({ ...b, v: ages.filter(b.t).length }));
  const ageMax = Math.max(1, ...ageAgg.map((a) => a.v));

  const quienStats = useMemo(() => {
    const cw = data?.cw ?? [];
    const cd = data?.cd ?? [];
    const wc = new Map<string, number>();
    for (const c of comBase) {
      if (efectivoEst && c[2] !== efectivoEst) continue;
      if (cAp && !cd[c[1]].startsWith(`${cAp}|`)) continue;
      wc.set(cw[c[4]], (wc.get(cw[c[4]]) ?? 0) + 1);
    }
    return [...wc].sort((a, b) => b[1] - a[1]);
  }, [comBase, efectivoEst, cAp, data]);
  const quienMax = Math.max(1, ...quienStats.map((w) => w[1]));

  const mens = useMemo(() => groupBy(rs, (r) => r.men), [rs]);
  const menPend = [...mens.values()].filter((g) => g.some((r) => r.c < r.t)).length;

  const menList = useMemo(
    () =>
      [...mens]
        .map(([k, g]) => {
          const a = agg(g);
          return { name: k, coo: [...new Set(g.map((r) => r.coo))].join(", "), a, pct: pct(a.c, a.t) };
        })
        .sort((a, b) => b.a.p - a.a.p),
    [mens]
  );

  const sedList = useMemo(() => rs.slice().sort((a, b) => (b.t - b.c) - (a.t - a.c)), [rs]);

  const chips: string[] = [];
  if (coo) chips.push(coo);
  if (dep) chips.push(dep);
  if (lin) chips.push(lin);
  if (men) chips.push(men);
  if (estado) chips.push(estado === "ok" ? "Al día" : estado === "pend" ? "Con pendientes" : "Críticas");
  if (docFocus) chips.push(`Solo: ${ESTADO_META[docFocus].label}`);
  if (q) chips.push(`"${q}"`);

  function limpiarFiltros() {
    setCoo("");
    setDep("");
    setLin("");
    setMen("");
    setEstado("");
    setQ("");
    setDocFocus("");
    setCEst("");
    setCWho("");
    setCAp("");
    setCQ("");
    setComLim(30);
    setMenLim(15);
    setSedLim(25);
    setOpenSede(null);
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-status-no-esta/30 bg-status-no-esta/10 p-4 text-sm text-status-no-esta">
        No se pudo cargar el dashboard: {error}
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-foreground-muted">Cargando dashboard…</p>;
  }

  const focusColor = docFocus ? `var(${ESTADO_META[docFocus].colorVar})` : "var(--color-brand-primary)";

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Estado documental por sede y mentor</h1>
          <p className="text-sm text-foreground-muted">Documentos que cada sede debe cargar, y en qué estado está cada uno.</p>
        </div>
        <div className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground-muted">
          {(() => {
            const [y, m, d] = data.corte.split("-").map(Number);
            return `Al día de hoy: ${d} ${MESES[m - 1]} ${y}`;
          })()}
          {" · "}
          {rows.length} sedes visibles para tu perfil
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/90 py-2.5 backdrop-blur">
        <select value={coo} onChange={(e) => setCoo(e.target.value)} aria-label="Coordinador" className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
          <option value="">Todos los coordinadores</option>
          {coordinadores.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={dep} onChange={(e) => setDep(e.target.value)} aria-label="Departamento" className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
          <option value="">Todos los departamentos</option>
          {departamentos.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select value={lin} onChange={(e) => setLin(e.target.value)} aria-label="Línea" className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
          <option value="">Todas las líneas</option>
          <option>L1</option>
          <option>L2</option>
          <option>L3</option>
        </select>
        <select value={men} onChange={(e) => setMen(e.target.value)} aria-label="Mentor" className="max-w-[220px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
          <option value="">Todos los mentores</option>
          {mentores.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Estado de la sede" className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
          <option value="">Todas las sedes</option>
          <option value="ok">Al día (100% cumple)</option>
          <option value="pend">Con pendientes</option>
          <option value="crit">Críticas (&lt; 50% cumple)</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          placeholder="Buscar sede, DANE, mentor o municipio…"
          aria-label="Buscar"
          className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
        />
        <button type="button" onClick={limpiarFiltros} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground-muted hover:text-brand-primary">
          Limpiar filtros
        </button>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <span key={i} className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-medium text-brand-primary">
                {c}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-foreground-muted">Ver documentos:</span>
          <button
            type="button"
            onClick={() => setDocFocus("")}
            aria-pressed={!docFocus}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${!docFocus ? "border-brand-primary bg-brand-primary text-white" : "border-border bg-surface text-foreground-muted"}`}
          >
            Todos los estados
          </button>
          {ESTADOS.filter((s) => s.k !== "c").map((s) => (
            <button
              key={s.k}
              type="button"
              onClick={() => setDocFocus(docFocus === s.k ? "" : (s.k as EstadoKey))}
              aria-pressed={docFocus === s.k}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={
                docFocus === s.k
                  ? { background: `var(${s.colorVar})`, borderColor: `var(${s.colorVar})`, color: "#fff" }
                  : { borderColor: "var(--color-border)", color: "var(--color-foreground-muted)" }
              }
            >
              {s.label} <b className="font-mono">{fmt(A0[s.k as keyof Agg] as number)}</b>
            </button>
          ))}
        </div>
      </div>

      {docFocus ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi hero color={focusColor} label={ESTADO_META[docFocus].label} value={fmt(A[docFocus])} hint={`${A0.p ? Math.round((A[docFocus] / A0.p) * 1000) / 10 : 0}% de todo el pendiente`} />
          <Kpi label="Sedes afectadas" value={`${rs.length} / ${rs0.length}`} hint={`Promedio ${rs.length ? (A[docFocus] / rs.length).toFixed(1) : 0} documentos por sede`} />
          <Kpi label="Mentores responsables" value={fmt(new Set(rs.map((r) => r.men)).size)} hint="con al menos un documento en este estado" />
          <Kpi label="Último comentario > 21 días" value={fmt(ages.filter((n) => n !== null && n > 21).length)} hint={`${comList.length ? Math.round((ages.filter((n) => n !== null && n > 21).length / comList.length) * 100) : 0}% de estos documentos`} />
          <Kpi label="Nunca revisados" value={fmt(ages.filter((n) => n === null).length)} hint="sin fecha de comentario" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi hero label="Avance documental (cumple)" value={`${pct(A.c, A.t)}%`} hint={`${fmt(A.c)} de ${fmt(A.t)} documentos`} />
          <Kpi label="Documentos pendientes" value={fmt(A.p)} hint={`${A.t ? Math.round((A.p / A.t) * 1000) / 10 : 0}% del total requerido`} />
          <Kpi label="Sedes al día" value={`${A.ok} / ${A.n}`} hint={`${A.n - A.ok} con algún pendiente`} />
          <Kpi label="Sin documentación en carpeta" value={fmt(A.nd)} hint={`${rs.filter((r) => r.nd > 0).length} sedes afectadas`} />
          <Kpi label="Mentores con pendientes" value={`${menPend} / ${mens.size}`} hint={`${mens.size - menPend} mentores al 100%`} />
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Estado de los documentos</h2>
        <div className="flex h-8 overflow-hidden rounded-md bg-surface-muted">
          {ESTADOS.map((s) =>
            (A[s.k as keyof Agg] as number) ? (
              <span
                key={s.k}
                style={{ width: `${((A[s.k as keyof Agg] as number) / A.t) * 100}%`, background: `var(${s.colorVar})`, opacity: docFocus && docFocus !== s.k ? 0.25 : 1 }}
                title={`${s.label}: ${fmt(A[s.k as keyof Agg] as number)}`}
              />
            ) : null
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {ESTADOS.map((s) => (
            <div key={s.k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(${s.colorVar})` }} />
              <span className="text-foreground-muted">{s.label}</span>
              <b className="font-mono">{fmt(A[s.k as keyof Agg] as number)}</b>
              <span className="font-mono text-foreground-muted/70">{A.t ? ((A[s.k as keyof Agg] as number) / A.t * 100).toFixed(1) : 0}%</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-2.5 text-sm font-semibold text-foreground">Por coordinador</h2>
          <div className="flex flex-col gap-1">
            {byCoo.length ? (
              byCoo.map(([k, a]) => (
                <ClickRow key={k} label={k || "(sin coordinador)"} sublabel={`${a.n} sedes · ${fmt(a.p)} pend.`} a={a} active={coo === k} onClick={() => setCoo(coo === k ? "" : k)} />
              ))
            ) : (
              <p className="p-3 text-center text-sm text-foreground-muted">Sin datos</p>
            )}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-2.5 text-sm font-semibold text-foreground">Por línea</h2>
          <div className="flex flex-col gap-1">
            {byLin.length ? (
              byLin.map(([k, a]) => (
                <ClickRow key={k} label={k} sublabel={`${a.n} sedes · ${fmt(a.p)} pend.`} a={a} active={lin === k} onClick={() => setLin(lin === k ? "" : k)} />
              ))
            ) : (
              <p className="p-3 text-center text-sm text-foreground-muted">Sin datos</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-2.5 text-sm font-semibold text-foreground">Por departamento</h2>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {byDep.length ? (
            byDep.map(([k, a]) => (
              <ClickRow key={k} label={k} sublabel={`${a.n} sedes · ${fmt(a.p)} pend.`} a={a} active={dep === k} onClick={() => setDep(dep === k ? "" : k)} />
            ))
          ) : (
            <p className="p-3 text-center text-sm text-foreground-muted">Sin datos</p>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-2.5 text-sm font-semibold text-foreground">Pendientes por fase</h2>
          <p className="mb-2 text-xs text-foreground-muted">N.º de sedes con al menos un documento pendiente</p>
          <div className="flex flex-col gap-2.5">
            {phs.length ? phs.map((it) => <HBar key={it.pre + it.l} label={it.l} prefix={it.pre} value={it.v} max={Math.max(0, ...phs.map((x) => x.v))} />) : <p className="text-sm text-foreground-muted">Ningún documento pendiente con estos filtros</p>}
          </div>
        </section>
        <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-2.5 text-sm font-semibold text-foreground">Documentos que más faltan</h2>
          <p className="mb-2 text-xs text-foreground-muted">N.º de sedes con ese documento pendiente</p>
          <div className="flex flex-col gap-2.5">
            {dcs.length ? dcs.map((it, i) => <HBar key={i} label={it.l} prefix={it.pre} value={it.v} max={Math.max(0, ...dcs.map((x) => x.v))} />) : <p className="text-sm text-foreground-muted">Ningún documento pendiente con estos filtros</p>}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Comentarios de revisión</h2>
        <p className="mb-3 text-xs text-foreground-muted">Último comentario registrado en cada documento pendiente</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-foreground-muted">Antigüedad del último comentario</h3>
            <div className="flex flex-col gap-2.5">
              {ageAgg.map((b) => (
                <div key={b.l} className="grid grid-cols-[1fr_44px] items-center gap-2.5">
                  <span className="text-sm">{b.l}</span>
                  <span className="col-span-2 -mt-0.5 h-2 overflow-hidden rounded bg-surface-muted">
                    <span className="block h-full rounded" style={{ width: `${(b.v / ageMax) * 100}%`, background: b.color }} />
                  </span>
                  <span className="col-span-2 -mt-1 text-right font-mono text-xs text-foreground-muted">{fmt(b.v)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-foreground-muted">Quién comentó</h3>
            <div className="flex max-h-[280px] flex-col gap-2 overflow-auto pr-1">
              {quienStats.length ? (
                quienStats.map(([w, v]) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setCWho(cWho === w ? "" : w)}
                    className={`grid grid-cols-[1fr_44px] items-center gap-2.5 rounded-md p-1 text-left hover:bg-surface-muted ${cWho === w ? "bg-brand-primary/5" : ""}`}
                  >
                    <span className={`truncate text-sm ${cWho === w ? "font-medium text-brand-primary" : ""}`}>{w}</span>
                    <span className="col-span-2 -mt-0.5 h-2 overflow-hidden rounded bg-surface-muted">
                      <span className="block h-full rounded bg-brand-primary" style={{ width: `${(v / quienMax) * 100}%` }} />
                    </span>
                    <span className="col-span-2 -mt-1 text-right font-mono text-xs text-foreground-muted">{fmt(v)}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-foreground-muted">Sin datos</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-2.5 text-sm font-semibold text-foreground">Detalle de comentarios</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={cEst} disabled={!!docFocus} onChange={(e) => setCEst(e.target.value as EstadoKey | "")} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm disabled:opacity-50">
            <option value="">Todos los estados</option>
            {ESTADOS.filter((s) => s.k !== "c").map((s) => (
              <option key={s.k} value={s.k}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={cWho} onChange={(e) => setCWho(e.target.value)} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
            <option value="">Cualquier revisor</option>
            {revisoresComentario.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <select value={cAp} onChange={(e) => setCAp(e.target.value)} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
            <option value="">Todos los apartados</option>
            {apartados.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <input value={cQ} onChange={(e) => setCQ(e.target.value)} type="search" placeholder="Buscar en el texto del comentario…" className="min-w-[220px] flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="px-2 py-2">Sede</th>
                <th className="px-2 py-2">Documento</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">Último comentario</th>
                <th className="px-2 py-2">Comentado por</th>
                <th className="px-2 py-2 text-right">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {comList.slice(0, comLim).map((c, i) => {
                const s = byDane.get(c[0]);
                const [ph, doc] = data.cd[c[1]].split("|");
                const tx = data.ct[c[3]];
                const a = age(c[5]);
                return (
                  <tr key={i} className="border-b border-border/60 align-top">
                    <td className="px-2 py-2">
                      <p className="font-medium">{s?.sede ?? c[0]}</p>
                      <p className="text-xs text-foreground-muted">{s?.mun} · {s?.men}</p>
                    </td>
                    <td className="px-2 py-2">
                      <p className="text-[11px] font-semibold text-foreground-muted">{ph}</p>
                      <p>{doc}</p>
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: `var(${ESTADO_META[c[2]].colorVar})` }}>
                        <i className="h-2 w-2 rounded-full" style={{ background: `var(${ESTADO_META[c[2]].colorVar})` }} />
                        {ESTADO_META[c[2]].label}
                      </span>
                    </td>
                    <td className="max-w-[320px] whitespace-pre-line px-2 py-2">{tx || <span className="italic text-foreground-muted">Sin comentario</span>}</td>
                    <td className="px-2 py-2">{data.cw[c[4]]}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      {c[5] ? fdt(c[5]) : "—"}
                      <p className="text-xs text-foreground-muted">{a === null ? "" : a === 0 ? "hoy" : a === 1 ? "hace 1 día" : `hace ${a} días`}</p>
                    </td>
                  </tr>
                );
              })}
              {comList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-foreground-muted">
                    Ningún comentario coincide con los filtros
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-foreground-muted">
          {comList.length > comLim ? (
            <>
              <span>Mostrando {comLim} de {fmt(comList.length)}</span>
              <button type="button" onClick={() => setComLim((v) => v + 100)} className="rounded-md border border-border px-2.5 py-1 font-medium hover:text-brand-primary">
                Ver 100 más
              </button>
            </>
          ) : (
            <span>{fmt(comList.length)} documentos</span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-2.5 text-sm font-semibold text-foreground">Mentores</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="px-2 py-2">Mentor</th>
                <th className="px-2 py-2 text-right">Sedes</th>
                <th className="px-2 py-2 text-right">% cumple</th>
                <th className="px-2 py-2">Distribución</th>
                <th className="px-2 py-2 text-right">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {menList.slice(0, menLim).map((o) => (
                <tr key={o.name} className={`cursor-pointer border-b border-border/60 hover:bg-surface-muted ${men === o.name ? "bg-brand-primary/5" : ""}`} onClick={() => setMen(men === o.name ? "" : o.name)}>
                  <td className="px-2 py-2">
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-foreground-muted">{o.coo}</p>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{o.a.n}</td>
                  <td className="px-2 py-2 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass(o.pct)}`}>{o.pct}%</span>
                  </td>
                  <td className="min-w-[140px] px-2 py-2">
                    <MiniBar a={o.a} />
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">{fmt(o.a.p)}</td>
                </tr>
              ))}
              {menList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-foreground-muted">
                    Sin mentores con estos filtros
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {menList.length > menLim ? (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setMenLim(9999)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:text-brand-primary">
              Ver todos ({menList.length})
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Sedes</h2>
        <p className="mb-3 text-xs text-foreground-muted">Clic en una fila para ver sus documentos pendientes y comentarios</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="px-2 py-2">Sede</th>
                <th className="px-2 py-2">Línea / coordinador</th>
                <th className="px-2 py-2">Mentor / revisor</th>
                <th className="px-2 py-2 text-right">% cumple</th>
                <th className="px-2 py-2 text-right">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {sedList.slice(0, sedLim).map((r) => {
                const p = pct(r.c, r.t);
                const isOpen = openSede === r.id;
                const docs = (comByInst.get(r.id) ?? []).filter((c) => !docFocus || c[2] === docFocus).sort((a, b) => (data.cd[a[1]] < data.cd[b[1]] ? -1 : 1));
                return (
                  <Fragment key={r.id}>
                    <tr className="cursor-pointer border-b border-border/60 hover:bg-surface-muted" onClick={() => setOpenSede(isOpen ? null : r.id)}>
                      <td className="px-2 py-2">
                        <p className="font-medium">{r.sede}</p>
                        <p className="text-xs text-foreground-muted">{r.mun}, {r.dep} · DANE {r.dane}</p>
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-mono text-xs font-semibold text-brand-primary">{r.lin}</p>
                        <p className="text-xs text-foreground-muted">{r.coo}</p>
                      </td>
                      <td className="px-2 py-2">
                        {r.men}
                        <p className="text-xs text-foreground-muted">Rev.: {r.rev || "—"}</p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass(p)}`}>{p}%</span>
                        <p className="text-xs text-foreground-muted">{r.c}/{r.t}</p>
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-semibold">{r.t - r.c}</td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/60 bg-surface-muted">
                        <td colSpan={5} className="px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <b>{r.inst}</b>
                            <Link href={`/sedes/${r.id}`} className="text-xs font-medium text-brand-primary hover:underline">
                              Ver ficha completa →
                            </Link>
                          </div>
                          {docs.length ? (
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {docs.map((c, i) => {
                                const [ph, doc] = data.cd[c[1]].split("|");
                                const tx = data.ct[c[3]];
                                const who = data.cw[c[4]];
                                return (
                                  <li key={i} className="rounded-md border border-border bg-surface p-2.5 text-xs">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-semibold text-foreground-muted">{ph}</span>
                                      <span>{doc}</span>
                                      <span className="ml-auto font-medium" style={{ color: `var(${ESTADO_META[c[2]].colorVar})` }}>
                                        {ESTADO_META[c[2]].label}
                                      </span>
                                    </div>
                                    <p className="mt-1 whitespace-pre-line text-foreground-muted">{tx || "Sin comentario"}</p>
                                    <p className="mt-1 text-foreground-muted/70">{who}{c[5] ? ` · ${fdt(c[5])}` : ""}</p>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-xs text-foreground-muted">Todo en Cumple.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {sedList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-foreground-muted">
                    Ninguna sede coincide con los filtros
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-foreground-muted">
          {sedList.length > sedLim ? (
            <>
              <span>Mostrando {sedLim} de {sedList.length}</span>
              <button type="button" onClick={() => setSedLim((v) => v + 50)} className="rounded-md border border-border px-2.5 py-1 font-medium hover:text-brand-primary">
                Ver 50 más
              </button>
              <button type="button" onClick={() => setSedLim(9999)} className="rounded-md border border-border px-2.5 py-1 font-medium hover:text-brand-primary">
                Ver todas
              </button>
            </>
          ) : (
            <span>{sedList.length} sedes</span>
          )}
        </div>
      </section>
    </div>
  );
}
