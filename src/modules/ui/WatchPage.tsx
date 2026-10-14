import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { chromeSkinUrl } from "@janbaykara/zotero-chrome";

import type { EmbeddedTranscriptData } from "../../transcript/embedded-data";
import { formatTimestamp } from "../../transcript/timestamp";
import { getString } from "../../utils/locale";
import {
  createTranscriptHighlights,
  deleteTranscriptHighlight,
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
import {
  subscribeWatchSeek,
  takePendingWatchSeek,
} from "../watch-seek";
import { DisplaySettingsPopover } from "./DisplaySettingsPopover";
import { HighlightPopover } from "./HighlightPopover";
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
  const [autoscroll, setAutoscroll] = useWatchAutoscroll();
  const [splitRatio, setSplitRatio] = useWatchSplitRatio();
  const display = useWatchDisplaySettings();
  const [displayOpen, setDisplayOpen] = useState(false);
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
      }));
  }, [data]);

  useEffect(() => {
    if (attachmentID == null) return;
    setWatchTranscriptBlocks(attachmentID, blocks);
  }, [attachmentID, blocks]);

  const highlights = useAttachmentHighlights(attachmentID);

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
    playerRef.current?.seekTo(seconds);
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

  const onHighlightColor = useCallback(
    async (color: string) => {
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

      setHighlightBusy(true);
      try {
        const created = await createTranscriptHighlights(
          attachment,
          ranges,
          color,
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
        setEditingHighlight(null);
        invalidateAttachmentHighlights(attachmentID);
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
      setEditingHighlight((prev) => {
        // Re-click is handled by the edit popover (save + close). If we still
        // get a click for the same mark, ignore so we don't reopen empty.
        if (prev?.highlight.id === highlight.id) return null;
        return { highlight, anchor };
      });
    },
    [clearCreateSession],
  );

  const onEditColor = useCallback(
    async (color: string) => {
      if (!editingHighlight || highlightBusy) return;
      const id = editingHighlight.highlight.id;
      setHighlightBusy(true);
      try {
        await updateTranscriptHighlight(id, { color });
        setEditingHighlight((prev) =>
          prev
            ? { ...prev, highlight: { ...prev.highlight, color } }
            : prev,
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
    const popoverW = editingHighlight ? 240 : 196;
    const popoverH = editingHighlight ? 160 : 36;
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
        const toolbar = root.querySelector(
          ".yt-watch-toolbar",
        ) as HTMLElement | null;
        const toolbarH = toolbar?.offsetHeight ?? 0;
        const usable = rect.height - toolbarH - 6;
        if (usable <= 0) return;
        const y = ev.clientY - rect.top - toolbarH;
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
  const iconOpen = chromeSkinUrl("16/universal/view.svg");

  return (
    <div ref={rootRef} className="yt-watch-root">
      <header className="yt-watch-toolbar">
        <h1 className="yt-watch-toolbar-title" title={data.title}>
          {data.title}
        </h1>
        <div className="yt-watch-toolbar-actions">
          <span className="yt-watch-time" title="Player time">
            {formatTimestamp(currentTimeMs)}
          </span>
          <button
            type="button"
            className="yt-watch-tool-btn"
            onClick={openInReader}
            title={getString("watch-open-reader")}
          >
            <img src={iconOpen} alt="" width={14} height={14} />
            <span>{getString("watch-open-reader")}</span>
          </button>
        </div>
      </header>

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
      />

      <div
        ref={transcriptSectionRef}
        className="yt-watch-transcript-section"
        style={
          {
            "--yt-watch-font":
              display.font === "sans"
                ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
                : '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
            "--yt-watch-font-size": `${display.fontSizePx}px`,
            "--yt-watch-line-height": String(display.lineHeight),
          } as Record<string, string>
        }
      >
        <div className="yt-watch-float-controls">
          <label className="yt-watch-toggle">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(e) =>
                setAutoscroll((e.currentTarget as HTMLInputElement).checked)
              }
            />
            <span>{getString("watch-autoscroll")}</span>
          </label>
          <button
            type="button"
            className="yt-watch-tool-btn"
            onClick={() => setJumpToken((n) => n + 1)}
          >
            {getString("watch-jump-current")}
          </button>
          <button
            type="button"
            className={`yt-watch-tool-btn${displayOpen ? " active" : ""}`}
            aria-expanded={displayOpen}
            aria-haspopup="dialog"
            onClick={() => setDisplayOpen((open) => !open)}
          >
            {getString("watch-display")}
          </button>
          {displayOpen ? (
            <DisplaySettingsPopover
              font={display.font}
              fontSizeIndex={display.fontSizeIndex}
              lineSpacingIndex={display.lineSpacingIndex}
              onFont={display.setFont}
              onFontSizeIndex={display.setFontSizeIndex}
              onLineSpacingIndex={display.setLineSpacingIndex}
              onClear={display.clear}
              onClose={() => setDisplayOpen(false)}
            />
          ) : null}
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
            onRemove={() => void onRemoveHighlight()}
            onClose={() => setEditingHighlight(null)}
          />
        ) : null}
        {popoverPos &&
        !editingHighlight &&
        createSession &&
        createSession.ranges.length > 0 ? (
          <HighlightPopover
            mode="create"
            left={popoverPos.left}
            top={popoverPos.top}
            busy={highlightBusy}
            onPick={(color) => void onHighlightColor(color)}
          />
        ) : null}
        <TranscriptPane
          blocks={blocks}
          currentTimeMs={currentTimeMs}
          autoscroll={autoscroll}
          jumpToken={jumpToken}
          highlights={highlights}
          onSeek={onSeek}
          onSelectionAnchor={onSelectionAnchorChange}
          onMarkClick={onMarkClick}
        />
      </div>
    </div>
  );
}
