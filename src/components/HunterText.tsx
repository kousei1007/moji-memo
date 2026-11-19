import { memo, useMemo } from "react";
import { GLYPHS, parseUnits, type Unit } from "@/lib/glyphs";

const MARK_WIDTH = 24;

export function GlyphSvg({ unit, size }: { unit: Extract<Unit, { kind: "glyph" }>; size: number }) {
  const glyph = GLYPHS[unit.base];
  const width = 100 + (unit.mark ? MARK_WIDTH : 0);
  const px = unit.small ? size * 0.62 : size;
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      width={(px * width) / 100}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph.d && <path d={glyph.d} />}
      {glyph.rings?.map(([cx, cy, r], i) => <circle key={`r${i}`} cx={cx} cy={cy} r={r} />)}
      {glyph.dots?.map(([cx, cy, r], i) => (
        <circle key={`d${i}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />
      ))}
      {unit.mark === "dakuten" && <circle cx={110} cy={86} r={9} fill="currentColor" stroke="none" />}
      {unit.mark === "handakuten" && <circle cx={110} cy={84} r={8} strokeWidth={6} />}
    </svg>
  );
}

type Props = {
  /** Hiragana text to draw. */
  kana: string;
  /** Glyph height in px. */
  size?: number;
  /** Show the hiragana under each glyph. */
  showReading?: boolean;
  /** Draw only the first line, cut to this many units (for list previews). */
  maxUnits?: number;
  className?: string;
};

function HunterText({ kana, size = 32, showReading = false, maxUnits, className = "" }: Props) {
  const lines = useMemo(() => {
    const all = kana.split("\n").map(parseUnits);
    if (maxUnits === undefined) return all;
    const first = all.find((l) => l.length > 0) ?? [];
    return [first.slice(0, maxUnits)];
  }, [kana, maxUnits]);

  const gap = Math.max(2, size * 0.14);
  const readingSize = Math.max(9, Math.min(13, size * 0.34));

  return (
    // The drawn glyphs are decorative for assistive tech; the reading is exposed as the label.
    <div className={className} role="img" aria-label={maxUnits === undefined ? kana : kana.split("\n")[0]}>
      {lines.map((units, li) => (
        <div
          key={li}
          className="flex flex-wrap items-end"
          style={{ gap: `${gap * 1.6}px ${gap}px`, minHeight: size, marginBottom: gap * 1.6 }}
        >
          {units.map((unit, i) => {
            if (unit.kind === "space") return <span key={i} style={{ width: size * 0.5 }} />;
            if (unit.kind === "text") {
              return (
                <span
                  key={i}
                  className="inline-flex items-center self-start"
                  style={{ fontSize: size * 0.7, height: size, lineHeight: 1 }}
                >
                  {unit.text}
                </span>
              );
            }
            return (
              <span key={i} className="inline-flex flex-col items-center justify-end">
                <GlyphSvg unit={unit} size={size} />
                {showReading && (
                  <span className="text-on-surface-variant leading-tight select-none" style={{ fontSize: readingSize }}>
                    {unit.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default memo(HunterText);
