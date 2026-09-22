"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

/** Muestra el error/éxito que una Server Action dejó en la URL (?error=...&success=...)
 * como un toast, y limpia esos parámetros de la URL para que un refresh no lo repita.
 * Reemplaza los banners estáticos que dependían de que el parámetro siguiera en la URL. */
export function ToastFromSearchParams({ error, success }: { error?: string; success?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!error && !success) return;
    if (error) toast.error(error);
    if (success) toast.success(success);
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, success]);

  return null;
}
