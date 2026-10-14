import { getPref } from "../utils/prefs";
import { getString } from "../utils/locale";
import { formatTranscriptHtml } from "../transcript/format-html";
import { fetchTranscript } from "../youtube/fetch";
import {
  YouTubeIpBlockedError,
  YouTubeTranscriptError,
} from "../youtube/types";
import { zoteroHttp } from "./zotero-http";
import {
  findTranscriptAttachment,
  getRegularItem,
  getYouTubeUrlFromItem,
  TRANSCRIPT_ATTACHMENT_TITLE,
  TRANSCRIPT_TAG,
} from "./youtube-item";

export interface FetchOptions {
  /** Replace an existing transcript attachment if present. Default true for menu. */
  replaceExisting?: boolean;
  /** Show progress window. Default true. */
  showProgress?: boolean;
}

export async function fetchAndAttachTranscript(
  item: Zotero.Item,
  options: FetchOptions = {},
): Promise<"attached" | "skipped" | "error"> {
  const replaceExisting = options.replaceExisting ?? true;
  const showProgress = options.showProgress ?? true;

  const parent = getRegularItem(item);
  if (!parent) {
    return "error";
  }

  const url = getYouTubeUrlFromItem(parent);
  if (!url) {
    if (showProgress) {
      showStatus(getString("progress-no-url"), "fail");
    }
    return "error";
  }

  const existing = findTranscriptAttachment(parent);
  if (existing && !replaceExisting) {
    if (showProgress) {
      showStatus(getString("progress-skip-existing"), "default");
    }
    return "skipped";
  }

  const popup = showProgress
    ? new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
      })
        .createLine({
          text: getString("progress-fetching"),
          type: "default",
          progress: 20,
        })
        .show()
    : null;

  try {
    const lang = String(getPref("lang") || "en");
    const country = String(getPref("country") || "US");
    const timestampMod = Number(getPref("timestampMod") || 5);

    const transcript = await fetchTranscript(url, zoteroHttp, {
      lang,
      country,
    });

    popup?.changeLine({
      text: getString("progress-attaching"),
      progress: 70,
    });

    const html = formatTranscriptHtml(transcript, url, { timestampMod });
    if (!html) {
      throw new Error("Formatted transcript was empty");
    }

    if (existing) {
      await Zotero.Items.trashTx(existing.id);
    }

    const tmpFile = Zotero.getTempDirectory().clone();
    tmpFile.append("YouTube Transcript.html");
    await Zotero.File.putContentsAsync(tmpFile, html);

    const attachment = await Zotero.Attachments.importFromFile({
      file: tmpFile,
      parentItemID: parent.id,
      title: TRANSCRIPT_ATTACHMENT_TITLE,
      contentType: "text/html",
      charset: "utf-8",
    });

    attachment.addTag(TRANSCRIPT_TAG);
    await attachment.saveTx();

    try {
      if (tmpFile.exists()) {
        tmpFile.remove(false);
      }
    } catch {
      // Temp cleanup is best-effort.
    }

    popup?.changeLine({
      text: getString("progress-done"),
      type: "success",
      progress: 100,
    });
    popup?.startCloseTimer(3000);
    return "attached";
  } catch (err: unknown) {
    ztoolkit.log("fetchAndAttachTranscript failed", err);

    if (err instanceof YouTubeIpBlockedError) {
      popup?.changeLine({
        text: getString("progress-ip-blocked"),
        type: "fail",
        progress: 100,
      });
      popup?.startCloseTimer(12000);
      return "error";
    }

    const message =
      err instanceof YouTubeTranscriptError || err instanceof Error
        ? err.message
        : String(err);
    popup?.changeLine({
      text: `${getString("progress-error")}: ${message}`,
      type: "fail",
      progress: 100,
    });
    popup?.startCloseTimer(8000);
    return "error";
  }
}

export async function fetchAndAttachForItems(
  items: Zotero.Item[],
  options: FetchOptions = {},
): Promise<void> {
  for (const item of items) {
    await fetchAndAttachTranscript(item, options);
  }
}

function showStatus(text: string, type: "success" | "fail" | "default"): void {
  new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({ text, type, progress: 100 })
    .show()
    .startCloseTimer(4000);
}
