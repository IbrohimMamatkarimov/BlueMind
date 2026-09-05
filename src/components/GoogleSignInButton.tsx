"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

/**
 * Renders Google's own "Sign in with Google" button via Google Identity
 * Services. On success, posts the ID token to the server for verification
 * (see /api/auth/google) — the client never sees or handles a secret.
 * Falls back to a disabled, informative button if no client ID is set.
 */
export function GoogleSignInButton() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CLIENT_ID || !buttonRef.current) return;

    async function handleCredential(response: { credential: string }) {
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Google sign-in failed. Please try again.");
          return;
        }
        router.push("/mocks");
        router.refresh();
      } catch {
        setError("Network error — please try again.");
      }
    }

    function init() {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        shape: "rectangular",
        text: "continue_with",
      });
    }

    if (window.google) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [router]);

  if (!CLIENT_ID) {
    return (
      <div className="w-full text-center text-xs text-brand-slate border border-dashed border-brand-border rounded-lg py-2.5 px-3">
        Google sign-in needs a client ID — add{" "}
        <code className="text-[11px]">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to your .env file.
      </div>
    );
  }

  return (
    <div>
      <div ref={buttonRef} className="flex justify-center" />
      {error && <p className="mt-2 text-xs text-brand-red text-center">{error}</p>}
    </div>
  );
}
