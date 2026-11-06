import { atom } from "jotai";
import type { JellyfinSessionTarget } from "@/utils/cast/castTargets";

/**
 * The Jellyfin session picked in the cast menu. A Chromecast keeps its state
 * in the Google Cast SDK; a Jellyfin session has no SDK, so it lives here.
 */
export const jellyfinCastTargetAtom = atom<JellyfinSessionTarget | null>(null);
