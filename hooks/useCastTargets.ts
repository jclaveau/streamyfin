import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useDevices } from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { buildCastTargets, type CastTarget } from "@/utils/cast/castTargets";

const ACTIVE_WITHIN_SECONDS = 360;

/**
 * Chromecasts found on the network plus the Jellyfin sessions this user may
 * control. `controllableByUserId` lets the server apply the user's policy, so
 * this works for non-admin users too.
 */
export const useCastTargets = (enabled: boolean): CastTarget[] => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const chromecastDevices = useDevices();

  const { data: jellyfinSessions = [] } = useQuery({
    queryKey: ["castTargetSessions", user?.Id],
    queryFn: async () => {
      const response = await getSessionApi(api!).getSessions({
        controllableByUserId: user!.Id,
        activeWithinSeconds: ACTIVE_WITHIN_SECONDS,
      });
      // A reverse proxy can answer with a non-array body (see useSessions).
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: enabled && !!api && !!user?.Id,
    refetchInterval: 5 * 1000,
    // A poll must never be persisted (see PERSISTED_QUERY_FAMILIES).
    gcTime: 0,
  });

  return useMemo(
    () =>
      buildCastTargets(chromecastDevices, jellyfinSessions, api?.deviceInfo.id),
    [chromecastDevices, jellyfinSessions, api],
  );
};
