import { useEffect, useRef } from "preact/hooks";

import { getString } from "../../utils/locale";
import type { WatchFont, WatchTextWidthId, WatchTheme } from "../watch-prefs";
import {
  WATCH_FONT_SIZE_STEPS,
  WATCH_LINE_SPACING_STEPS,
  WATCH_TEXT_WIDTH_STEPS,
} from "../watch-prefs";

export interface DisplaySettingsPopoverProps {
  font: WatchFont;
  fontSizeIndex: number;
  lineSpacingIndex: number;
  textWidthIndex: number;
  textWidthId: WatchTextWidthId;
  theme: WatchTheme;
  paragraphMode: boolean;
  onFont: (font: WatchFont) => void;
  onFontSizeIndex: (index: number) => void;
  onLineSpacingIndex: (index: number) => void;
  onTextWidthIndex: (index: number) => void;
  onTheme: (theme: WatchTheme) => void;
  onParagraphMode: (enabled: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}

function textWidthLabel(id: WatchTextWidthId): string {
  switch (id) {
    case "narrow":
      return getString("watch-display-width-narrow");
    case "medium":
      return getString("watch-display-width-medium");
    case "wide":
      return getString("watch-display-width-wide");
    case "x-large":
      return getString("watch-display-width-x-large");
    case "xx-large":
      return getString("watch-display-width-xx-large");
  }
}

function TextWidthIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      className="yt-watch-display-width-icon"
    >
      <rect
        x="3"
        y="3.5"
        width="12"
        height="1.6"
        rx="0.7"
        fill="currentColor"
      />
      <rect x="4.5" y="7" width="9" height="1.6" rx="0.7" fill="currentColor" />
      <rect
        x="3.5"
        y="10.5"
        width="11"
        height="1.6"
        rx="0.7"
        fill="currentColor"
      />
      <path
        d="M4 14.75h10M4 14.75l1.4-1.3M4 14.75l1.4 1.3M14 14.75l-1.4-1.3M14 14.75l-1.4 1.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
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
  textWidthIndex,
  textWidthId,
  theme,
  paragraphMode,
  onFont,
  onFontSizeIndex,
  onLineSpacingIndex,
  onTextWidthIndex,
  onTheme,
  onParagraphMode,
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
  const widthMax = WATCH_TEXT_WIDTH_STEPS.length - 1;

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

      <div
        className="yt-watch-display-theme"
        role="radiogroup"
        aria-label={getString("watch-display-theme")}
      >
        {(
          [
            ["light", "watch-display-theme-light"],
            ["sepia", "watch-display-theme-sepia"],
            ["dark", "watch-display-theme-dark"],
          ] as const
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            className={`yt-watch-display-theme-card theme-${id}${
              theme === id ? " selected" : ""
            }`}
            onClick={() => onTheme(id)}
          >
            <span className="yt-watch-display-theme-sample" aria-hidden="true">
              Aa
            </span>
            <span className="yt-watch-display-theme-label">
              {getString(labelKey)}
            </span>
          </button>
        ))}
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
            onFontSizeIndex(Number((e.currentTarget as HTMLInputElement).value))
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

      <div className="yt-watch-display-width">
        <span className="yt-watch-display-width-label">
          <TextWidthIcon />
          <span>{getString("watch-display-width")}</span>
        </span>
        <span className="yt-watch-display-width-value">
          {textWidthLabel(textWidthId)}
        </span>
        <div className="yt-watch-display-width-stepper">
          <button
            type="button"
            className="yt-watch-display-width-step"
            aria-label={getString("watch-display-width-narrower")}
            disabled={textWidthIndex <= 0}
            onClick={() => onTextWidthIndex(textWidthIndex - 1)}
          >
            −
          </button>
          <button
            type="button"
            className="yt-watch-display-width-step"
            aria-label={getString("watch-display-width-wider")}
            disabled={textWidthIndex >= widthMax}
            onClick={() => onTextWidthIndex(textWidthIndex + 1)}
          >
            +
          </button>
        </div>
      </div>

      <label className="yt-watch-display-paragraph">
        <input
          type="checkbox"
          checked={paragraphMode}
          onChange={(event) =>
            onParagraphMode((event.currentTarget as HTMLInputElement).checked)
          }
        />
        <span>{getString("watch-display-paragraph")}</span>
      </label>
    </div>
  );
}
