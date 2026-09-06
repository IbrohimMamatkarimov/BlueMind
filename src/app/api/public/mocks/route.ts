import { NextResponse } from "next/server";
import { getPublicMockLibrary } from "@/lib/mock-library";

// This handler reads nothing dynamic (no cookies, headers or request), so
// Next 14 would otherwise prerender it ONCE at `next build` and serve that
// frozen list forever — mocks imported after the last deploy never showed
// up on /mocks until the site was rebuilt. Force it to hit the DB per request.
export const dynamic = "force-dynamic";

// Public — no auth. Powers the signed-out landing page mock directory and
// the signed-in /mocks page.
export async function GET() {
  try {
    const groups = await getPublicMockLibrary();
    return NextResponse.json({ groups });
  } catch (err) {
    // Most likely cause: the dev server hasn't been fully restarted since a
    // new table/column (e.g. module_releases, questions.position) was added
    // to schema.sql — those only get created on server startup, not on a
    // hot-reload.
    // eslint-disable-next-line no-console
    console.error("[public/mocks] Failed to load mock library — did you fully restart `npm run dev`?", err);
    return NextResponse.json({ error: "Couldn't load the mock library." }, { status: 500 });
  }
}
