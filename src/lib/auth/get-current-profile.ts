import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

export type CurrentProfile = typeof profiles.$inferSelect;

export async function getCurrentProfile(): Promise<CurrentProfile> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, session.user.id)).limit(1);

  if (!profile) redirect("/login");
  if (!profile.active) {
    redirect("/login?error=" + encodeURIComponent("Tu cuenta está inactiva. Contacta al administrador."));
  }

  return profile;
}
