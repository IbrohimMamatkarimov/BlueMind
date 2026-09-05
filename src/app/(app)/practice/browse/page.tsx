"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * Question Bank → Browse: the full list of standalone bank questions (the
 * imported College Board bank), filterable by skill / difficulty / your
 * status, with a "Solve" per row and a "Practice N questions" session
 * builder. Both open the exact exam screen the mocks use
 * (/practice/qbank/<section>/<setId>), so practice here feels like the
 * real test rather than a quiz widget.
 */

type Section = "Reading and Writing" | "Math";
type Status = "all" | "unattempted" | "correct" | "incorrect" | "attempted";

const SECTIONS: Section[] = ["Reading and Writing", "Math"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unattempted", label: "Not started" },
  { value: "correct", label: "Correct" },
  { value: "incorrect", label: "Incorrect" },
  { value: "attempted", label: "Attempted" },
];
const PAGE_SIZE = 50;

interface FacetSkill {
  skill: string;
  total: number;
  attempted: number;
  correct: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
}
interface FacetDomain {
  domain: string;
  total: number;
  attempted: number;
  skills: FacetSkill[];
}
interface Facets {
  section: Section;
  total: number;
  attempted: number;
  correct: number;
  byDifficulty: { Easy: number; Medium: number; Hard: number };
  domains: FacetDomain[];
}
interface Row {
  id: string;
  externalId: string | null;
  domain: string;
  skill: string;
  difficulty: string;
  questionType: string;
  attempts: number;
  lastCorrect: boolean | null;
}
interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: Row[];
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l12-7.5L7 4.5z" />
    </svg>
  );
}
function FunnelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5h16l-6.5 8v5l-3 2v-7L4 5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function difficultyClasses(d: string) {
  if (d === "Easy") return "bg-brand-green-light text-brand-green";
  if (d === "Medium") return "bg-brand-amber-light text-brand-amber";
  return "bg-brand-red-light text-brand-red";
}

function formatCount(n: number) {
  return n.toLocaleString("en-US");
}

export default function BrowseQuestionBankPage() {
  const [section, setSection] = useState<Section>("Reading and Writing");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [facetsBySection, setFacetsBySection] = useState<Partial<Record<Section, Facets>>>({});
  const [skills, setSkills] = useState<Set<string>>(new Set());
  const [difficulties, setDifficulties] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setSize, setSetSize] = useState(10);
  const [shuffle, setShuffle] = useState(true);
  const [starting, setStarting] = useState<string | null>(null); // "set" or a question id
  const [startError, setStartError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const pendingDomainRef = useRef<string | null>(null);
  const requestRef = useRef(0);

  // Read the deep-link parameters (from the hub's Browse links) once, on the
  // client — window.location instead of useSearchParams so this page
  // doesn't need a Suspense boundary.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sec = p.get("section");
    if (sec === "Math" || sec === "Reading and Writing") setSection(sec);
    const skillParams = p.getAll("skill").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
    if (skillParams.length) setSkills(new Set(skillParams));
    const diff = p.getAll("difficulty").flatMap((s) => s.split(",")).filter((d) => (DIFFICULTIES as readonly string[]).includes(d));
    if (diff.length) setDifficulties(new Set(diff));
    const st = p.get("status");
    if (st && STATUS_OPTIONS.some((o) => o.value === st)) setStatus(st as Status);
    pendingDomainRef.current = p.get("domain");
    setInitialized(true);
  }, []);

  // Facets (counts for the sidebar) per section — cached once loaded.
  useEffect(() => {
    if (!initialized) return;
    const cached = facetsBySection[section];
    if (cached) {
      setFacets(cached);
      return;
    }
    let cancelled = false;
    fetch(`/api/qbank/facets?section=${encodeURIComponent(section)}`)
      .then((r) => r.json())
      .then((f: Facets) => {
        if (cancelled) return;
        setFacets(f);
        setFacetsBySection((prev) => ({ ...prev, [section]: f }));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the question bank.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, initialized]);

  // A ?domain= deep link expands to that domain's skills once we know them.
  useEffect(() => {
    if (!facets || !pendingDomainRef.current) return;
    const d = facets.domains.find((x) => x.domain === pendingDomainRef.current);
    pendingDomainRef.current = null;
    if (d) setSkills(new Set(d.skills.map((s) => s.skill)));
  }, [facets]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("section", section);
    if (skills.size) p.set("skills", Array.from(skills).join(","));
    if (difficulties.size) p.set("difficulties", Array.from(difficulties).join(","));
    if (status !== "all") p.set("status", status);
    if (search.trim()) p.set("search", search.trim());
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    return p.toString();
  }, [section, skills, difficulties, status, search, page]);

  useEffect(() => {
    if (!initialized) return;
    const id = ++requestRef.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/qbank/list?${queryString}`)
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? "Couldn't load questions");
          return body as ListResponse;
        })
        .then((body) => {
          if (id !== requestRef.current) return;
          setData(body);
          setError(null);
          if (body.page !== page) setPage(body.page);
        })
        .catch((err: Error) => {
          if (id !== requestRef.current) return;
          setError(err.message);
        })
        .finally(() => {
          if (id === requestRef.current) setLoading(false);
        });
    }, search.trim() ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, initialized]);

  function switchSection(next: Section) {
    if (next === section) return;
    setSection(next);
    setSkills(new Set());
    setPage(1);
    setStartError(null);
  }
  function toggleSkill(skill: string) {
    setSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
    setPage(1);
  }
  function toggleDomain(d: FacetDomain) {
    const all = d.skills.filter((s) => s.total > 0).map((s) => s.skill);
    const every = all.length > 0 && all.every((s) => skills.has(s));
    setSkills((prev) => {
      const next = new Set(prev);
      for (const s of all) {
        if (every) next.delete(s);
        else next.add(s);
      }
      return next;
    });
    setPage(1);
  }
  function toggleDifficulty(d: string) {
    setDifficulties((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
    setPage(1);
  }
  function resetFilters() {
    setSkills(new Set());
    setDifficulties(new Set());
    setStatus("all");
    setSearch("");
    setPage(1);
  }

  async function startSet(questionIds?: string[]) {
    const key = questionIds ? questionIds[0] : "set";
    setStarting(key);
    setStartError(null);
    try {
      const res = await fetch("/api/qbank/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          questionIds
            ? { section, questionIds }
            : {
                section,
                skills: Array.from(skills),
                difficulties: Array.from(difficulties),
                status,
                search: search.trim(),
                count: setSize,
                shuffle,
              }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't start this practice set.");
      window.location.href = body.href ?? `/practice/qbank/${encodeURIComponent(section)}/${body.setId}`;
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start this practice set.");
      setStarting(null);
    }
  }

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstIndex = data ? (data.page - 1) * data.pageSize : 0;
  const fullModule = section === "Math" ? 22 : 27;
  const sizeOptions = Array.from(new Set([5, 10, 15, 20, fullModule, 40])).sort((a, b) => a - b);
  const activeFilterCount = skills.size + difficulties.size + (status !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

  return (
    <div className="space-y-5 max-w-6xl">
      <Link href="/practice" className="text-sm text-brand-slate hover:text-brand-navy">
        ‹ Back to Question Bank
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Browse questions</h1>
          <p className="text-sm text-brand-slate mt-1">
            Every question in the bank, filtered your way. Solve any of them in the full exam screen.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-brand-border bg-white p-1">
          {SECTIONS.map((s) => {
            const f = facetsBySection[s];
            const active = s === section;
            return (
              <button
                key={s}
                onClick={() => switchSection(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-slate-50"
                }`}
              >
                {s === "Reading and Writing" ? "Reading & Writing" : "Math"}
                {f && <span className={`ml-1.5 text-xs ${active ? "text-white/70" : "text-brand-slate"}`}>{formatCount(f.total)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {facets && facets.total > 0 && (
        <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs text-brand-slate mb-1.5">
              <span>
                <span className="font-semibold text-brand-navy">{formatCount(facets.attempted)}</span> of {formatCount(facets.total)} solved
              </span>
              <span>{Math.round((facets.attempted / facets.total) * 100)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.min(100, (facets.attempted / facets.total) * 100)}%` }} />
            </div>
          </div>
          <div className="text-xs text-brand-slate">
            Accuracy so far:{" "}
            <span className="font-semibold text-brand-navy">
              {facets.attempted > 0 ? `${Math.round((facets.correct / facets.attempted) * 100)}%` : "—"}
            </span>
          </div>
          <div className="text-xs text-brand-slate">
            {DIFFICULTIES.map((d) => (
              <span key={d} className="mr-3">
                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${d === "Easy" ? "bg-brand-green" : d === "Medium" ? "bg-brand-amber" : "bg-brand-red"}`} />
                {d} {formatCount(facets.byDifficulty[d])}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setFiltersOpen((v) => !v)}
        className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-brand-navy border border-brand-border rounded-full px-3 py-1.5 bg-white"
      >
        <FunnelIcon /> Filters {activeFilterCount > 0 && <span className="text-brand-blue">({activeFilterCount})</span>}
      </button>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
        {/* ---------------- Filters ---------------- */}
        <aside className={`card p-4 space-y-5 lg:sticky lg:top-6 ${filtersOpen ? "" : "hidden lg:block"}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-brand-navy">Filters</span>
            {activeFilterCount > 0 && (
              <button onClick={resetFilters} className="text-xs text-brand-blue hover:underline">
                Reset
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-slate mb-1.5">Question ID</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. f1bfbed3"
              className="w-full px-3 py-2 rounded-lg border border-brand-border focus:border-brand-blue outline-none text-sm bg-white text-brand-navy"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-brand-slate mb-1.5">Difficulty</p>
            <div className="flex flex-wrap gap-1.5">
              {DIFFICULTIES.map((d) => {
                const on = difficulties.has(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDifficulty(d)}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
                      on ? "border-brand-navy bg-brand-navy text-white" : "border-brand-border text-brand-navy hover:bg-slate-50"
                    }`}
                  >
                    {d}
                    {facets && <span className={`ml-1 ${on ? "text-white/70" : "text-brand-slate"}`}>{formatCount(facets.byDifficulty[d])}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-brand-slate mb-1.5">Your status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((o) => {
                const on = status === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() => {
                      setStatus(o.value);
                      setPage(1);
                    }}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
                      on ? "border-brand-blue bg-brand-blue text-white" : "border-brand-border text-brand-navy hover:bg-slate-50"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-brand-slate mb-1.5">Topics</p>
            {!facets ? (
              <p className="text-xs text-brand-slate animate-pulse">Loading topics…</p>
            ) : (
              <div className="space-y-3">
                {facets.domains.map((d) => {
                  const available = d.skills.filter((s) => s.total > 0);
                  const allOn = available.length > 0 && available.every((s) => skills.has(s.skill));
                  const someOn = available.some((s) => skills.has(s.skill));
                  return (
                    <div key={d.domain}>
                      <label className={`flex items-center gap-2 cursor-pointer ${d.total === 0 ? "opacity-40" : ""}`}>
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => {
                            if (el) el.indeterminate = someOn && !allOn;
                          }}
                          disabled={d.total === 0}
                          onChange={() => toggleDomain(d)}
                          className="w-4 h-4 accent-brand-blue shrink-0"
                        />
                        <span className="text-sm font-semibold text-brand-navy flex-1 min-w-0 truncate">{d.domain}</span>
                        <span className="text-[11px] text-brand-slate tabular-nums shrink-0">{formatCount(d.total)}</span>
                      </label>
                      <div className="mt-1 ml-3 pl-3 border-l border-brand-border space-y-0.5">
                        {d.skills.map((s) => (
                          <label
                            key={s.skill}
                            className={`flex items-center gap-2 py-0.5 ${s.total === 0 ? "opacity-40" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={skills.has(s.skill)}
                              disabled={s.total === 0}
                              onChange={() => toggleSkill(s.skill)}
                              className="w-3.5 h-3.5 accent-brand-blue shrink-0"
                            />
                            <span className="text-xs text-brand-navy flex-1 min-w-0 truncate">{s.skill}</span>
                            <span className="text-[11px] text-brand-slate tabular-nums shrink-0">
                              {s.attempted > 0 ? `${formatCount(s.attempted)}/` : ""}
                              {formatCount(s.total)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ---------------- Results ---------------- */}
        <div className="space-y-4 min-w-0">
          <div className="card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold text-brand-navy">Practice a set</p>
              <p className="text-xs text-brand-slate mt-0.5">
                Pulls questions matching your filters into a timed, exam-style session.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-navy">
              <select
                value={setSize}
                onChange={(e) => setSetSize(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg border border-brand-border bg-white text-sm text-brand-navy"
              >
                {sizeOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} question{n === 1 ? "" : "s"}
                    {n === fullModule ? " (full module)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-navy cursor-pointer">
              <input type="checkbox" checked={shuffle} onChange={() => setShuffle((v) => !v)} className="w-4 h-4 accent-brand-blue" />
              Shuffle
            </label>
            <button
              onClick={() => startSet()}
              disabled={starting !== null || total === 0}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
            >
              <PlayIcon /> {starting === "set" ? "Starting…" : `Start ${Math.min(setSize, total || setSize)}`}
            </button>
            {startError && <p className="w-full text-xs text-brand-red">{startError}</p>}
          </div>

          {error && <p className="text-sm text-brand-red">{error}</p>}

          <div className={`border border-brand-border rounded-xl overflow-hidden bg-white transition-opacity ${loading ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-brand-border text-xs text-brand-slate">
              <span>
                {data
                  ? total === 0
                    ? "No questions match these filters"
                    : `Showing ${formatCount(firstIndex + 1)}–${formatCount(firstIndex + data.rows.length)} of ${formatCount(total)}`
                  : "Loading…"}
              </span>
              <span className="hidden sm:inline">Click a question to solve it</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-brand-slate border-b border-brand-border">
                    <th className="px-4 py-2 w-12">#</th>
                    <th className="px-2 py-2 w-28">Question ID</th>
                    <th className="px-2 py-2">Topic</th>
                    <th className="px-2 py-2 w-24">Difficulty</th>
                    <th className="px-2 py-2 w-32">Your status</th>
                    <th className="px-2 py-2 w-24 text-right">Attempts</th>
                    <th className="px-4 py-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {data && data.rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-brand-slate">
                        {facets && facets.total === 0
                          ? "No questions in this section yet."
                          : "Nothing matches — try clearing a filter."}
                      </td>
                    </tr>
                  )}
                  {(data?.rows ?? []).map((r, i) => {
                    const busy = starting === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => !starting && startSet([r.id])}
                        className="border-b border-brand-border last:border-0 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-4 py-2.5 text-xs text-brand-slate tabular-nums">{firstIndex + i + 1}</td>
                        <td className="px-2 py-2.5 font-mono text-xs text-brand-navy">{r.externalId ?? "—"}</td>
                        <td className="px-2 py-2.5 min-w-0">
                          <div className="text-brand-navy truncate">{r.skill}</div>
                          <div className="text-[11px] text-brand-slate truncate">
                            {r.domain}
                            {r.questionType === "spr" ? " · Student-produced response" : ""}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${difficultyClasses(r.difficulty)}`}>{r.difficulty}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          {r.lastCorrect === null ? (
                            <span className="text-xs text-brand-slate">—</span>
                          ) : r.lastCorrect ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-green">
                              <CheckIcon /> Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-red">
                              <XIcon /> Incorrect
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right text-xs text-brand-slate tabular-nums">{r.attempts > 0 ? r.attempts : ""}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!starting) startSet([r.id]);
                            }}
                            disabled={starting !== null}
                            className="text-xs font-semibold text-brand-blue border border-brand-blue/40 rounded-full px-3 py-1 hover:bg-brand-blue-light disabled:opacity-50"
                          >
                            {busy ? "Opening…" : r.attempts > 0 ? "Retry" : "Solve"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="btn-secondary text-sm px-4 py-1.5 disabled:opacity-40"
              >
                ‹ Previous
              </button>
              <span className="text-xs text-brand-slate">
                Page {page} of {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount || loading}
                className="btn-secondary text-sm px-4 py-1.5 disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
