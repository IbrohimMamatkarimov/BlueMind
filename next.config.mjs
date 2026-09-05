/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Next 14's client-side router cache keeps a page's last-rendered
    // output around and reuses it on the next visit instead of refetching
    // – great for a static marketing site, actively wrong here, where
    // content changes constantly (admin edits a question, a student
    // submits a module, a mock's question count changes) and the old
    // cached render was showing up until an unrelated navigation happened
    // to evict it. Setting both to 0 makes every navigation always fetch
    // fresh, matching what people actually expect from this app.
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  async headers() {
    return [
      {
        // Every route EXCEPT the hashed, versioned build assets under
        // /_next/static and /_next/image (those are safe — and good — to
        // cache forever, since their filename itself changes on every
        // build). This is the actual document/page response: without an
        // explicit no-store here, a browser or an intermediary edge/CDN
        // (e.g. in front of a Render deployment) can hang onto an old
        // deployment's HTML after a new one ships. That old HTML still
        // references the PREVIOUS build's JS chunk filenames, so the page
        // renders looking old until some client-side interaction (which
        // triggers a real fetch, bypassing the stale cached document)
        // pulls in the current build and it "snaps" to the right version —
        // exactly the symptom this fixes.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
