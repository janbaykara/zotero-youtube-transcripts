import { useEffect, useRef, useState } from "preact/hooks";
import {
  openTagsBoxPopup,
  type TagsBoxItem,
} from "@janbaykara/zotero-chrome";

import { getString } from "../../utils/locale";
import {
  getHighlightColorChoices,
  type HighlightColorChoice,
  type TranscriptHighlight,
} from "../transcript-annotations";

interface CreateProps {
  mode: "create";
  left: number;
  top: number;
  busy?: boolean;
  libraryID: number;
  onCreate: (color: string, comment: string, tags: string[]) => void;
}

interface EditProps {
  mode: "edit";
  left: number;
  top: number;
  busy?: boolean;
  highlight: TranscriptHighlight;
  onColor: (color: string) => void;
  onComment: (comment: string) => void;
  onTags: (tags: string[]) => void;
  onRemove: () => void;
  onClose: () => void;
}

type HighlightPopoverProps = CreateProps | EditProps;

const TAGS_PANEL_CLASS = "yt-watch-tags-popup";
const TAGS_POPUPSET_ID = "yt-watch-tags-popupset";

export function HighlightPopover(props: HighlightPopoverProps) {
  const { listed, colors } = getHighlightColorChoices();

  if (props.mode === "create") {
    return (
      <CreatePopover
        left={props.left}
        top={props.top}
        busy={props.busy}
        libraryID={props.libraryID}
        colors={colors}
        listed={listed}
        onCreate={props.onCreate}
      />
    );
  }

  return (
    <EditPopover
      left={props.left}
      top={props.top}
      busy={props.busy}
      highlight={props.highlight}
      colors={colors}
      listed={listed}
      onColor={props.onColor}
      onComment={props.onComment}
      onTags={props.onTags}
      onRemove={props.onRemove}
      onClose={props.onClose}
    />
  );
}

function colorLabel(choice: HighlightColorChoice): string {
  if (choice.label) return choice.label;
  return choice.id.replace(/^general-/, "");
}

function readTagsFromItem(item: TagsBoxItem): string[] {
  try {
    return (item.getTags?.() ?? [])
      .map((entry) => String(entry?.tag ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Draft duck-typed item — same pattern as Annotation Feed’s tag filter. */
function createDraftTagsItem(
  libraryID: number,
  selected: readonly string[],
): TagsBoxItem {
  let tags = selected
    .map((tag) => tag.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((tag) => ({ tag }));
  return {
    id: "",
    libraryID,
    isFeedItem: false,
    getTags() {
      return tags.map((entry) => ({ ...entry }));
    },
    addTag(name: string) {
      const tag = String(name || "").trim();
      if (
        !tag ||
        tags.some((entry) => entry.tag.toLowerCase() === tag.toLowerCase())
      ) {
        return;
      }
      tags = [...tags, { tag }];
    },
    removeTag(name: string) {
      const key = String(name || "")
        .trim()
        .toLowerCase();
      tags = tags.filter((entry) => entry.tag.toLowerCase() !== key);
    },
    replaceTag(oldName: string, newName: string) {
      this.removeTag(oldName);
      this.addTag(newName);
    },
    setTags(list) {
      tags = (list || [])
        .map((entry) =>
          typeof entry === "string" ? entry : String(entry?.tag ?? ""),
        )
        .map((tag) => tag.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((tag) => ({ tag }));
    },
    async saveTx() {
      // Persisted when the colour pick creates the annotation.
    },
  };
}

function ColorPicker({
  colors,
  listed,
  busy,
  selected,
  onPick,
}: {
  colors: HighlightColorChoice[];
  listed: boolean;
  busy?: boolean;
  selected: string | null;
  onPick: (color: string) => void;
}) {
  if (listed) {
    return (
      <div className="yt-watch-color-list" role="listbox">
        {colors.map((choice) => {
          const label = colorLabel(choice);
          const isSelected =
            !!selected &&
            selected.toLowerCase() === choice.color.toLowerCase();
          return (
            <button
              key={choice.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`yt-watch-color-row-btn${
                isSelected ? " selected" : ""
              }`}
              disabled={busy}
              onMouseDown={(event) => {
                event.preventDefault();
                if (!busy) onPick(choice.color);
              }}
            >
              <span
                className="yt-watch-color-swatch"
                style={{ backgroundColor: choice.color }}
                aria-hidden="true"
              />
              <span className="yt-watch-color-label">{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="yt-watch-color-row">
      {colors.map((choice) => {
        const label = colorLabel(choice);
        return (
          <button
            key={choice.id}
            type="button"
            className={`yt-watch-color-swatch${
              selected &&
              selected.toLowerCase() === choice.color.toLowerCase()
                ? " selected"
                : ""
            }`}
            style={{ backgroundColor: choice.color }}
            title={label}
            aria-label={`${getString("watch-highlight")} ${label}`}
            disabled={busy}
            onMouseDown={(event) => {
              event.preventDefault();
              if (!busy) onPick(choice.color);
            }}
          />
        );
      })}
    </div>
  );
}

function TagsButton({
  tags,
  disabled,
  tagsOpen,
  onOpen,
}: {
  tags: string[];
  disabled?: boolean;
  tagsOpen: boolean;
  onOpen: (anchor: Element) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const summary =
    tags.length === 0
      ? getString("watch-highlight-tags-placeholder")
      : tags.join(", ");

  return (
    <button
      ref={buttonRef}
      type="button"
      className="yt-watch-highlight-tags-btn"
      disabled={disabled || tagsOpen}
      aria-haspopup="dialog"
      aria-expanded={tagsOpen}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        const anchor = buttonRef.current ?? (event.currentTarget as Element);
        onOpen(anchor);
      }}
    >
      {summary}
    </button>
  );
}

function CreatePopover({
  left,
  top,
  busy,
  libraryID,
  colors,
  listed,
  onCreate,
}: {
  left: number;
  top: number;
  busy?: boolean;
  libraryID: number;
  colors: HighlightColorChoice[];
  listed: boolean;
  onCreate: (color: string, comment: string, tags: string[]) => void;
}) {
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const commentRef = useRef(comment);
  const tagsRef = useRef(tags);

  const openTags = (anchor: Element) => {
    if (busy || tagsOpen) return;
    setTagsOpen(true);
    openTagsBoxPopup({
      item: createDraftTagsItem(libraryID, tagsRef.current),
      anchor,
      position: "after_start",
      popupSetId: TAGS_POPUPSET_ID,
      panelClass: TAGS_PANEL_CLASS,
      document: anchor.ownerDocument,
      onHidden: (item) => {
        const next = readTagsFromItem(item);
        tagsRef.current = next;
        setTags(next);
        setTagsOpen(false);
      },
    });
  };

  return (
    <div
      className={`yt-watch-highlight-popover yt-watch-highlight-popover-edit${
        listed ? " yt-watch-highlight-popover-listed" : ""
      }`}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="toolbar"
      aria-label={getString("watch-highlight")}
    >
      <ColorPicker
        colors={colors}
        listed={listed}
        busy={busy}
        selected={null}
        onPick={(color) =>
          onCreate(color, commentRef.current, tagsRef.current)
        }
      />
      <div className="yt-watch-highlight-meta">
        <textarea
          className="yt-watch-highlight-comment"
          value={comment}
          placeholder={getString("watch-highlight-comment-placeholder")}
          rows={3}
          disabled={busy}
          onMouseDown={(event) => event.stopPropagation()}
          onInput={(event) => {
            const next = (event.currentTarget as HTMLTextAreaElement).value;
            commentRef.current = next;
            setComment(next);
          }}
        />
        <TagsButton
          tags={tags}
          disabled={busy}
          tagsOpen={tagsOpen}
          onOpen={openTags}
        />
      </div>
    </div>
  );
}

function EditPopover({
  left,
  top,
  busy,
  highlight,
  colors,
  listed,
  onColor,
  onComment,
  onTags,
  onRemove,
  onClose,
}: {
  left: number;
  top: number;
  busy?: boolean;
  highlight: TranscriptHighlight;
  colors: HighlightColorChoice[];
  listed: boolean;
  onColor: (color: string) => void;
  onComment: (comment: string) => void;
  onTags: (tags: string[]) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState(highlight.comment);
  const [tags, setTags] = useState<string[]>(highlight.tags);
  const [tagsOpen, setTagsOpen] = useState(false);
  const commentRef = useRef(comment);
  const tagsRef = useRef(tags);
  const savedCommentRef = useRef(highlight.comment);
  const onCommentRef = useRef(onComment);
  const onTagsRef = useRef(onTags);
  const onCloseRef = useRef(onClose);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closedRef = useRef(false);

  onCommentRef.current = onComment;
  onTagsRef.current = onTags;
  onCloseRef.current = onClose;

  useEffect(() => {
    setComment(highlight.comment);
    commentRef.current = highlight.comment;
    savedCommentRef.current = highlight.comment;
    setTags(highlight.tags);
    tagsRef.current = highlight.tags;
    closedRef.current = false;
  }, [highlight.id, highlight.comment, highlight.tags]);

  const commitAndClose = () => {
    if (closedRef.current || tagsOpen) return;
    closedRef.current = true;
    const fromDom = rootRef.current?.querySelector("textarea")?.value;
    const nextComment = fromDom ?? commentRef.current;
    commentRef.current = nextComment;
    if (nextComment !== savedCommentRef.current) {
      savedCommentRef.current = nextComment;
      onCommentRef.current(nextComment);
    }
    onCloseRef.current();
  };

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (tagsOpen) return;
      event.preventDefault();
      event.stopPropagation();
      commitAndClose();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (tagsOpen) return;
      const target = event.target as
        | (EventTarget & { closest?: (s: string) => Element | null })
        | null;
      if (!target?.closest) return;

      if (target.closest(".yt-watch-highlight-popover")) return;
      if (target.closest(`.${TAGS_PANEL_CLASS}, .tags-popup, tags-box`)) {
        return;
      }

      const mark = target.closest(
        ".yt-watch-mark, .yt-watch-line-comment",
      ) as HTMLElement | null;
      const markId = mark?.getAttribute("data-annotation-id");
      if (markId === String(highlight.id)) {
        event.preventDefault();
        event.stopPropagation();
        commitAndClose();
        return;
      }

      commitAndClose();
    };

    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [highlight.id, tagsOpen]);

  const openTags = async (anchor: Element) => {
    if (busy || tagsOpen) return;
    const item = Zotero.Items.get(highlight.id);
    if (!item || !item.isAnnotation?.()) return;
    try {
      await item.loadDataType?.("tags");
    } catch {
      // already loaded
    }
    setTagsOpen(true);
    openTagsBoxPopup({
      item: item as unknown as TagsBoxItem,
      anchor,
      position: "after_start",
      popupSetId: TAGS_POPUPSET_ID,
      panelClass: TAGS_PANEL_CLASS,
      document: anchor.ownerDocument,
      onHidden: (closed) => {
        const next = readTagsFromItem(closed);
        tagsRef.current = next;
        setTags(next);
        onTagsRef.current(next);
        setTagsOpen(false);
      },
    });
  };

  return (
    <div
      ref={rootRef}
      className={`yt-watch-highlight-popover yt-watch-highlight-popover-edit${
        listed ? " yt-watch-highlight-popover-listed" : ""
      }`}
      style={{ left: `${left}px`, top: `${top}px` }}
      role="dialog"
      aria-label={getString("watch-highlight")}
    >
      <ColorPicker
        colors={colors}
        listed={listed}
        busy={busy}
        selected={highlight.color}
        onPick={onColor}
      />
      <div className="yt-watch-highlight-meta">
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
        <TagsButton
          tags={tags}
          disabled={busy}
          tagsOpen={tagsOpen}
          onOpen={(anchor) => void openTags(anchor)}
        />
      </div>
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
