import { redirect } from "next/navigation";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth/get-current-profile";
import type { UserRole } from "@/lib/db/types";

export async function requireRole(...roles: UserRole[]): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!roles.includes(profile.role)) {
    redirect("/?error=No%20tienes%20permiso%20para%20acceder%20a%20esa%20sección.");
  }
  return profile;
}
