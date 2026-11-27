import { useEffect, useRef } from "preact/hooks";

import { getString } from "../../utils/locale";

export interface TranscriptFindBarProps {
  query: string;
  matchIndex: number;
  matchCount: number;
  /** Bumped on each Cmd/Ctrl-F to re-focus and select the input. */
  focusToken: number;
  onQueryChange: (query: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function TranscriptFindBar({
  query,
  matchIndex,
  matchCount,
  focusToken,
  onQueryChange,
  onPrev,
  onNext,
  onClose,
}: TranscriptFindBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [focusToken]);

  const status =
    !query.trim()
      ? ""
      : matchCount === 0
        ? getString("watch-find-none")
        : getString("watch-find-matches", {
            args: {
              current: matchIndex + 1,
              total: matchCount,
            },
          });

  return (
    <div className="yt-watch-find-bar" role="search">
      <input
        ref={inputRef}
        type="search"
        className="yt-watch-find-input"
        value={query}
        placeholder={getString("watch-find-placeholder")}
        aria-label={getString("watch-find-placeholder")}
        onInput={(event) =>
          onQueryChange((event.currentTarget as HTMLInputElement).value)
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <span className="yt-watch-find-status" aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        className="yt-watch-find-nav"
        title={getString("watch-find-prev")}
        aria-label={getString("watch-find-prev")}
        disabled={matchCount === 0}
        onClick={onPrev}
      >
        ↑
      </button>
      <button
        type="button"
        className="yt-watch-find-nav"
        title={getString("watch-find-next")}
        aria-label={getString("watch-find-next")}
        disabled={matchCount === 0}
        onClick={onNext}
      >
        ↓
      </button>
      <button
        type="button"
        className="yt-watch-find-close"
        title={getString("watch-find-close")}
        aria-label={getString("watch-find-close")}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
