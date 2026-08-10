"use server";

import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Ingresa tu correo institucional." };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/actualizar-clave`,
  });

  // Respuesta genérica siempre: no revelamos si el correo existe o no en el sistema.
  return {
    ok: true,
    message: "Si el correo está registrado, recibirás un enlace para restablecer tu clave.",
  };
}
