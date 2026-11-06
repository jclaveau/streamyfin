import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { Alert } from "react-native";
import { useCastDevice } from "react-native-google-cast";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import { CastTargetPicker } from "./CastTargetPicker";

const mockSessionManager = {
  endCurrentSession: jest.fn(),
  startSession: jest.fn(),
};

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: { getSessionManager: () => mockSessionManager },
  CastContext: { showCastDialog: jest.fn() },
  useCastDevice: jest.fn(),
  useDevices: () => [],
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: object) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));
jest.mock("./common/Text", () => ({
  Text: jest.requireActual("react-native").Text,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

const apiMock = () =>
  (createStore().get(apiAtom) as unknown as ReturnType<typeof makeApi>).mock;

const maisonTitateur = {
  kind: "jellyfin-session",
  sessionId: "desktop-session",
  name: "maison-titateur",
  clientName: "Jellyfin Desktop",
} as const;

const renderPicker = async (
  store: ReturnType<typeof createStore>,
  sessions: unknown[],
) => {
  const mock = apiMock();
  mock.reset();
  mock.onGet(/\/Sessions(\?|$)/).reply(200, sessions);
  mock.onPost(/\/Playing\/Stop/).reply(204);
  await render(
    <JotaiProvider store={store}>
      <QueryClientProvider client={new QueryClient()}>
        <CastTargetPicker visible={true} onClose={() => {}} />
      </QueryClientProvider>
    </JotaiProvider>,
  );
};

describe("CastTargetPicker", () => {
  afterEach(() => jest.restoreAllMocks());

  test("stops the previous Jellyfin player when another one is picked", async () => {
    const store = createStore();
    store.set(jellyfinCastTargetAtom, maisonTitateur);
    jest.mocked(useCastDevice).mockReturnValue(null);

    await renderPicker(store, [
      {
        Id: "tv-session",
        DeviceName: "salon",
        Client: "Jellyfin Android TV",
        DeviceId: "tv-device",
        SupportsRemoteControl: true,
      },
    ]);
    fireEvent.press(await screen.findByText("salon"));

    await waitFor(() =>
      expect(apiMock().history.post.map((request) => request.url)).toEqual([
        "https://jellyfin.example.com/Sessions/desktop-session/Playing/Stop",
      ]),
    );
    expect(store.get(jellyfinCastTargetAtom)).toEqual({
      kind: "jellyfin-session",
      sessionId: "tv-session",
      name: "salon",
      clientName: "Jellyfin Android TV",
    });
  });

  test("keeps the Chromecast when ending its session fails", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const store = createStore();
    jest
      .mocked(useCastDevice)
      .mockReturnValue({ deviceId: "cc-1", friendlyName: "Salon TV" } as never);
    mockSessionManager.endCurrentSession.mockRejectedValue(
      new Error("No current session"),
    );

    await renderPicker(store, [
      {
        Id: "desktop-session",
        DeviceName: "maison-titateur",
        Client: "Jellyfin Desktop",
        DeviceId: "desktop-device",
        SupportsRemoteControl: true,
      },
    ]);
    fireEvent.press(await screen.findByText("maison-titateur"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "player.client_error",
        'cast_targets.chromecast_still_connected {"name":"Salon TV"}',
      ),
    );
    expect(store.get(jellyfinCastTargetAtom)).toBeNull();
  });
});
