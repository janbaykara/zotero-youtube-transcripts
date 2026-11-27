import { useCallback, useState } from "preact/hooks";

import { getPref, setPref } from "../utils/prefs";

export type WatchFont = "serif" | "sans";
export type WatchTheme = "light" | "sepia" | "dark";

/** Discrete caption font sizes (px). Default index 4 (~60%) → 18. */
export const WATCH_FONT_SIZE_STEPS = [14, 15, 16, 17, 18, 20, 24] as const;

/** Discrete line-heights. Default index 2 → 1.45. */
export const WATCH_LINE_SPACING_STEPS = [1.2, 1.35, 1.45, 1.65, 1.9] as const;

/** Caption column max-widths (rem). Default index 2 → 48. */
export const WATCH_TEXT_WIDTH_STEPS = [
  { id: "narrow", rem: 38 },
  { id: "medium", rem: 44 },
  { id: "wide", rem: 48 },
  { id: "x-large", rem: 60 },
  { id: "xx-large", rem: 80 },
] as const;

export type WatchTextWidthId = (typeof WATCH_TEXT_WIDTH_STEPS)[number]["id"];

export const WATCH_DISPLAY_DEFAULTS = {
  font: "serif" as WatchFont,
  fontSizeIndex: 4,
  lineSpacingIndex: 2,
  textWidthIndex: 2,
  theme: "dark" as WatchTheme,
  paragraphMode: true,
};

function clampPercent(raw: number): number {
  if (!Number.isFinite(raw)) return 50;
  return Math.min(85, Math.max(15, Math.round(raw)));
}

function clampIndex(raw: number, max: number, fallback: number): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(0, Math.round(raw)));
}

function parseFont(raw: unknown): WatchFont {
  return raw === "sans" ? "sans" : "serif";
}

function parseTheme(raw: unknown): WatchTheme {
  if (raw === "light" || raw === "sepia" || raw === "dark") return raw;
  return WATCH_DISPLAY_DEFAULTS.theme;
}

export function useWatchAutoscroll() {
  const [value, setValueState] = useState(() => {
    const raw = getPref("watchAutoscroll");
    // Default on when unset — Boolean(undefined) would wrongly yield false.
    return raw == null ? true : Boolean(raw);
  });

  const setValue = useCallback((next: boolean) => {
    setPref("watchAutoscroll", next);
    setValueState(next);
  }, []);

  return [value, setValue] as const;
}

/** Split ratio 0.15–0.85, backed by an integer percent pref. */
export function useWatchSplitRatio() {
  const [percent, setPercent] = useState(() =>
    clampPercent(Number(getPref("watchSplitPercent"))),
  );

  const setValue = useCallback((nextRatio: number) => {
    const next = clampPercent(nextRatio * 100);
    setPref("watchSplitPercent", next);
    setPercent(next);
  }, []);

  return [percent / 100, setValue] as const;
}

export function useWatchDisplaySettings() {
  const [font, setFontState] = useState<WatchFont>(() =>
    parseFont(getPref("watchFont")),
  );
  const [fontSizeIndex, setFontSizeIndexState] = useState(() =>
    clampIndex(
      Number(getPref("watchFontSize")),
      WATCH_FONT_SIZE_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.fontSizeIndex,
    ),
  );
  const [lineSpacingIndex, setLineSpacingIndexState] = useState(() =>
    clampIndex(
      Number(getPref("watchLineSpacing")),
      WATCH_LINE_SPACING_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.lineSpacingIndex,
    ),
  );
  const [theme, setThemeState] = useState<WatchTheme>(() =>
    parseTheme(getPref("watchTheme")),
  );
  const [textWidthIndex, setTextWidthIndexState] = useState(() =>
    clampIndex(
      Number(getPref("watchTextWidth")),
      WATCH_TEXT_WIDTH_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.textWidthIndex,
    ),
  );
  const [paragraphMode, setParagraphModeState] = useState(() => {
    const raw = getPref("watchParagraphMode");
    return raw == null ? WATCH_DISPLAY_DEFAULTS.paragraphMode : Boolean(raw);
  });

  const setFont = useCallback((next: WatchFont) => {
    setPref("watchFont", next);
    setFontState(next);
  }, []);

  const setFontSizeIndex = useCallback((next: number) => {
    const clamped = clampIndex(
      next,
      WATCH_FONT_SIZE_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.fontSizeIndex,
    );
    setPref("watchFontSize", clamped);
    setFontSizeIndexState(clamped);
  }, []);

  const setLineSpacingIndex = useCallback((next: number) => {
    const clamped = clampIndex(
      next,
      WATCH_LINE_SPACING_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.lineSpacingIndex,
    );
    setPref("watchLineSpacing", clamped);
    setLineSpacingIndexState(clamped);
  }, []);

  const setTheme = useCallback((next: WatchTheme) => {
    setPref("watchTheme", next);
    setThemeState(next);
  }, []);

  const setTextWidthIndex = useCallback((next: number) => {
    const clamped = clampIndex(
      next,
      WATCH_TEXT_WIDTH_STEPS.length - 1,
      WATCH_DISPLAY_DEFAULTS.textWidthIndex,
    );
    setPref("watchTextWidth", clamped);
    setTextWidthIndexState(clamped);
  }, []);

  const setParagraphMode = useCallback((next: boolean) => {
    setPref("watchParagraphMode", next);
    setParagraphModeState(next);
  }, []);

  const clear = useCallback(() => {
    setFont(WATCH_DISPLAY_DEFAULTS.font);
    setFontSizeIndex(WATCH_DISPLAY_DEFAULTS.fontSizeIndex);
    setLineSpacingIndex(WATCH_DISPLAY_DEFAULTS.lineSpacingIndex);
    setTextWidthIndex(WATCH_DISPLAY_DEFAULTS.textWidthIndex);
    setTheme(WATCH_DISPLAY_DEFAULTS.theme);
    setParagraphMode(WATCH_DISPLAY_DEFAULTS.paragraphMode);
  }, [
    setFont,
    setFontSizeIndex,
    setLineSpacingIndex,
    setTextWidthIndex,
    setTheme,
    setParagraphMode,
  ]);

  const textWidth = WATCH_TEXT_WIDTH_STEPS[textWidthIndex];

  return {
    font,
    fontSizeIndex,
    lineSpacingIndex,
    textWidthIndex,
    theme,
    paragraphMode,
    fontSizePx: WATCH_FONT_SIZE_STEPS[fontSizeIndex],
    lineHeight: WATCH_LINE_SPACING_STEPS[lineSpacingIndex],
    textWidthRem: textWidth.rem,
    textWidthId: textWidth.id,
    setFont,
    setFontSizeIndex,
    setLineSpacingIndex,
    setTextWidthIndex,
    setTheme,
    setParagraphMode,
    clear,
  };
}
