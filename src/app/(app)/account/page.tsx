"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Uzbekistan", "India", "Pakistan",
  "Nigeria", "China", "South Korea", "Japan", "Germany", "France", "Turkey", "United Arab Emirates",
  "Saudi Arabia", "Egypt", "Brazil", "Mexico", "Philippines", "Vietnam", "Indonesia", "Kazakhstan",
  "Other",
];

// Deterministic color for the avatar chip, derived from the user's name so
// it stays consistent across visits rather than changing on every reload.
const AVATAR_GRADIENTS = [
  "from-red-500 to-rose-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-fuchsia-600",
];
function gradientFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface Account {
  name: string;
  email: string;
  country: string | null;
  avatarData: string | null;
  memberSince: string;
}

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: Account) => {
        setAccount(data);
        setNameDraft(data.name);
      })
      .catch(() => setError("Couldn't load your account. Try refreshing."))
      .finally(() => setLoading(false));
  }, []);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't save that change — try again.");
      setAccount((prev) => (prev ? { ...prev, ...body } : prev));
      // Sidebar/MobileTopBar are rendered by the server layout from the
      // session on initial load, so a client-side patch here (new name,
      // new photo) wouldn't otherwise show up there until a hard refresh.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change — try again.");
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);

    // Resize + adaptively compress instead of sending the raw file — a
    // phone photo can easily be 8–15MB, which is both slow to upload and
    // unnecessarily large for a small avatar chip. 320px is already more
    // than this photo is ever displayed at, and the quality loop keeps
    // stepping down until the encoded size is genuinely small rather than
    // failing outright on anything over a fixed cap.
    const MAX_EDGE = 320;
    const TARGET_BYTES = 150_000;
    const MIN_QUALITY = 0.5;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height); // square-crop to the smaller dimension
        const scale = Math.min(1, MAX_EDGE / size);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(size * scale));
        canvas.height = canvas.width;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          patch({ avatarData: dataUrl });
          return;
        }
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);

        let quality = 0.85;
        let out = canvas.toDataURL("image/jpeg", quality);
        let bytes = Math.round((out.length * 3) / 4);
        while (bytes > TARGET_BYTES && quality > MIN_QUALITY) {
          quality = Math.max(MIN_QUALITY, quality - 0.1);
          out = canvas.toDataURL("image/jpeg", quality);
          bytes = Math.round((out.length * 3) / 4);
        }
        patch({ avatarData: out });
      };
      img.onerror = () => setError("That file doesn't look like a valid image — try a different one.");
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    patch({ name: trimmed });
    setEditingName(false);
  }

  if (loading) {
    return <div className="animate-pulse text-brand-slate text-sm">Loading account…</div>;
  }
  if (!account) {
    return <p className="text-sm text-brand-red">{error ?? "Couldn't load your account."}</p>;
  }

  const memberSinceLabel = new Date(account.memberSince).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-lg">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-brand-navy mb-6">
        <PersonIcon /> Account
      </h1>

      <div className="card p-6">
        {error && <p className="text-sm text-brand-red mb-4">{error}</p>}

        <div className="flex items-center gap-4 mb-6">
          {account.avatarData ? (
            <img
              src={account.avatarData}
              alt=""
              className="w-16 h-16 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div
              className={`w-16 h-16 rounded-2xl shrink-0 bg-gradient-to-br ${gradientFor(account.name)} flex items-center justify-center text-white text-xl font-bold`}
            >
              {initials(account.name)}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <PhotoIcon /> Add photo
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>

        <Field label="Name">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="flex-1 px-3 py-2 rounded-lg border border-brand-border text-base font-semibold text-brand-navy outline-none focus:border-brand-blue"
              />
              <button onClick={saveName} className="btn-primary text-xs px-3 py-2">
                Save
              </button>
              <button
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(account.name);
                }}
                className="text-xs text-brand-slate px-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-base font-semibold text-brand-navy">{account.name}</p>
          )}
        </Field>

        <Divider />

        <Field label="Country">
          <select
            value={account.country ?? ""}
            onChange={(e) => patch({ country: e.target.value || null })}
            disabled={saving}
            className="w-full px-3 py-2 rounded-lg border border-brand-border text-base font-semibold text-brand-navy outline-none focus:border-brand-blue bg-white"
          >
            <option value="">Not set</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Divider />

        <Field label="Email">
          <p className="text-base font-semibold text-brand-navy">{account.email}</p>
        </Field>

        <Divider />

        <Field label="Member Since">
          <p className="text-base font-semibold text-brand-navy">{memberSinceLabel}</p>
        </Field>

        {!editingName && (
          <>
            <Divider />
            <button
              onClick={() => setEditingName(true)}
              className="btn-secondary text-sm flex items-center gap-2 w-full justify-center"
            >
              <EditIcon /> Edit name
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <p className="text-xs text-brand-slate mb-1.5">{label}</p>
      {children}
    </div>
  );
}
function Divider() {
  return <div className="border-t border-brand-border" />;
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 20c0-4.1 3.4-7.2 7.5-7.2s7.5 3.1 7.5 7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function PhotoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="9" cy="11" r="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 16l5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20l3.5-1 10-10-2.5-2.5-10 10L4 20z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 5l2.5 2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
