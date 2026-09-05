"use client";

/**
 * Minimal markdown renderer for Coach responses — no external dependency
 * (npm installs aren't something I can run on your machine from here, so
 * this stays hand-rolled). Handles exactly what the Coach prompt actually
 * produces: "## " headers, "- " bullets, blank-line paragraph breaks, and
 * **bold** spans (including arrows like 83% → 15% written as plain text,
 * which need no special handling).
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-brand-navy">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function CoachMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-2">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-sm text-brand-navy leading-relaxed">
            {renderInline(item, `${key}-${i}`)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flushList(`ul-${idx}`);
      blocks.push(
        <h3 key={idx} className="font-bold text-brand-navy text-sm mt-4 mb-1.5 first:mt-0">
          {renderInline(line.slice(3), `h-${idx}`)}
        </h3>
      );
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      listBuffer.push(line.slice(2));
    } else if (line.length === 0) {
      flushList(`ul-${idx}`);
    } else {
      flushList(`ul-${idx}`);
      blocks.push(
        <p key={idx} className="text-sm text-brand-navy leading-relaxed mb-1.5">
          {renderInline(line, `p-${idx}`)}
        </p>
      );
    }
  });
  flushList("ul-end");

  return <div>{blocks}</div>;
}
