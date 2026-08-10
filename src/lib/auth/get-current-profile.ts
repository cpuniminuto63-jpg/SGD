import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type CurrentProfile = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentProfile(): Promise<CurrentProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) redirect("/login");
  if (!profile.active) redirect("/login?error=Tu%20cuenta%20está%20inactiva.%20Contacta%20al%20administrador.");

  return profile;
}
