import { useEffect, useRef } from "preact/hooks";

import { getString } from "../../utils/locale";
import type { WatchFont } from "../watch-prefs";
import {
  WATCH_FONT_SIZE_STEPS,
  WATCH_LINE_SPACING_STEPS,
} from "../watch-prefs";

export interface DisplaySettingsPopoverProps {
  font: WatchFont;
  fontSizeIndex: number;
  lineSpacingIndex: number;
  onFont: (font: WatchFont) => void;
  onFontSizeIndex: (index: number) => void;
  onLineSpacingIndex: (index: number) => void;
  onClear: () => void;
  onClose: () => void;
}

function LineSpacingIcon({ density }: { density: number }) {
  // density 0 = tightest, 4 = loosest
  const gap = 2.4 + density * 1.35;
  const start = (18 - (2 * gap + 1.75)) / 2;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="yt-watch-display-spacing-icon"
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x="3"
          y={start + i * gap}
          width="12"
          height="1.75"
          rx="0.75"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function DisplaySettingsPopover({
  font,
  fontSizeIndex,
  lineSpacingIndex,
  onFont,
  onFontSizeIndex,
  onLineSpacingIndex,
  onClear,
  onClose,
}: DisplaySettingsPopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const root = rootRef.current;
      if (root?.contains(target)) return;
      const controls = (target as Element).closest?.(
        ".yt-watch-float-controls",
      );
      if (controls) return;
      onClose();
    };
    const doc = rootRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKey, true);
    doc.addEventListener("pointerdown", onPointer, true);
    return () => {
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const sizeMax = WATCH_FONT_SIZE_STEPS.length - 1;

  return (
    <div
      ref={rootRef}
      className="yt-watch-display-popover"
      role="dialog"
      aria-label={getString("watch-display-settings")}
    >
      <div className="yt-watch-display-header">
        <span className="yt-watch-display-title">
          {getString("watch-display-settings")}
        </span>
        <button
          type="button"
          className="yt-watch-display-clear"
          onClick={onClear}
        >
          {getString("watch-display-clear")}
        </button>
      </div>

      <div className="yt-watch-display-fonts" role="radiogroup">
        <button
          type="button"
          role="radio"
          aria-checked={font === "serif"}
          className={`yt-watch-display-font${
            font === "serif" ? " selected" : ""
          } serif`}
          onClick={() => onFont("serif")}
        >
          <span className="yt-watch-display-font-sample" aria-hidden="true">
            Aa
          </span>
          <span className="yt-watch-display-font-label">
            {getString("watch-display-font-serif")}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={font === "sans"}
          className={`yt-watch-display-font${
            font === "sans" ? " selected" : ""
          } sans`}
          onClick={() => onFont("sans")}
        >
          <span className="yt-watch-display-font-sample" aria-hidden="true">
            Aa
          </span>
          <span className="yt-watch-display-font-label">
            {getString("watch-display-font-sans")}
          </span>
        </button>
      </div>

      <div className="yt-watch-display-size">
        <span className="yt-watch-display-size-a small" aria-hidden="true">
          A
        </span>
        <input
          type="range"
          className="yt-watch-display-size-slider"
          min={0}
          max={sizeMax}
          step={1}
          value={fontSizeIndex}
          aria-label={getString("watch-display-size")}
          aria-valuetext={`${WATCH_FONT_SIZE_STEPS[fontSizeIndex]}px`}
          onInput={(e) =>
            onFontSizeIndex(
              Number((e.currentTarget as HTMLInputElement).value),
            )
          }
        />
        <span className="yt-watch-display-size-a large" aria-hidden="true">
          A
        </span>
      </div>

      <div
        className="yt-watch-display-spacing"
        role="radiogroup"
        aria-label={getString("watch-display-spacing")}
      >
        {WATCH_LINE_SPACING_STEPS.map((_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={lineSpacingIndex === i}
            className={`yt-watch-display-spacing-btn${
              lineSpacingIndex === i ? " selected" : ""
            }`}
            onClick={() => onLineSpacingIndex(i)}
            title={`${WATCH_LINE_SPACING_STEPS[i]}`}
          >
            <LineSpacingIcon density={i} />
          </button>
        ))}
      </div>
    </div>
  );
}
