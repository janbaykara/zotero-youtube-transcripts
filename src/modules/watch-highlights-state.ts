/**
 * Watch-tab highlight marks mirrored into Jotai (default store).
 * Deletions/edits from the reader or tab update marks without remounting the page.
 */

import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import type { AtomFamily } from "jotai-family";
import {
  atomFamilyFromExternal,
  subscribeNotifier,
} from "@janbaykara/zotero-jotai-state";

import type { TranscriptBlock } from "../transcript/types";
import {
  mapAnnotationsToHighlights,
  type TranscriptHighlight,
} from "./transcript-annotations";

const blocksByAttachment = new Map<number, TranscriptBlock[]>();
const knownAnnIdsByAttachment = new Map<number, Set<number>>();
const listenersByAttachment = new Map<number, Set<() => void>>();

const emptyHighlightsAtom = atom<TranscriptHighlight[]>([]);

function notifyAttachment(attachmentID: number): void {
  for (const cb of listenersByAttachment.get(attachmentID) ?? []) {
    cb();
  }
}

/** Caption blocks used to map annotation positions onto watch lines. */
export function setWatchTranscriptBlocks(
  attachmentID: number,
  blocks: TranscriptBlock[],
): void {
  blocksByAttachment.set(attachmentID, blocks);
  notifyAttachment(attachmentID);
}

export function invalidateAttachmentHighlights(attachmentID: number): void {
  notifyAttachment(attachmentID);
}

function readHighlights(attachmentID: number): TranscriptHighlight[] {
  const attachment = Zotero.Items.get(attachmentID);
  const blocks = blocksByAttachment.get(attachmentID) ?? [];
  if (!attachment || blocks.length === 0) {
    knownAnnIdsByAttachment.set(attachmentID, new Set());
    return [];
  }

  let annotations: Zotero.Item[] = [];
  try {
    annotations = attachment.getAnnotations?.(false) || [];
  } catch {
    knownAnnIdsByAttachment.set(attachmentID, new Set());
    return [];
  }

  const highlights = mapAnnotationsToHighlights(annotations, blocks);
  knownAnnIdsByAttachment.set(
    attachmentID,
    new Set(highlights.map((h) => h.id)),
  );
  return highlights;
}

function highlightsEqual(
  a: TranscriptHighlight[],
  b: TranscriptHighlight[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.key !== y.key ||
      x.lineOffsetMs !== y.lineOffsetMs ||
      x.start !== y.start ||
      x.end !== y.end ||
      x.color !== y.color ||
      x.text !== y.text ||
      x.comment !== y.comment
    ) {
      return false;
    }
  }
  return true;
}

function isRelevantAttachmentEvent(
  attachmentID: number,
  event: string,
  ids: Array<number | string>,
  extraData: { [key: string]: unknown },
): boolean {
  if (
    event !== "add" &&
    event !== "modify" &&
    event !== "delete" &&
    event !== "trash" &&
    event !== "refresh"
  ) {
    return false;
  }

  const numericIds = ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (numericIds.includes(attachmentID)) return true;

  const known = knownAnnIdsByAttachment.get(attachmentID);
  if (known) {
    for (const id of numericIds) {
      // Trash/delete: Items.get is often already null — match known mark ids.
      if (known.has(id)) return true;
    }
  }

  for (const id of numericIds) {
    const extra = extraData?.[id] as
      | { parentID?: number; parentItemID?: number }
      | undefined;
    if (
      extra?.parentID === attachmentID ||
      extra?.parentItemID === attachmentID
    ) {
      return true;
    }

    const item = Zotero.Items.get(id);
    if (!item) continue;
    try {
      if (
        item.isAnnotation?.() &&
        (item.parentID === attachmentID || item.parentItemID === attachmentID)
      ) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

export const attachmentHighlightsAtomFamily: AtomFamily<
  number,
  PrimitiveAtom<TranscriptHighlight[]>
> = atomFamilyFromExternal((attachmentID: number) => ({
  getSnapshot: () => readHighlights(attachmentID),
  initial: [] as TranscriptHighlight[],
  equal: highlightsEqual,
  subscribe: (onStoreChange) => {
    let set = listenersByAttachment.get(attachmentID);
    if (!set) {
      set = new Set();
      listenersByAttachment.set(attachmentID, set);
    }
    set.add(onStoreChange);

    const unsubNotifier = subscribeNotifier(
      ["item"],
      (event, type, ids, extraData) => {
        if (type !== "item") return;
        if (isRelevantAttachmentEvent(attachmentID, event, ids, extraData)) {
          onStoreChange();
        }
      },
    );

    return () => {
      set!.delete(onStoreChange);
      if (set!.size === 0) {
        listenersByAttachment.delete(attachmentID);
      }
      unsubNotifier();
    };
  },
}));

export function useAttachmentHighlights(
  attachmentID: number | null,
): TranscriptHighlight[] {
  return useAtomValue(
    attachmentID != null
      ? attachmentHighlightsAtomFamily(attachmentID)
      : emptyHighlightsAtom,
  );
}
