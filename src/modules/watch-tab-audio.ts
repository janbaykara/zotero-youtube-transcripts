/**
 * Tab-bar play/pause control (same surface as Reader read-aloud).
 *
 * Zotero_Tabs.parseTabType("yt-watch") → content type "yt", so the toggle
 * hook is registered under that key. setAudioStatus({ active, paused })
 * shows the button and switches play/pause icons.
 */

/** First segment of WATCH_TAB_TYPE ("yt-watch") after parseTabType split. */
export const WATCH_TAB_AUDIO_TYPE = "yt";

type WatchTabAudioController = {
  toggle: () => void;
};

const controllers = new Map<string, WatchTabAudioController>();

function tabsApi(): {
  tabHooks?: {
    toggleAudio?: Record<string, (tab: { id: string }) => void>;
  };
  setAudioStatus?: (
    id: string,
    status: { active: boolean; paused: boolean },
  ) => void;
} | null {
  try {
    return (
      (Zotero.getMainWindow()?.Zotero_Tabs as unknown as {
        tabHooks?: {
          toggleAudio?: Record<string, (tab: { id: string }) => void>;
        };
        setAudioStatus?: (
          id: string,
          status: { active: boolean; paused: boolean },
        ) => void;
      }) ?? null
    );
  } catch {
    return null;
  }
}

export function registerWatchTabAudioHook(): void {
  const tabs = tabsApi();
  if (!tabs) return;
  if (!tabs.tabHooks) {
    (tabs as { tabHooks: Record<string, unknown> }).tabHooks = {};
  }
  if (!tabs.tabHooks!.toggleAudio) {
    tabs.tabHooks!.toggleAudio = {};
  }
  tabs.tabHooks!.toggleAudio![WATCH_TAB_AUDIO_TYPE] = (tab) => {
    controllers.get(tab.id)?.toggle();
  };
}

export function unregisterWatchTabAudioHook(): void {
  const tabs = tabsApi();
  try {
    delete tabs?.tabHooks?.toggleAudio?.[WATCH_TAB_AUDIO_TYPE];
  } catch {
    // ignore
  }
  controllers.clear();
}

export function bindWatchTabAudio(
  tabId: string,
  controller: WatchTabAudioController,
): void {
  controllers.set(tabId, controller);
}

export function unbindWatchTabAudio(tabId: string): void {
  controllers.delete(tabId);
  setWatchTabAudioStatus(tabId, { active: false, paused: true });
}

export function setWatchTabAudioStatus(
  tabId: string,
  status: { active: boolean; paused: boolean },
): void {
  try {
    tabsApi()?.setAudioStatus?.(tabId, status);
  } catch (err) {
    ztoolkit.log("setWatchTabAudioStatus failed", err);
  }
}
