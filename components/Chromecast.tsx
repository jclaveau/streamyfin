import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import GoogleCast, {
  CastButton,
  CastContext,
  useCastDevice,
  useDevices,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import {
  fetchRemoteSession,
  readRemotePlaybackState,
} from "@/utils/cast/jellyfinSessionRemote";
import { logAndCaptureError } from "@/utils/log";
import { CastTargetPicker } from "./CastTargetPicker";
import { HeaderButton, type HeaderButtonProps } from "./common/HeaderButton";
import { HeaderIcon } from "./common/HeaderIcon";

type Props = Omit<HeaderButtonProps, "onPress" | "children">;

/**
 * Header cast button. Spacing is owned by the surrounding `HeaderButtonGroup` —
 * this component must not carry margins of its own.
 */
export function Chromecast(props: Props) {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const devices = useDevices();
  const sessionManager = GoogleCast.getSessionManager();
  const discoveryManager = GoogleCast.getDiscoveryManager();
  const mediaStatus = useMediaStatus();
  const jellyfinTarget = useAtomValue(jellyfinCastTargetAtom);
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useRouter();
  const [isPickerVisible, setPickerVisible] = useState(false);
  const isReadingRemote = useRef(false);

  useEffect(() => {
    (async () => {
      if (!discoveryManager) {
        console.warn("DiscoveryManager is not initialized");
        return;
      }

      await discoveryManager.startDiscovery();
    })().catch((error) => {
      // Previously an unhandled rejection: cast devices just never appear.
      logAndCaptureError("Chromecast discovery failed to start", error);
    });
  }, [client, devices, castDevice, sessionManager, discoveryManager]);

  return (
    <HeaderButton
      onPress={async () => {
        // As for a Chromecast: the remote only while something plays there,
        // the picker otherwise.
        if (jellyfinTarget && api && user?.Id) {
          // A second tap during the read would open a second remote.
          if (isReadingRemote.current) return;
          isReadingRemote.current = true;
          const remoteSession = await fetchRemoteSession(
            api,
            user.Id,
            jellyfinTarget.sessionId,
          )
            .catch((error) => {
              logAndCaptureError("Reading the Jellyfin player failed", error);
              return null;
            })
            .finally(() => {
              isReadingRemote.current = false;
            });
          if (remoteSession && readRemotePlaybackState(remoteSession)) {
            router.push("/(auth)/jellyfin-remote");
            return;
          }
        }
        if (mediaStatus?.currentItemId) CastContext.showExpandedControls();
        else setPickerVisible(true);
      }}
      {...props}
    >
      {/* Android needs a mounted CastButton for startDiscovery to work, but it
          must not take part in layout or it shifts the icon off the header
          grid — hence absolute + transparent rather than a sibling. */}
      {Platform.OS === "android" ? (
        <View style={{ position: "absolute", opacity: 0 }} pointerEvents='none'>
          <CastButton tintColor='transparent' />
        </View>
      ) : null}
      <HeaderIcon name='cast' />
      <CastTargetPicker
        visible={isPickerVisible}
        onClose={() => setPickerVisible(false)}
      />
    </HeaderButton>
  );
}
