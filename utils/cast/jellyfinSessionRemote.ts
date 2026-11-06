import type { Api } from "@jellyfin/sdk";
import {
  PlayCommand,
  PlaystateCommand,
  type SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";

/**
 * The Jellyfin-session side of casting: the server relays each call to the
 * other client over its websocket, so nothing here builds a stream URL — the
 * remote client negotiates playback for its own device.
 */

const TICKS_PER_SECOND = 10_000_000;

export type RemotePlayRequest = {
  itemId: string;
  startPositionTicks: number;
  mediaSourceId?: string;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
};

export const playOnJellyfinSession = async (
  api: Api,
  sessionId: string,
  request: RemotePlayRequest,
): Promise<void> => {
  await getSessionApi(api).play({
    sessionId,
    playCommand: PlayCommand.PlayNow,
    itemIds: [request.itemId],
    startPositionTicks: request.startPositionTicks,
    mediaSourceId: request.mediaSourceId,
    audioStreamIndex: request.audioStreamIndex,
    subtitleStreamIndex: request.subtitleStreamIndex,
  });
};

export const sendRemotePlaystate = async (
  api: Api,
  sessionId: string,
  command: PlaystateCommand,
  seekPositionTicks?: number,
): Promise<void> => {
  await getSessionApi(api).sendPlaystateCommand({
    sessionId,
    command,
    seekPositionTicks,
  });
};

export type RemotePlaybackState = {
  itemId: string;
  title: string;
  positionTicks: number;
  runtimeTicks: number;
  isPaused: boolean;
};

/** `null` while the remote session is idle (nothing playing). */
export const readRemotePlaybackState = (
  session: SessionInfoDto,
): RemotePlaybackState | null => {
  const nowPlaying = session.NowPlayingItem;
  if (!nowPlaying?.Id) return null;
  return {
    itemId: nowPlaying.Id,
    title: nowPlaying.SeriesName
      ? `${nowPlaying.SeriesName} — ${nowPlaying.Name ?? ""}`
      : (nowPlaying.Name ?? ""),
    positionTicks: session.PlayState?.PositionTicks ?? 0,
    runtimeTicks: nowPlaying.RunTimeTicks ?? 0,
    isPaused: session.PlayState?.IsPaused === true,
  };
};

/**
 * Skip forward or back, clamped to the item's bounds. A runtime of 0 means
 * the server does not know it, so only the start is a bound.
 */
export const skipTargetTicks = (
  positionTicks: number,
  skipSeconds: number,
  runtimeTicks: number,
): number => {
  const unclampedTicks = Math.max(
    positionTicks + skipSeconds * TICKS_PER_SECOND,
    0,
  );
  return runtimeTicks > 0
    ? Math.min(unclampedTicks, runtimeTicks)
    : unclampedTicks;
};

export { PlaystateCommand };
