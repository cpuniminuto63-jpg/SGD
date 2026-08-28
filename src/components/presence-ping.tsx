"use client";

import { useEffect } from "react";

const INTERVAL_MS = 90 * 1000;

/** Manda un latido silencioso cada minuto y medio mientras la pestaña está abierta,
 * para poder ver cuánta gente usa la app al mismo tiempo (planeación de
 * infraestructura). No guarda nada sobre qué hace la persona, solo que está activa. */
export function PresencePing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "visible") {
        navigator.sendBeacon?.("/api/ping") ?? fetch("/api/ping", { method: "POST", keepalive: true });
      }
    };
    ping();
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
