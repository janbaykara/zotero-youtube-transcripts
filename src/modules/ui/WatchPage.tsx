import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { chromeSkinUrl } from "@janbaykara/zotero-chrome";

import type { EmbeddedTranscriptData } from "../../transcript/embedded-data";
import { getString } from "../../utils/locale";
import {
  createTranscriptHighlights,
  deleteTranscriptHighlight,
  isHighlightDescriptionsActive,
  updateTranscriptHighlight,
  type SelectionAnchor,
  type TranscriptHighlight,
  type TranscriptSelectionRange,
} from "../transcript-annotations";
import {
  ensureTranscriptAttachment,
  getCachedRegularItem,
} from "../transcript-attachment";
import {
  clampMatchIndex,
  findTranscriptMatches,
  nextMatchIndex,
  prevMatchIndex,
} from "../transcript-find";
import {
  invalidateAttachmentHighlights,
  setWatchTranscriptBlocks,
  useAttachmentHighlights,
} from "../watch-highlights-state";
import {
  useWatchAutoscroll,
  useWatchDisplaySettings,
  useWatchSplitRatio,
} from "../watch-prefs";
import {
  bindWatchTabAudio,
  setWatchTabAudioStatus,
  unbindWatchTabAudio,
} from "../watch-tab-audio";
import { watchTabId } from "../watch-tab";
import { subscribeWatchSeek, takePendingWatchSeek } from "../watch-seek";
import { DisplaySettingsPopover } from "./DisplaySettingsPopover";
import { HighlightPopover } from "./HighlightPopover";
import { TranscriptFindBar } from "./TranscriptFindBar";
import { TranscriptPane } from "./TranscriptPane";
import { YouTubePlayer, type YouTubePlayerHandle } from "./YouTubePlayer";

interface WatchPageProps {
  itemID: number;
}

export function WatchPage({ itemID }: WatchPageProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmbeddedTranscriptData | null>(null);
  const [attachmentID, setAttachmentID] = useState<number | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [jumpToken, setJumpToken] = useState(0);
  const [autoscrollPref, setAutoscrollPref] = useWatchAutoscroll();
  /** Manual scroll pauses follow for this tab mount without writing the pref. */
  const [autoscrollPaused, setAutoscrollPaused] = useState(false);
  const autoscroll = autoscrollPref && !autoscrollPaused;
  const [splitRatio, setSplitRatio] = useWatchSplitRatio();
  const display = useWatchDisplaySettings();
  const [displayOpen, setDisplayOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [findFocusToken, setFindFocusToken] = useState(0);
  /**
   * Sticky create session: survives live-selection collapse between pointerup
   * and colour pick so multi-line ranges are not lost.
   */
  const [createSession, setCreateSession] = useState<{
    anchor: SelectionAnchor;
    ranges: TranscriptSelectionRange[];
  } | null>(null);
  const createSessionRef = useRef<{
    anchor: SelectionAnchor;
    ranges: TranscriptSelectionRange[];
  } | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{
    highlight: TranscriptHighlight;
    anchor: SelectionAnchor;
  } | null>(null);
  const [highlightBusy, setHighlightBusy] = useState(false);
  const playerRef = useRef<YouTubePlayerHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const transcriptSectionRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setAutoscrollPaused(false);
    createSessionRef.current = null;
    setCreateSession(null);
    setEditingHighlight(null);

    void (async () => {
      const item = getCachedRegularItem(itemID);
      if (!item) {
        if (!cancelled) {
          setStatus("error");
          setError(getString("watch-error-item"));
        }
        return;
      }
      const ensured = await ensureTranscriptAttachment(item);
      if (cancelled) return;
      if (!ensured) {
        setStatus("error");
        setError(getString("watch-error-transcript"));
        return;
      }
      setData(ensured.data);
      setAttachmentID(ensured.attachment.id);
      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [itemID]);

  // One row per caption line so the highlight tracks speech closely.
  const blocks = useMemo(() => {
    if (!data) return [];
    return data.lines
      .filter((line) => line.text.trim().length > 0)
      .map((line) => ({
        quote: line.text,
        quoteTimeOffset: line.offset,
        durationMs: line.duration,
      }));
  }, [data]);

  useEffect(() => {
    if (attachmentID == null) return;
    setWatchTranscriptBlocks(attachmentID, blocks);
  }, [attachmentID, blocks]);

  const highlights = useAttachmentHighlights(attachmentID);
  const libraryID = useMemo(() => {
    if (attachmentID == null) return null;
    try {
      return Zotero.Items.get(attachmentID)?.libraryID ?? null;
    } catch {
      return null;
    }
  }, [attachmentID]);

  const findMatches = useMemo(
    () => (findOpen ? findTranscriptMatches(blocks, findQuery) : []),
    [findOpen, blocks, findQuery],
  );

  useEffect(() => {
    setMatchIndex((prev) => clampMatchIndex(prev, findMatches.length));
  }, [findMatches]);

  const openFind = useCallback(() => {
    setFindOpen(true);
    setFindFocusToken((n) => n + 1);
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setMatchIndex(0);
  }, []);

  const goNextMatch = useCallback(() => {
    setMatchIndex((prev) => nextMatchIndex(prev, findMatches.length));
  }, [findMatches.length]);

  const goPrevMatch = useCallback(() => {
    setMatchIndex((prev) => prevMatchIndex(prev, findMatches.length));
  }, [findMatches.length]);

  // Cmd/Ctrl-F find bar (document capture so the YouTube player cannot steal it).
  useEffect(() => {
    if (status !== "ready") return;
    const root = rootRef.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const tabId = watchTabId(itemID);

    const isThisTabSelected = () => {
      try {
        const win = Zotero.getMainWindow();
        const selected = (
          win?.Zotero_Tabs as unknown as { selectedID?: string } | undefined
        )?.selectedID;
        return selected === tabId;
      } catch {
        return true;
      }
    };

    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as
        | (EventTarget & { closest?: (s: string) => Element | null })
        | null;
      if (!el?.closest) return false;
      return !!el.closest(
        "textarea, input, editable-text, [contenteditable='true']",
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isThisTabSelected()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        event.stopPropagation();
        openFind();
        return;
      }
      // Space toggles playback (starts a cold player), unless typing in a field.
      if (
        !mod &&
        !event.altKey &&
        (event.key === " " || event.code === "Space")
      ) {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        playerRef.current?.toggle();
        return;
      }
      if (!findOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFind();
        return;
      }
      if (event.key === "F3") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) goPrevMatch();
        else goNextMatch();
      }
    };

    doc.addEventListener("keydown", onKeyDown, true);
    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    status,
    itemID,
    findOpen,
    openFind,
    closeFind,
    goNextMatch,
    goPrevMatch,
  ]);

  const onTimeUpdate = useCallback((seconds: number) => {
    const ms = Math.max(0, seconds * 1000);
    setCurrentTimeMs((prev) => (Math.abs(prev - ms) < 120 ? prev : ms));
  }, []);

  const onPlayingChange = useCallback(
    (playing: boolean) => {
      setWatchTabAudioStatus(watchTabId(itemID), {
        active: true,
        paused: !playing,
      });
    },
    [itemID],
  );

  // Tab-bar play/pause (Reader-style audioStatus control).
  useEffect(() => {
    if (status !== "ready") return;
    const tabId = watchTabId(itemID);
    bindWatchTabAudio(tabId, {
      toggle: () => playerRef.current?.toggle(),
    });
    setWatchTabAudioStatus(tabId, { active: true, paused: true });
    return () => {
      unbindWatchTabAudio(tabId);
    };
  }, [itemID, status]);

  const onSeek = useCallback((offsetMs: number) => {
    const seconds = Math.max(0, offsetMs / 1000);
    // Cue / timestamp clicks always seek and play (incl. when paused / cold).
    playerRef.current?.seekTo(seconds, { play: true });
    setCurrentTimeMs(offsetMs);
  }, []);

  // Seek requests from HTML timestamp / watch-protocol links.
  const [externalSeekMs, setExternalSeekMs] = useState<number | null>(null);

  useEffect(() => {
    const pending = takePendingWatchSeek(itemID);
    if (pending != null) setExternalSeekMs(pending);
    return subscribeWatchSeek((id, ms) => {
      if (id !== itemID) return;
      takePendingWatchSeek(itemID);
      setExternalSeekMs(ms);
    });
  }, [itemID]);

  useEffect(() => {
    if (externalSeekMs == null || status !== "ready") return;
    const ms = externalSeekMs;
    setExternalSeekMs(null);

    const win = Zotero.getMainWindow();
    let tries = 0;
    const attempt = () => {
      if (playerRef.current) {
        onSeek(ms);
        setJumpToken((n) => n + 1);
        return;
      }
      if (!win || tries++ >= 40) {
        // Player never attached — still update transcript highlight position.
        setCurrentTimeMs(ms);
        setJumpToken((n) => n + 1);
        return;
      }
      win.setTimeout(attempt, 100);
    };
    attempt();
  }, [externalSeekMs, status, onSeek]);

  const openInReader = useCallback(() => {
    if (attachmentID == null) return;
    const pane = Zotero.getActiveZoteroPane();
    void pane?.viewAttachment([attachmentID]);
  }, [attachmentID]);

  const clearCreateSession = useCallback(() => {
    createSessionRef.current = null;
    setCreateSession(null);
  }, []);

  const onHighlightCreate = useCallback(
    async (color: string, comment: string, tags: string[]) => {
      if (attachmentID == null || highlightBusy) return;
      const root = rootRef.current;
      const pane = root?.querySelector(
        ".yt-watch-transcript-pane",
      ) as HTMLElement | null;
      if (!pane) return;

      // Frozen at session open — never re-read the live DOM selection here.
      const ranges = createSessionRef.current?.ranges ?? [];
      if (ranges.length === 0) return;
      ztoolkit.log(
        "WatchPage: highlight ranges",
        ranges.map((r) => ({
          t: r.lineOffsetMs,
          start: r.start,
          end: r.end,
          text: r.text.slice(0, 40),
        })),
      );

      const attachment = Zotero.Items.get(attachmentID);
      if (!attachment) return;

      const anchor = createSessionRef.current?.anchor ?? null;
      const cleanedTags = tags
        .map((tag) => tag.replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const cleanedComment = comment.trim();
      setHighlightBusy(true);
      try {
        const created = await createTranscriptHighlights(
          attachment,
          ranges,
          color,
          { comment: cleanedComment, tags: cleanedTags },
        );
        ztoolkit.log(
          "WatchPage: created highlights",
          created.length,
          "of",
          ranges.length,
        );
        const win = pane.ownerDocument.defaultView;
        win?.getSelection()?.removeAllRanges();
        clearCreateSession();
        invalidateAttachmentHighlights(attachmentID);
        const item = created[0];
        if (item && anchor) {
          setEditingHighlight({
            highlight: {
              id: item.id,
              key: item.key,
              lineOffsetMs: ranges[0].lineOffsetMs,
              start: ranges[0].start,
              end: ranges[0].end,
              color,
              text: ranges.map((r) => r.text).join(" "),
              comment: cleanedComment,
              tags: cleanedTags,
            },
            anchor,
          });
        } else {
          setEditingHighlight(null);
        }
      } catch (err) {
        ztoolkit.log("WatchPage: highlight failed", err);
      } finally {
        setHighlightBusy(false);
      }
    },
    [attachmentID, highlightBusy, clearCreateSession],
  );

  const onMarkClick = useCallback(
    (highlight: TranscriptHighlight, anchor: SelectionAnchor) => {
      clearCreateSession();
      // Same as a timestamp / cue click — jump and play from this line.
      onSeek(highlight.lineOffsetMs);
      setEditingHighlight((prev) => {
        // Re-click is handled by the edit popover (save + close). If we still
        // get a click for the same mark, ignore so we don't reopen empty.
        if (prev?.highlight.id === highlight.id) return null;
        return { highlight, anchor };
      });
    },
    [clearCreateSession, onSeek],
  );

  const onEditColor = useCallback(
    async (color: string) => {
      if (!editingHighlight || highlightBusy) return;
      const id = editingHighlight.highlight.id;
      setHighlightBusy(true);
      try {
        await updateTranscriptHighlight(id, { color });
        setEditingHighlight((prev) =>
          prev ? { ...prev, highlight: { ...prev.highlight, color } } : prev,
        );
        if (attachmentID != null) {
          invalidateAttachmentHighlights(attachmentID);
        }
      } catch (err) {
        ztoolkit.log("WatchPage: recolor failed", err);
      } finally {
        setHighlightBusy(false);
      }
    },
    [attachmentID, editingHighlight, highlightBusy],
  );

  const editingHighlightIdRef = useRef<number | null>(null);
  editingHighlightIdRef.current = editingHighlight?.highlight.id ?? null;

  const onEditComment = useCallback(
    async (comment: string) => {
      // Prefer ref — onClose may clear editingHighlight in the same turn.
      const id = editingHighlightIdRef.current;
      if (id == null) return;
      try {
        await updateTranscriptHighlight(id, { comment });
        setEditingHighlight((prev) =>
          prev && prev.highlight.id === id
            ? { ...prev, highlight: { ...prev.highlight, comment } }
            : prev,
        );
        if (attachmentID != null) {
          invalidateAttachmentHighlights(attachmentID);
        }
      } catch (err) {
        ztoolkit.log("WatchPage: comment failed", err);
      }
    },
    [attachmentID],
  );

  const onEditTags = useCallback(
    (tags: string[]) => {
      // Native tags-box already persisted via item.saveTx.
      const id = editingHighlightIdRef.current;
      if (id == null) return;
      setEditingHighlight((prev) =>
        prev && prev.highlight.id === id
          ? { ...prev, highlight: { ...prev.highlight, tags } }
          : prev,
      );
      if (attachmentID != null) {
        invalidateAttachmentHighlights(attachmentID);
      }
    },
    [attachmentID],
  );

  const onRemoveHighlight = useCallback(async () => {
    if (!editingHighlight || highlightBusy || attachmentID == null) return;
    const id = editingHighlight.highlight.id;
    setHighlightBusy(true);
    try {
      setEditingHighlight(null);
      await deleteTranscriptHighlight(id);
      invalidateAttachmentHighlights(attachmentID);
    } catch (err) {
      ztoolkit.log("WatchPage: remove highlight failed", err);
    } finally {
      setHighlightBusy(false);
    }
  }, [attachmentID, editingHighlight, highlightBusy]);

  const onSelectionAnchorChange = useCallback(
    (publish: {
      anchor: SelectionAnchor | null;
      ranges?: TranscriptSelectionRange[];
      resetPending?: boolean;
    }) => {
      if (publish.resetPending) {
        if (createSessionRef.current) {
          createSessionRef.current = null;
          setCreateSession(null);
        }
        return;
      }

      const ranges = publish.ranges;
      const anchor = publish.anchor;
      if (!anchor || !ranges || ranges.length === 0) return;

      const prev = createSessionRef.current;
      if (
        prev &&
        prev.anchor.clientX === anchor.clientX &&
        prev.anchor.clientY === anchor.clientY &&
        prev.ranges.length === ranges.length &&
        prev.ranges.every(
          (r, i) =>
            r.lineOffsetMs === ranges[i].lineOffsetMs &&
            r.start === ranges[i].start &&
            r.end === ranges[i].end,
        )
      ) {
        return;
      }

      const next = { anchor, ranges };
      createSessionRef.current = next;
      setCreateSession(next);
      setEditingHighlight(null);
    },
    [],
  );

  const popoverPos = (() => {
    const anchor = editingHighlight?.anchor ?? createSession?.anchor ?? null;
    if (!anchor || !transcriptSectionRef.current) return null;
    const host = transcriptSectionRef.current.getBoundingClientRect();
    const listed = isHighlightDescriptionsActive();
    const popoverW = listed
      ? editingHighlight
        ? 280
        : 220
      : editingHighlight
        ? 260
        : 196;
    const popoverH = listed
      ? editingHighlight
        ? 380
        : 230
      : editingHighlight
        ? 260
        : 36;
    let left = anchor.clientX - host.left;
    let top = anchor.clientY - host.top - (editingHighlight ? 0 : popoverH / 2);

    if (left + popoverW > host.width - 8) {
      left = Math.max(8, anchor.clientX - host.left - popoverW - 16);
    }
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    if (top + popoverH > host.height - 8) {
      top = Math.max(8, host.height - popoverH - 8);
    }
    return { left, top };
  })();

  // Keep edit popup bound to the latest highlight data after refresh.
  useEffect(() => {
    if (!editingHighlight) return;
    const fresh = highlights.find(
      (h) => h.id === editingHighlight.highlight.id,
    );
    if (!fresh) {
      setEditingHighlight(null);
      return;
    }
    if (fresh !== editingHighlight.highlight) {
      setEditingHighlight((prev) =>
        prev ? { ...prev, highlight: fresh } : prev,
      );
    }
  }, [highlights, editingHighlight]);

  const onSplitterPointerDown = useCallback(
    (event: PointerEvent) => {
      event.preventDefault();
      const root = rootRef.current;
      if (!root) return;
      draggingRef.current = true;

      const onMove = (ev: PointerEvent) => {
        if (!draggingRef.current) return;
        const rect = root.getBoundingClientRect();
        if (rect.height <= 0) return;
        const splitter = root.querySelector(
          ".yt-watch-splitter",
        ) as HTMLElement | null;
        const splitterH = splitter?.offsetHeight ?? 12;
        const usable = rect.height - splitterH;
        if (usable <= 0) return;
        const y = ev.clientY - rect.top;
        setSplitRatio(y / usable);
      };

      const onUp = () => {
        draggingRef.current = false;
        root.ownerDocument.removeEventListener("pointermove", onMove);
        root.ownerDocument.removeEventListener("pointerup", onUp);
      };

      root.ownerDocument.addEventListener("pointermove", onMove);
      root.ownerDocument.addEventListener("pointerup", onUp);
    },
    [setSplitRatio],
  );

  if (status === "loading") {
    return (
      <div
        className="yt-watch-root items-center justify-center p-6 text-secondary"
        style={{ fontSize: "14px" }}
      >
        {getString("watch-loading")}
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div
        className="yt-watch-root items-center justify-center p-6 text-primary"
        style={{ fontSize: "14px" }}
      >
        {error || getString("watch-error-transcript")}
      </div>
    );
  }

  const playerFlex = `${Math.round(splitRatio * 1000) / 10}%`;
  const iconJump = chromeSkinUrl("16/universal/location.svg");
  const iconFind = chromeSkinUrl("16/universal/magnifier.svg");
  const iconDisplay = chromeSkinUrl("20/universal/cog.svg");
  const iconItemPane = chromeSkinUrl("20/universal/sidebar.svg");
  const iconOpen = chromeSkinUrl("16/universal/view.svg");

  const openItemPane = useCallback(() => {
    const win = Zotero.getMainWindow();
    const context = (
      win as unknown as {
        ZoteroContextPane?: {
          collapsed?: boolean;
          togglePane?: () => void;
        };
      }
    )?.ZoteroContextPane;
    if (!context?.togglePane) return;
    try {
      const pane = Zotero.getActiveZoteroPane() as
        | {
            selectItem?: (
              id: number,
              options?: { noTabSwitch?: boolean },
            ) => unknown;
          }
        | undefined;
      void pane?.selectItem?.(itemID, { noTabSwitch: true });
    } catch {
      // Selection sync is best-effort; pane toggle still helps.
    }
    if (context.collapsed) {
      context.togglePane();
    }
  }, [itemID]);

  return (
    <div ref={rootRef} className={`yt-watch-root theme-${display.theme}`}>
      <div
        className="yt-watch-player-pane"
        style={{ flex: `0 0 ${playerFlex}` }}
      >
        <YouTubePlayer
          videoId={data.videoId}
          onTimeUpdate={onTimeUpdate}
          onPlayingChange={onPlayingChange}
          playerRef={playerRef}
        />
      </div>

      <div
        className="yt-watch-splitter"
        onPointerDown={onSplitterPointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize video and transcript"
        title="Drag to resize"
      />

      <div
        ref={transcriptSectionRef}
        className={`yt-watch-transcript-section text-width-${display.textWidthId}${
          display.paragraphMode ? " paragraph-mode" : ""
        }`}
        style={
          {
            "--yt-watch-font":
              display.font === "sans"
                ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
                : '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
            "--yt-watch-font-size": `${display.fontSizePx}px`,
            "--yt-watch-line-height": String(display.lineHeight),
            "--yt-watch-text-width": `${display.textWidthRem}rem`,
          } as Record<string, string>
        }
      >
        <div className="yt-watch-float-controls">
          <button
            type="button"
            className="yt-watch-tool-btn"
            onClick={openItemPane}
            title={getString("watch-item-pane")}
          >
            <img
              src={iconItemPane}
              alt=""
              width={14}
              height={14}
              className="yt-watch-icon-flip-x"
            />
            <span>{getString("watch-item-pane")}</span>
          </button>
          <button
            type="button"
            className="yt-watch-tool-btn"
            onClick={openInReader}
            title={getString("watch-open-reader")}
          >
            <img src={iconOpen} alt="" width={14} height={14} />
            <span>{getString("watch-open-reader")}</span>
          </button>
          <button
            type="button"
            className={`yt-watch-tool-btn${displayOpen ? " active" : ""}`}
            aria-expanded={displayOpen}
            aria-haspopup="dialog"
            onClick={() => setDisplayOpen((open) => !open)}
          >
            <img src={iconDisplay} alt="" width={14} height={14} />
            <span>{getString("watch-display")}</span>
          </button>
          {displayOpen ? (
            <DisplaySettingsPopover
              font={display.font}
              fontSizeIndex={display.fontSizeIndex}
              lineSpacingIndex={display.lineSpacingIndex}
              textWidthIndex={display.textWidthIndex}
              textWidthId={display.textWidthId}
              theme={display.theme}
              paragraphMode={display.paragraphMode}
              onFont={display.setFont}
              onFontSizeIndex={display.setFontSizeIndex}
              onLineSpacingIndex={display.setLineSpacingIndex}
              onTextWidthIndex={display.setTextWidthIndex}
              onTheme={display.setTheme}
              onParagraphMode={display.setParagraphMode}
              onClear={display.clear}
              onClose={() => setDisplayOpen(false)}
            />
          ) : null}
        </div>
        <div className="yt-watch-bottom-dock">
          {findOpen ? (
            <TranscriptFindBar
              query={findQuery}
              matchIndex={matchIndex}
              matchCount={findMatches.length}
              focusToken={findFocusToken}
              onQueryChange={(query) => {
                setFindQuery(query);
                setMatchIndex(0);
              }}
              onPrev={goPrevMatch}
              onNext={goNextMatch}
              onClose={closeFind}
            />
          ) : null}
          <div className="yt-watch-bottom-bar">
            <label
              className={`yt-watch-autoscroll-pill${
                autoscroll ? " active" : ""
              }`}
              title={getString("watch-autoscroll")}
            >
              <input
                type="checkbox"
                checked={autoscroll}
                onChange={(event) => {
                  const next = (event.currentTarget as HTMLInputElement)
                    .checked;
                  setAutoscrollPaused(false);
                  setAutoscrollPref(next);
                }}
              />
              <span>{getString("watch-autoscroll")}</span>
            </label>
            {!autoscroll ? (
              <button
                type="button"
                className="yt-watch-bottom-btn"
                title={getString("watch-jump-current")}
                onClick={() => setJumpToken((n) => n + 1)}
              >
                <img src={iconJump} alt="" width={14} height={14} />
                <span>{getString("watch-jump-current")}</span>
              </button>
            ) : null}
            <button
              type="button"
              className={`yt-watch-bottom-btn${findOpen ? " active" : ""}`}
              aria-pressed={findOpen}
              title={getString("watch-find")}
              onClick={() => {
                if (findOpen) closeFind();
                else openFind();
              }}
            >
              <img src={iconFind} alt="" width={14} height={14} />
              <span>{getString("watch-find")}</span>
            </button>
          </div>
        </div>
        {popoverPos && editingHighlight ? (
          <HighlightPopover
            mode="edit"
            left={popoverPos.left}
            top={popoverPos.top}
            busy={highlightBusy}
            highlight={editingHighlight.highlight}
            onColor={(color) => void onEditColor(color)}
            onComment={(comment) => void onEditComment(comment)}
            onTags={onEditTags}
            onRemove={() => void onRemoveHighlight()}
            onClose={() => setEditingHighlight(null)}
          />
        ) : null}
        {popoverPos &&
        !editingHighlight &&
        createSession &&
        createSession.ranges.length > 0 &&
        libraryID != null ? (
          <HighlightPopover
            mode="create"
            left={popoverPos.left}
            top={popoverPos.top}
            busy={highlightBusy}
            libraryID={libraryID}
            onCreate={(color, comment, tags) =>
              void onHighlightCreate(color, comment, tags)
            }
          />
        ) : null}
        <TranscriptPane
          blocks={blocks}
          currentTimeMs={currentTimeMs}
          autoscroll={autoscroll}
          jumpToken={jumpToken}
          highlights={highlights}
          paragraphMode={display.paragraphMode}
          pendingRanges={createSession?.ranges ?? []}
          findMatches={findMatches}
          activeMatchIndex={matchIndex}
          findActive={findOpen && findMatches.length > 0}
          onUserScroll={() => setAutoscrollPaused(true)}
          onSeek={onSeek}
          onSelectionAnchor={onSelectionAnchorChange}
          onMarkClick={onMarkClick}
        />
      </div>
    </div>
  );
}
