import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import GoogleCast from "react-native-google-cast";
import { apiAtom } from "@/providers/JellyfinProvider";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import {
  PlaystateCommand,
  sendRemotePlaystate,
} from "@/utils/cast/jellyfinSessionRemote";
import { logAndCaptureError } from "@/utils/log";

/**
 * Mounted once for the whole app: casting to a Chromecast stops the Jellyfin
 * player picked before, whether the Chromecast came from the cast picker or
 * the native Cast dialog. The player is dropped on logout too: it belongs to
 * the session, and the next login may be on another server. Renders nothing.
 */
export function JellyfinTargetHandover() {
  const api = useAtomValue(apiAtom);
  const [jellyfinTarget, setJellyfinTarget] = useAtom(jellyfinCastTargetAtom);

  // clearSessionState empties apiAtom, on logout as on session expiry.
  const isSignedIn = !!api?.accessToken;
  useEffect(() => {
    if (!isSignedIn) setJellyfinTarget(null);
  }, [isSignedIn, setJellyfinTarget]);

  useEffect(() => {
    if (!jellyfinTarget) return;
    const started = GoogleCast.getSessionManager().onSessionStarted(() => {
      setJellyfinTarget(null);
      if (!api) return;
      sendRemotePlaystate(
        api,
        jellyfinTarget.sessionId,
        PlaystateCommand.Stop,
      ).catch((error) =>
        logAndCaptureError(
          "Stopping the previous Jellyfin player failed",
          error,
        ),
      );
    });
    return () => started.remove();
  }, [api, jellyfinTarget, setJellyfinTarget]);

  return null;
}
