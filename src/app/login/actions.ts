"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Ingresa tu correo y contraseña.")}&next=${encodeURIComponent(next)}`);
  }

  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(
        `/login?error=${encodeURIComponent("Credenciales inválidas. Verifica tu correo y contraseña.")}&next=${encodeURIComponent(next)}`
      );
    }
    // NextAuth señaliza el redirect exitoso lanzando un error especial de Next.js:
    // debe propagarse sin capturarlo, o el login "exitoso" nunca navegaría.
    throw error;
  }
}
