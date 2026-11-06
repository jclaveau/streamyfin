import { Ionicons } from "@expo/vector-icons";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import GoogleCast, {
  CastContext,
  useCastDevice,
} from "react-native-google-cast";
import { useCastTargets } from "@/hooks/useCastTargets";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import type { CastTarget } from "@/utils/cast/castTargets";
import { logAndCaptureError } from "@/utils/log";
import { Text } from "./common/Text";

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * One list for every place the play button can send to: Chromecasts and
 * Jellyfin sessions. The native Cast dialog can only show Cast devices, so
 * it stays reachable as the last row for anything discovery missed.
 */
export const CastTargetPicker: React.FC<Props> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const castTargets = useCastTargets(visible);
  const castDevice = useCastDevice();
  const [jellyfinTarget, setJellyfinTarget] = useAtom(jellyfinCastTargetAtom);
  const isConnected = !!castDevice || !!jellyfinTarget;

  const isCurrentTarget = (target: CastTarget) =>
    target.kind === "chromecast"
      ? castDevice?.deviceId === target.deviceId
      : jellyfinTarget?.sessionId === target.sessionId;

  const endChromecastSession = () =>
    GoogleCast.getSessionManager().endCurrentSession(true);

  const selectTarget = async (target: CastTarget) => {
    onClose();
    try {
      if (target.kind === "chromecast") {
        setJellyfinTarget(null);
        await GoogleCast.getSessionManager().startSession(target.deviceId);
        return;
      }
      if (castDevice) await endChromecastSession();
      setJellyfinTarget(target);
    } catch (error) {
      logAndCaptureError("Selecting a cast target failed", error);
    }
  };

  const disconnect = async () => {
    onClose();
    setJellyfinTarget(null);
    try {
      if (castDevice) await endChromecastSession();
    } catch (error) {
      logAndCaptureError("Ending the cast session failed", error);
    }
  };

  return (
    <Modal
      animationType='slide'
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("cast_targets.title")}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name='close' size={24} color='white' />
            </TouchableOpacity>
          </View>

          <FlatList
            data={castTargets}
            keyExtractor={(target) =>
              target.kind === "chromecast"
                ? `chromecast:${target.deviceId}`
                : `jellyfin:${target.sessionId}`
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {t("cast_targets.no_targets")}
              </Text>
            }
            renderItem={({ item: target }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => selectTarget(target)}
              >
                <Ionicons
                  name={target.kind === "chromecast" ? "tv" : "desktop"}
                  size={20}
                  color='white'
                />
                <View style={styles.rowText}>
                  <Text style={styles.targetName}>{target.name}</Text>
                  <Text style={styles.targetDetails}>
                    {target.kind === "chromecast"
                      ? "Chromecast"
                      : target.clientName}
                  </Text>
                </View>
                {isCurrentTarget(target) && (
                  <Ionicons name='checkmark' size={20} color='#a855f7' />
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
          />

          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              onClose();
              CastContext.showCastDialog();
            }}
          >
            <Ionicons name='search' size={20} color='#888' />
            <Text style={styles.footerText}>
              {t("cast_targets.other_cast_devices")}
            </Text>
          </TouchableOpacity>
          {isConnected && (
            <TouchableOpacity style={styles.row} onPress={disconnect}>
              <Ionicons name='close-circle' size={20} color='#888' />
              <Text style={styles.footerText}>
                {t("cast_targets.disconnect")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalView: {
    width: "90%",
    maxHeight: "80%",
    backgroundColor: "#1c1c1c",
    borderRadius: 20,
    overflow: "hidden",
    paddingBottom: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  listContent: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  targetName: {
    fontSize: 16,
    fontWeight: "600",
  },
  targetDetails: {
    fontSize: 13,
    opacity: 0.6,
  },
  emptyText: {
    textAlign: "center",
    opacity: 0.6,
    padding: 16,
  },
  footerText: {
    fontSize: 15,
    opacity: 0.8,
  },
});
