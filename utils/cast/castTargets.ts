import type { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { Device } from "react-native-google-cast";

/**
 * Something the play button can send an item to. A Chromecast plays through
 * the Google Cast SDK; a Jellyfin session is another Jellyfin client (Jellyfin
 * Desktop, a web tab, a TV app) that the server drives on our behalf.
 */
export type ChromecastTarget = {
  kind: "chromecast";
  deviceId: string;
  name: string;
};

export type JellyfinSessionTarget = {
  kind: "jellyfin-session";
  sessionId: string;
  name: string;
  clientName: string;
};

export type CastTarget = ChromecastTarget | JellyfinSessionTarget;

type ChromecastDevice = Pick<Device, "deviceId" | "friendlyName">;

/**
 * Chromecasts first, then the Jellyfin sessions that accept remote control.
 * Our own session is left out: sending a play command to ourselves would
 * start the local player through the server.
 */
export const buildCastTargets = (
  chromecastDevices: readonly ChromecastDevice[],
  jellyfinSessions: readonly SessionInfoDto[],
  ownDeviceId: string | undefined,
): CastTarget[] => [
  ...chromecastDevices.map(
    (device): ChromecastTarget => ({
      kind: "chromecast",
      deviceId: device.deviceId,
      name: device.friendlyName || device.deviceId,
    }),
  ),
  ...jellyfinSessions
    .filter(
      (session) =>
        !!session.Id &&
        session.SupportsRemoteControl === true &&
        session.DeviceId !== ownDeviceId,
    )
    .map(
      (session): JellyfinSessionTarget => ({
        kind: "jellyfin-session",
        sessionId: session.Id!,
        name: session.DeviceName || session.Client || session.Id!,
        clientName: session.Client ?? "",
      }),
    ),
];
