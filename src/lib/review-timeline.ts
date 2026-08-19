import { and, gte, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sectionReviews, profiles, institutions, documentSections } from "@/lib/db/schema";

export interface TimelineEntry {
  day: string; // YYYY-MM-DD (zona local del servidor)
  reviewerId: string;
  reviewerName: string;
  institutionId: string;
  sedeName: string;
  institutionName: string;
  sectionName: string;
  status: string;
  comment: string | null;
  createdAt: Date;
}

export interface DailyReviewerCount {
  day: string;
  reviewerId: string;
  reviewerName: string;
  cambios: number;
  sedesUnicas: number;
}

export interface DailyTotal {
  day: string;
  cambios: number;
  sedesUnicas: number;
}

/**
 * Toda la actividad de section_reviews desde `since` (inclusive), sin colapsar a
 * "último por sede+apartado" — cada fila es un cambio de estado real, con quién y
 * cuándo. Base para el calendario/timeline y para los conteos diarios.
 */
export async function getReviewActivitySince(since: Date): Promise<TimelineEntry[]> {
  const rows = await db
    .select({
      createdAt: sectionReviews.createdAt,
      status: sectionReviews.status,
      comment: sectionReviews.comment,
      reviewerId: sectionReviews.reviewerId,
      reviewerName: profiles.fullName,
      institutionId: sectionReviews.institutionId,
      sedeName: institutions.sedeName,
      institutionName: institutions.institutionName,
      sectionName: documentSections.name,
    })
    .from(sectionReviews)
    .innerJoin(profiles, eq(profiles.id, sectionReviews.reviewerId))
    .innerJoin(institutions, eq(institutions.id, sectionReviews.institutionId))
    .innerJoin(documentSections, eq(documentSections.id, sectionReviews.sectionId))
    .where(and(gte(sectionReviews.createdAt, since)))
    .orderBy(desc(sectionReviews.createdAt));

  return rows.map((r) => ({
    day: r.createdAt.toISOString().slice(0, 10),
    reviewerId: r.reviewerId,
    reviewerName: r.reviewerName,
    institutionId: r.institutionId,
    sedeName: r.sedeName,
    institutionName: r.institutionName,
    sectionName: r.sectionName,
    status: r.status,
    comment: r.comment,
    createdAt: r.createdAt,
  }));
}

/** Agrupa la actividad en una matriz día x revisor (cambios y sedes distintas tocadas). */
export function groupDailyByReviewer(entries: TimelineEntry[]): DailyReviewerCount[] {
  const map = new Map<string, { day: string; reviewerId: string; reviewerName: string; sedes: Set<string>; count: number }>();
  for (const e of entries) {
    const key = `${e.day}|${e.reviewerId}`;
    const bucket = map.get(key) ?? { day: e.day, reviewerId: e.reviewerId, reviewerName: e.reviewerName, sedes: new Set(), count: 0 };
    bucket.count += 1;
    bucket.sedes.add(e.institutionId);
    map.set(key, bucket);
  }
  return [...map.values()]
    .map((b) => ({ day: b.day, reviewerId: b.reviewerId, reviewerName: b.reviewerName, cambios: b.count, sedesUnicas: b.sedes.size }))
    .sort((a, b) => (a.day === b.day ? a.reviewerName.localeCompare(b.reviewerName) : a.day.localeCompare(b.day)));
}

/** Totales por día (todos los revisores juntos), para el resumen "cuántos cambian de estado cada día". */
export function groupDailyTotals(entries: TimelineEntry[]): DailyTotal[] {
  const map = new Map<string, { day: string; sedes: Set<string>; count: number }>();
  for (const e of entries) {
    const bucket = map.get(e.day) ?? { day: e.day, sedes: new Set(), count: 0 };
    bucket.count += 1;
    bucket.sedes.add(e.institutionId);
    map.set(e.day, bucket);
  }
  return [...map.values()]
    .map((b) => ({ day: b.day, cambios: b.count, sedesUnicas: b.sedes.size }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
