import { useEffect, useRef, useState } from "preact/hooks";

import { getString } from "../../utils/locale";
import {
  getHighlightColors,
  type TranscriptHighlight,
} from "../transcript-annotations";

interface CreateProps {
  mode: "create";
  left: number;
  top: number;
  busy?: boolean;
  onPick: (color: string) => void;
}

interface EditProps {
  mode: "edit";
  left: number;
  top: number;
  busy?: boolean;
  highlight: TranscriptHighlight;
  onColor: (color: string) => void;
  onComment: (comment: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

type HighlightPopoverProps = CreateProps | EditProps;

export function HighlightPopover(props: HighlightPopoverProps) {
  const colors = getHighlightColors();

  if (props.mode === "create") {
    return (
      <div
        className="yt-watch-highlight-popover"
        style={{ left: `${props.left}px`, top: `${props.top}px` }}
        role="toolbar"
        aria-label={getString("watch-highlight")}
      >
        <ColorRow
          colors={colors}
          busy={props.busy}
          selected={null}
          onPick={props.onPick}
        />
      </div>
    );
  }

  return (
    <EditPopover
      left={props.left}
      top={props.top}
      busy={props.busy}
      highlight={props.highlight}
      colors={colors}
      onColor={props.onColor}
      onComment={props.onComment}
      onRemove={props.onRemove}
      onClose={props.onClose}
    />
  );
}

function ColorRow({
  colors,
  busy,
  selected,
  onPick,
}: {
  colors: Array<{ id: string; color: string }>;
  busy?: boolean;
  selected: string | null;
  onPick: (color: string) => void;
}) {
  return (
    <div className="yt-watch-color-row">
      {colors.map(({ id, color }) => (
        <button
          key={id}
          type="button"
          className={`yt-watch-color-swatch${
            selected && selected.toLowerCase() === color.toLowerCase()
              ? " selected"
              : ""
          }`}
          style={{ backgroundColor: color }}
          title={id.replace(/^general-/, "")}
          aria-label={`${getString("watch-highlight")} ${id.replace(/^general-/, "")}`}
          disabled={busy}
          onMouseDown={(event) => {
            // preventDefault keeps the transcript selection from collapsing;
            // pick on mousedown so create runs before any selectionchange.
            event.preventDefault();
            if (!busy) onPick(color);
          }}
        />
      ))}
    </div>
  );
}

function EditPopover({
  left,
  top,
  busy,
  highlight,
  colors,
  onColor,
  onComment,
  onRemove,
  onClose,
}: {
  left: number;
  top: number;
  busy?: boolean;
  highlight: TranscriptHighlight;
  colors: Array<{ id: string; color: string }>;
  onColor: (color: string) => void;
  onComment: (comment: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState(highlight.comment);
  const commentRef = useRef(comment);
  const savedCommentRef = useRef(highlight.comment);
  const onCommentRef = useRef(onComment);
  const onCloseRef = useRef(onClose);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef(false);

  onCommentRef.current = onComment;
  onCloseRef.current = onClose;

  useEffect(() => {
    setComment(highlight.comment);
    commentRef.current = highlight.comment;
    savedCommentRef.current = highlight.comment;
    closedRef.current = false;
  }, [highlight.id, highlight.comment]);

  /** Save draft (if any) and dismiss — Escape / outside / same-mark re-click. */
  const commitAndClose = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    // Prefer live DOM value: Preact onChange is native (blur), so pointerdown
    // dismiss can race ahead of state/ref updates from typing.
    const fromDom = rootRef.current?.querySelector("textarea")?.value;
    const next = fromDom ?? commentRef.current;
    commentRef.current = next;
    if (next !== savedCommentRef.current) {
      savedCommentRef.current = next;
      onCommentRef.current(next);
    }
    onCloseRef.current();
  };

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      commitAndClose();
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as
        (EventTarget & { closest?: (s: string) => Element | null }) | null;
      if (!target?.closest) return;

      // Keep interactions inside the popover (incl. Remove).
      if (target.closest(".yt-watch-highlight-popover")) return;

      const mark = target.closest(
        ".yt-watch-mark, .yt-watch-line-comment",
      ) as HTMLElement | null;
      const markId = mark?.getAttribute("data-annotation-id");
      if (markId === String(highlight.id)) {
        // Re-clicking the active highlight/comment: save + close, don't reopen.
        event.preventDefault();
        event.stopPropagation();
        commitAndClose();
        return;
      }

      // Click elsewhere (other mark, transcript, chrome): save + close.
      commitAndClose();
    };

    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [highlight.id]);

  return (
    <div
      ref={rootRef}
      className="yt-watch-highlight-popover yt-watch-highlight-popover-edit"
      style={{ left: `${left}px`, top: `${top}px` }}
      role="dialog"
      aria-label={getString("watch-highlight")}
    >
      <ColorRow
        colors={colors}
        busy={busy}
        selected={highlight.color}
        onPick={onColor}
      />
      <textarea
        className="yt-watch-highlight-comment"
        value={comment}
        placeholder={getString("watch-highlight-comment-placeholder")}
        rows={3}
        disabled={busy}
        autoFocus
        onMouseDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          const next = (event.currentTarget as HTMLTextAreaElement).value;
          commentRef.current = next;
          setComment(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            commitAndClose();
          }
        }}
      />
      <div className="yt-watch-highlight-edit-actions">
        <button
          type="button"
          className="yt-watch-tool-btn yt-watch-highlight-remove"
          disabled={busy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRemove}
        >
          {getString("watch-highlight-remove")}
        </button>
      </div>
    </div>
  );
}
