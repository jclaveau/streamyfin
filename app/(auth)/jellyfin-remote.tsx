import { Ionicons } from "@expo/vector-icons";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import {
  PlaystateCommand,
  readRemotePlaybackState,
  sendRemotePlaystate,
  skipTargetTicks,
} from "@/utils/cast/jellyfinSessionRemote";
import { logAndCaptureError } from "@/utils/log";
import { formatDuration } from "@/utils/time";

const SKIP_SECONDS = 30;

/**
 * Remote control for a Jellyfin session picked in the cast menu: the
 * counterpart of the Google Cast expanded controls. Position comes from
 * polling the session every second.
 */
export default function JellyfinRemoteScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const [jellyfinTarget, setJellyfinTarget] = useAtom(jellyfinCastTargetAtom);
  const sessionId = jellyfinTarget?.sessionId;

  const { data: remoteSession, isFetched } = useQuery({
    queryKey: ["jellyfinRemoteSession", sessionId],
    queryFn: async () => {
      const response = await getSessionApi(api!).getSessions({
        controllableByUserId: user!.Id,
      });
      const sessions = Array.isArray(response.data) ? response.data : [];
      return sessions.find((session) => session.Id === sessionId) ?? null;
    },
    enabled: !!api && !!user?.Id && !!sessionId,
    refetchInterval: 1000,
    // A poll must never be persisted (see PERSISTED_QUERY_FAMILIES).
    gcTime: 0,
  });

  const playbackState = remoteSession
    ? readRemotePlaybackState(remoteSession)
    : null;

  const sliderProgress = useSharedValue(0);
  const sliderMin = useSharedValue(0);
  const sliderMax = useSharedValue(1);
  useEffect(() => {
    sliderProgress.value = playbackState?.positionTicks ?? 0;
    sliderMax.value = Math.max(playbackState?.runtimeTicks ?? 0, 1);
  }, [playbackState, sliderProgress, sliderMax]);

  const sendCommand = (command: PlaystateCommand, seekTicks?: number) => {
    if (!api || !sessionId) return;
    sendRemotePlaystate(api, sessionId, command, seekTicks).catch((error) =>
      logAndCaptureError("Jellyfin remote command failed", error),
    );
  };

  const skip = (skipSeconds: number) => {
    if (!playbackState) return;
    sendCommand(
      PlaystateCommand.Seek,
      skipTargetTicks(
        playbackState.positionTicks,
        skipSeconds,
        playbackState.runtimeTicks,
      ),
    );
  };

  const disconnect = () => {
    setJellyfinTarget(null);
    router.back();
  };

  const sessionGone = isFetched && remoteSession === null;

  return (
    <View
      className='flex-1 bg-black px-6'
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <View className='flex-row items-center justify-between mb-8'>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name='chevron-down' size={28} color='white' />
        </TouchableOpacity>
        <View className='items-center'>
          <Text className='text-xs opacity-60'>
            {t("cast_targets.playing_on")}
          </Text>
          <Text className='font-bold'>{jellyfinTarget?.name ?? ""}</Text>
        </View>
        <TouchableOpacity onPress={disconnect}>
          <Ionicons name='close-circle-outline' size={26} color='white' />
        </TouchableOpacity>
      </View>

      <View className='flex-1 justify-center'>
        <Text className='text-2xl font-bold text-center mb-8'>
          {sessionGone
            ? t("cast_targets.session_gone")
            : (playbackState?.title ?? t("cast_targets.nothing_playing"))}
        </Text>

        {playbackState && (
          <>
            <Slider
              theme={{
                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                minimumTrackTintColor: "#fff",
              }}
              progress={sliderProgress}
              minimumValue={sliderMin}
              maximumValue={sliderMax}
              onSlidingComplete={(ticks) =>
                sendCommand(PlaystateCommand.Seek, Math.round(ticks))
              }
              renderThumb={() => null}
              renderBubble={() => null}
              sliderHeight={8}
              containerStyle={{ borderRadius: 100 }}
            />
            <View className='flex-row justify-between mt-2'>
              <Text className='text-neutral-500 text-xs'>
                {formatDuration(playbackState.positionTicks)}
              </Text>
              <Text className='text-neutral-500 text-xs'>
                {formatDuration(playbackState.runtimeTicks)}
              </Text>
            </View>

            <View className='flex-row items-center justify-center mt-10 gap-x-10'>
              <TouchableOpacity onPress={() => skip(-SKIP_SECONDS)}>
                <Ionicons name='play-back' size={36} color='white' />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendCommand(PlaystateCommand.PlayPause)}
              >
                <Ionicons
                  name={playbackState.isPaused ? "play-circle" : "pause-circle"}
                  size={72}
                  color='white'
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => skip(SKIP_SECONDS)}>
                <Ionicons name='play-forward' size={36} color='white' />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className='items-center mt-10'
              onPress={() => sendCommand(PlaystateCommand.Stop)}
            >
              <Ionicons name='stop-circle-outline' size={40} color='#888' />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
