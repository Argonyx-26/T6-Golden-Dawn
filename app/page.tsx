// "/" forwards to the static scroll-scrubbed landing page (public/landing.html).
// Static export can't use next.config redirects, so a meta refresh does it — no JS needed.
// The patient list lives at /patients.
export default function Root() {
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/landing.html" />
      <p className="p-6 text-center">
        <a href="/landing.html" className="btn btn-ghost">Continue to OraTrace</a>
      </p>
    </>
  );
}
