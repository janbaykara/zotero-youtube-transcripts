import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { findActiveBlockIndex } from "../../transcript/active-line";
import { formatAnnotationCommentHtml } from "../../transcript/comment-html";
import { transcriptLineAnchorId } from "../../transcript/line-anchor";
import { formatTimestamp } from "../../transcript/timestamp";
import type { TranscriptBlock } from "../../transcript/types";
import {
  catalogTranscriptLines,
  lineCaretAtPoint,
  rangesBetweenCarets,
  selectionAnchorInTranscript,
  selectionRangesInTranscript,
  type SelectionAnchor,
  type TranscriptHighlight,
  type TranscriptSelectionRange,
} from "../transcript-annotations";
import type { TranscriptFindMatch } from "../transcript-find";

export type SelectionPublish = {
  anchor: SelectionAnchor | null;
  /**
   * When set, replace the pending multi-line snapshot (pointerup).
   * Omit on selectionchange/scroll so a collapsed/shrunk live selection
   * cannot wipe a longer snapshot before the colour popover is used.
   */
  ranges?: TranscriptSelectionRange[];
  /** Clear pending ranges (new pointerdown / start of a fresh gesture). */
  resetPending?: boolean;
};

interface TranscriptPaneProps {
  blocks: TranscriptBlock[];
  currentTimeMs: number;
  autoscroll: boolean;
  jumpToken: number;
  highlights: TranscriptHighlight[];
  findMatches?: TranscriptFindMatch[];
  activeMatchIndex?: number;
  /** When true, skip player-driven autoscroll so find can own the viewport. */
  findActive?: boolean;
  onSeek: (offsetMs: number) => void;
  onSelectionAnchor: (publish: SelectionPublish) => void;
  onMarkClick: (
    highlight: TranscriptHighlight,
    anchor: SelectionAnchor,
  ) => void;
}

type LineFindHit = TranscriptFindMatch & { matchIndex: number };

function highlightsForLine(
  highlights: TranscriptHighlight[],
  lineOffsetMs: number,
): TranscriptHighlight[] {
  return highlights.filter((h) => h.lineOffsetMs === lineOffsetMs);
}

function marksWithComments(
  marks: TranscriptHighlight[],
): TranscriptHighlight[] {
  return marks.filter((m) => !!m.comment?.trim());
}

function wrapFindMark(
  slice: string,
  findHit: LineFindHit | undefined,
  activeMatchIndex: number,
  key: string,
): ComponentChildren {
  if (!findHit) return slice;
  const current = findHit.matchIndex === activeMatchIndex;
  return (
    <mark
      key={key}
      className={`yt-watch-find-match${current ? " current" : ""}`}
      data-find-match={String(findHit.matchIndex)}
    >
      {slice}
    </mark>
  );
}

/** Render caption text with annotation and find <mark> spans. */
function renderHighlightedText(
  text: string,
  marks: TranscriptHighlight[],
  findHits: LineFindHit[],
  activeMatchIndex: number,
  onMarkClick: (
    highlight: TranscriptHighlight,
    anchor: SelectionAnchor,
  ) => void,
): ComponentChildren {
  if (marks.length === 0 && findHits.length === 0) return text;

  const points = new Set<number>([0, text.length]);
  for (const mark of marks) {
    points.add(Math.max(0, Math.min(text.length, mark.start)));
    points.add(Math.max(0, Math.min(text.length, mark.end)));
  }
  for (const hit of findHits) {
    points.add(Math.max(0, Math.min(text.length, hit.start)));
    points.add(Math.max(0, Math.min(text.length, hit.end)));
  }
  const edges = [...points].sort((a, b) => a - b);
  const nodes: ComponentChildren[] = [];

  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    if (end <= start) continue;
    const slice = text.slice(start, end);
    const covering = marks.filter((m) => m.start <= start && m.end >= end);
    const findHit = findHits.find((h) => h.start <= start && h.end >= end);
    const findKey = `find-${start}-${end}`;

    if (covering.length === 0) {
      nodes.push(
        findHit
          ? wrapFindMark(slice, findHit, activeMatchIndex, findKey)
          : slice,
      );
      continue;
    }
    const top = covering[covering.length - 1];
    const tip = top.comment?.trim()
      ? `${top.text}\n\n${top.comment.replace(/<[^>]+>/g, "")}`
      : top.text;
    nodes.push(
      <mark
        key={`${top.key}-${start}-${end}`}
        className="yt-watch-mark"
        data-annotation-id={String(top.id)}
        style={{ backgroundColor: markBackground(top.color) }}
        title={tip}
        onMouseDown={(event) => {
          // Keep click from collapsing into a text-selection create flow.
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const el = event.currentTarget as HTMLElement;
          const rect = el.getBoundingClientRect();
          onMarkClick(top, {
            clientX: rect.right + 8,
            clientY: rect.top + rect.height / 2,
          });
        }}
      >
        {wrapFindMark(slice, findHit, activeMatchIndex, findKey)}
      </mark>,
    );
  }
  return nodes;
}

function markBackground(color: string): string {
  return `color-mix(in srgb, ${color} 55%, transparent)`;
}

function scrollPaneToElement(
  pane: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const paneRect = pane.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const offset =
    elRect.top - paneRect.top - paneRect.height / 2 + elRect.height / 2;
  const target = pane.scrollTop + offset;
  try {
    pane.scrollTo({ top: Math.max(0, target), behavior });
  } catch {
    pane.scrollTop = Math.max(0, target);
  }
}

export function TranscriptPane({
  blocks,
  currentTimeMs,
  autoscroll,
  jumpToken,
  highlights,
  findMatches = [],
  activeMatchIndex = -1,
  findActive = false,
  onSeek,
  onSelectionAnchor,
  onMarkClick,
}: TranscriptPaneProps) {
  const activeIndex = findActiveBlockIndex(blocks, currentTimeMs);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledIndex = useRef<number>(-1);
  const lastFindScrollIndex = useRef<number>(-1);
  const pointerDownRef = useRef(false);
  const dragStartCaretRef = useRef<{
    lineOffsetMs: number;
    offset: number;
  } | null>(null);

  useEffect(() => {
    if (findActive) return;
    if (activeIndex < 0) return;
    if (!autoscroll && jumpToken === 0) return;
    if (
      autoscroll &&
      activeIndex === lastScrolledIndex.current &&
      jumpToken === 0
    ) {
      return;
    }

    const pane = listRef.current;
    const el = activeRef.current;
    if (!pane || !el) return;

    lastScrolledIndex.current = activeIndex;
    scrollPaneToElement(pane, el);
  }, [activeIndex, autoscroll, jumpToken, findActive]);

  useEffect(() => {
    lastFindScrollIndex.current = -1;
  }, [findMatches]);

  useEffect(() => {
    if (!findActive || activeMatchIndex < 0) return;
    if (activeMatchIndex === lastFindScrollIndex.current) return;
    const pane = listRef.current;
    if (!pane) return;
    const el = pane.querySelector(
      `[data-find-match="${activeMatchIndex}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    lastFindScrollIndex.current = activeMatchIndex;
    scrollPaneToElement(pane, el);
  }, [findActive, activeMatchIndex, findMatches]);

  useEffect(() => {
    if (jumpToken > 0) {
      lastScrolledIndex.current = -1;
    }
  }, [jumpToken]);

  useEffect(() => {
    const pane = listRef.current;
    if (!pane) return;
    const doc = pane.ownerDocument;

    const closestIn = (target: EventTarget | null, sel: string): boolean =>
      !!(target as { closest?: (s: string) => unknown } | null)?.closest?.(sel);

    const clearNativeSelection = () => {
      try {
        pane.ownerDocument.defaultView?.getSelection()?.removeAllRanges();
      } catch {
        // ignore
      }
    };

    /**
     * Finalize a create session once on pointerup.
     * Important: clear the native selection *before* setState. Otherwise the
     * popover mount re-renders caption text nodes under an active Selection,
     * which fires selectionchange → another publish → render loop / hang
     * (especially on the first selection after launch).
     */
    const finalizeCreateSession = (clientX: number, clientY: number) => {
      const start = dragStartCaretRef.current;
      let ranges: ReturnType<typeof rangesBetweenCarets> = [];
      if (start) {
        const end = lineCaretAtPoint(pane, clientX, clientY);
        if (end) {
          ranges = rangesBetweenCarets(
            catalogTranscriptLines(pane),
            start,
            end,
          );
        }
      }
      if (ranges.length === 0) {
        ranges = selectionRangesInTranscript(pane);
      }
      if (ranges.length === 0) return;

      const nativeAnchor = selectionAnchorInTranscript(pane);
      const anchor = nativeAnchor ?? { clientX: clientX + 8, clientY };
      clearNativeSelection();
      // Defer popover mount until after selection teardown settles.
      const win = pane.ownerDocument.defaultView;
      if (win) {
        win.setTimeout(() => {
          onSelectionAnchor({ anchor, ranges });
        }, 0);
      } else {
        onSelectionAnchor({ anchor, ranges });
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        closestIn(event.target, ".yt-watch-highlight-popover") ||
        closestIn(event.target, ".yt-watch-display-popover") ||
        closestIn(event.target, ".yt-watch-find-bar")
      ) {
        return;
      }
      // Timestamp seek: do not enter is-selecting — that CSS sets
      // pointer-events:none on .yt-watch-line-time and drops the click.
      if (closestIn(event.target, ".yt-watch-line-time")) {
        pointerDownRef.current = false;
        dragStartCaretRef.current = null;
        pane.classList.remove("is-selecting");
        return;
      }
      if (
        closestIn(event.target, ".yt-watch-mark") ||
        closestIn(event.target, ".yt-watch-line-comment")
      ) {
        // Existing highlight/comment click → edit UI, not create-from-selection.
        pointerDownRef.current = false;
        dragStartCaretRef.current = null;
        pane.classList.remove("is-selecting");
        onSelectionAnchor({ anchor: null, resetPending: true });
        return;
      }
      if (!pane.contains(event.target as Node)) return;
      pointerDownRef.current = true;
      pane.classList.add("is-selecting");
      const caret = lineCaretAtPoint(pane, event.clientX, event.clientY);
      dragStartCaretRef.current = caret
        ? { lineOffsetMs: caret.lineOffsetMs, offset: caret.offset }
        : null;
      onSelectionAnchor({ anchor: null, resetPending: true });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (
        pointerDownRef.current &&
        dragStartCaretRef.current &&
        !closestIn(event.target, ".yt-watch-highlight-popover") &&
        !closestIn(event.target, ".yt-watch-display-popover") &&
        !closestIn(event.target, ".yt-watch-find-bar") &&
        !closestIn(event.target, ".yt-watch-line-time")
      ) {
        finalizeCreateSession(event.clientX, event.clientY);
      }
      pointerDownRef.current = false;
      dragStartCaretRef.current = null;
      pane.classList.remove("is-selecting");
    };
    const syncScrolledFade = () => {
      const section = pane.closest(".yt-watch-transcript-section");
      section?.classList.toggle("is-scrolled", pane.scrollTop > 2);
    };
    syncScrolledFade();

    const onScroll = () => {
      syncScrolledFade();
    };

    // No selectionchange listener — it re-enters publish after popover mount
    // re-renders caption nodes and can hang the chrome process.

    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    pane.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
      pane.removeEventListener("scroll", onScroll);
      pane.classList.remove("is-selecting");
      pane
        .closest(".yt-watch-transcript-section")
        ?.classList.remove("is-scrolled");
    };
  }, [onSelectionAnchor]);

  return (
    <div ref={listRef} className="yt-watch-transcript-pane">
      <div className="yt-watch-transcript-inner">
        <ul className="yt-watch-transcript-list">
          {blocks.map((block, index) => {
            const active = index === activeIndex;
            const text = block.quote.trim();
            const lineMarks = highlightsForLine(
              highlights,
              block.quoteTimeOffset,
            );
            const lineFindHits: LineFindHit[] = [];
            for (let mi = 0; mi < findMatches.length; mi++) {
              const match = findMatches[mi];
              if (match.blockIndex === index) {
                lineFindHits.push({ ...match, matchIndex: mi });
              }
            }
            const commentedMarks = marksWithComments(lineMarks);
            const timeLabel = formatTimestamp(block.quoteTimeOffset);
            const anchorId = transcriptLineAnchorId(block.quoteTimeOffset);
            return (
              <li key={`${block.quoteTimeOffset}-${index}`}>
                <div
                  ref={active ? activeRef : undefined}
                  className={`yt-watch-line${active ? " active" : ""}${
                    commentedMarks.length > 0 ? " has-comment" : ""
                  }`}
                >
                  {/*
                    Caption text is first in DOM order so multi-line selection
                    walks captions contiguously. Time/comment are placed via
                    grid columns; timestamps use attr() (no text nodes).
                  */}
                  <span
                    id={anchorId}
                    className="yt-watch-line-text"
                    data-line-offset={block.quoteTimeOffset}
                  >
                    {renderHighlightedText(
                      text,
                      lineMarks,
                      lineFindHits,
                      activeMatchIndex,
                      onMarkClick,
                    )}
                  </span>
                  <button
                    type="button"
                    className="yt-watch-line-time"
                    data-time={timeLabel}
                    aria-label={timeLabel}
                    title={timeLabel}
                    onClick={() => onSeek(block.quoteTimeOffset)}
                  />
                  {commentedMarks.map((mark, commentIndex) => {
                    const commentHtml = formatAnnotationCommentHtml(
                      mark.comment,
                    );
                    if (!commentHtml) return null;
                    return (
                      <div
                        key={`comment-${mark.id}`}
                        className={`yt-watch-line-comment${
                          commentIndex > 0
                            ? " yt-watch-line-comment-follow"
                            : ""
                        }`}
                        data-annotation-id={String(mark.id)}
                        role="button"
                        tabIndex={0}
                        // Sanitized in formatAnnotationCommentHtml.
                        dangerouslySetInnerHTML={{ __html: commentHtml }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          const target = event.target as
                            | (EventTarget & {
                                closest?: (s: string) => Element | null;
                              })
                            | null;
                          // Let in-comment links navigate without opening the editor.
                          if (target?.closest?.("a")) return;
                          event.preventDefault();
                          event.stopPropagation();
                          const el = event.currentTarget as HTMLElement;
                          const rect = el.getBoundingClientRect();
                          onMarkClick(mark, {
                            clientX: rect.left,
                            clientY: rect.top + rect.height / 2,
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          const el = event.currentTarget as HTMLElement;
                          const rect = el.getBoundingClientRect();
                          onMarkClick(mark, {
                            clientX: rect.left,
                            clientY: rect.top + rect.height / 2,
                          });
                        }}
                      />
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
