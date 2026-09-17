"use client";

import { useEffect, useId, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useId();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const scriptId = "cf-turnstile-script";
    function render() {
      if (!containerRef.current || !window.turnstile) return;
      window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
      });
    }

    if (window.turnstile) {
      render();
      return;
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.onload = render;
      document.body.appendChild(script);
    }
  }, [siteKey, onToken]);

  if (!siteKey) {
    // Sem site key configurada (ex: ambiente local) — captcha fica desligado.
    return null;
  }

  return <div ref={containerRef} data-widget-id={widgetId} />;
}
