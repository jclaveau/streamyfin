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
 * Skip forward or back as jellyfin-web's seekRelative does: floored at the
 * start only, a seek past the end is the remote player's to handle.
 */
export const skipTargetTicks = (
  positionTicks: number,
  skipSeconds: number,
): number => Math.max(positionTicks + skipSeconds * TICKS_PER_SECOND, 0);

/** `null` when the session is gone from the server. */
export const fetchRemoteSession = async (
  api: Api,
  userId: string,
  sessionId: string,
): Promise<SessionInfoDto | null> => {
  const response = await getSessionApi(api).getSessions({
    controllableByUserId: userId,
  });
  const sessions = Array.isArray(response.data) ? response.data : [];
  return sessions.find((session) => session.Id === sessionId) ?? null;
};

export { PlaystateCommand };
