import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import { Chromecast } from "./Chromecast";

const mockRouterPush = jest.fn();
let mockCastButtonPress: () => Promise<void>;

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: {
    getSessionManager: () => ({}),
    getDiscoveryManager: () => ({ startDiscovery: async () => {} }),
  },
  CastButton: () => null,
  CastContext: { showExpandedControls: jest.fn() },
  useCastDevice: () => null,
  useDevices: () => [],
  useMediaStatus: () => null,
  useRemoteMediaClient: () => null,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockRouterPush }),
}));
jest.mock("./common/HeaderButton", () => {
  const { TouchableOpacity } = jest.requireActual("react-native");
  return {
    HeaderButton: ({
      onPress,
      children,
    }: {
      onPress: () => Promise<void>;
      children: React.ReactNode;
    }) => {
      mockCastButtonPress = onPress;
      return (
        <TouchableOpacity testID='cast-button' onPress={onPress}>
          {children}
        </TouchableOpacity>
      );
    },
  };
});
jest.mock("./common/HeaderIcon", () => ({ HeaderIcon: () => null }));
jest.mock("./CastTargetPicker", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    CastTargetPicker: ({ visible }: { visible: boolean }) =>
      visible ? <Text>cast target picker</Text> : null,
  };
});
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

const renderWithMaisonTitateur = async (sessions: unknown[]) => {
  const { mock } = createStore().get(apiAtom) as unknown as ReturnType<
    typeof makeApi
  >;
  mock.reset();
  mock.onGet(/\/Sessions/).reply(200, sessions);
  const store = createStore();
  store.set(jellyfinCastTargetAtom, {
    kind: "jellyfin-session",
    sessionId: "desktop-session",
    name: "maison-titateur",
    clientName: "Jellyfin Desktop",
  });
  await render(
    <JotaiProvider store={store}>
      <Chromecast />
    </JotaiProvider>,
  );
};

describe("Chromecast header button with a Jellyfin player picked", () => {
  afterEach(() => jest.clearAllMocks());

  test("opens the remote while something plays there", async () => {
    await renderWithMaisonTitateur([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
      },
    ]);

    fireEvent.press(screen.getByTestId("cast-button"));

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/(auth)/jellyfin-remote"),
    );
  });

  test("opens the remote once for a double tap", async () => {
    await renderWithMaisonTitateur([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
      },
    ]);

    // Both taps land before the first read of the player answers.
    await act(() =>
      Promise.all([mockCastButtonPress(), mockCastButtonPress()]),
    );

    expect(mockRouterPush.mock.calls).toEqual([["/(auth)/jellyfin-remote"]]);
  });

  test("opens the picker while nothing plays there", async () => {
    await renderWithMaisonTitateur([{ Id: "desktop-session" }]);

    fireEvent.press(screen.getByTestId("cast-button"));

    expect(await screen.findByText("cast target picker")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
