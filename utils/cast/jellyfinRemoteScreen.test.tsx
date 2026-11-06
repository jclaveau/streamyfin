// Covers app/(auth)/jellyfin-remote.tsx: Expo Router would take a spec under
// app/ for a route, so it lives with the session helpers the screen uses.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { Alert } from "react-native";
import JellyfinRemoteScreen from "@/app/(auth)/jellyfin-remote";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import { queryDehydrateOptions } from "@/utils/queryPersistence";

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("react-native-awesome-slider", () => ({
  Slider: jest.requireActual("@/test-utils/viewStub").viewStub("seek-bar"),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: object) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/components/common/Text", () => ({
  Text: jest.requireActual("react-native").Text,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { forwardSkipTime: 30, rewindSkipTime: 10 },
  }),
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) =>
    jest
      .requireActual("react")
      .createElement(jest.requireActual("react-native").Text, null, name),
}));

const renderRemote = async (client: QueryClient) => {
  const store = createStore();
  store.set(jellyfinCastTargetAtom, {
    kind: "jellyfin-session",
    sessionId: "desktop-session",
    name: "maison-titateur",
    clientName: "Jellyfin Desktop",
  });
  await render(
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>
        <JellyfinRemoteScreen />
      </QueryClientProvider>
    </JotaiProvider>,
  );
};

const apiMock = () =>
  (createStore().get(apiAtom) as unknown as ReturnType<typeof makeApi>).mock;

const answerSessions = (sessions: unknown[]) => {
  const mock = apiMock();
  mock.reset();
  mock.onGet(/\/Sessions/).reply(200, sessions);
};

describe("Jellyfin remote screen", () => {
  afterEach(() => jest.restoreAllMocks());

  test("hides the seek bar while the remote item has no runtime", async () => {
    // A live TV channel reports RunTimeTicks 0: a bar from 0 to 1 tick sent
    // every release as a Seek to 0:00, restarting playback.
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "channel-1", Name: "Arte", RunTimeTicks: 0 },
        PlayState: { PositionTicks: 1_234_567_890, IsPaused: false },
      },
    ]);

    await renderRemote(new QueryClient());

    expect(await screen.findByText("Arte")).toBeTruthy();
    expect(screen.queryByTestId("seek-bar")).toBeNull();
  });

  test("shows the seek bar for an item with a runtime", async () => {
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 6e8, IsPaused: false },
      },
    ]);

    await renderRemote(new QueryClient());

    expect(await screen.findByText("Akira")).toBeTruthy();
    expect(screen.getByTestId("seek-bar")).toBeTruthy();
  });

  test("keeps the once-a-second session poll out of the persisted cache", async () => {
    answerSessions([]);
    const client = new QueryClient();

    await renderRemote(client);

    const query = client
      .getQueryCache()
      .find({ queryKey: ["jellyfinRemoteSession", "desktop-session"] });
    await waitFor(() => expect(query?.state.status).toBe("success"));
    expect(query?.options.gcTime).toBe(0);
    expect(queryDehydrateOptions.shouldDehydrateQuery?.(query as never)).toBe(
      false,
    );
  });

  test("skips back by the rewind setting", async () => {
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 6e8, IsPaused: false },
      },
    ]);
    apiMock()
      .onPost(/\/Playing\/Seek/)
      .reply(204);

    await renderRemote(new QueryClient());
    fireEvent.press(await screen.findByText("play-back"));

    await waitFor(() =>
      expect(apiMock().history.post[0].url).toBe(
        "https://jellyfin.example.com/Sessions/desktop-session/Playing/Seek?seekPositionTicks=500000000",
      ),
    );
  });

  test("skips forward past the end as jellyfin-web does", async () => {
    // 10 s before the end of Akira, +30 s: the remote player handles the end.
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 6.99e10, IsPaused: false },
      },
    ]);
    apiMock()
      .onPost(/\/Playing\/Seek/)
      .reply(204);

    await renderRemote(new QueryClient());
    fireEvent.press(await screen.findByText("play-forward"));

    await waitFor(() =>
      expect(apiMock().history.post[0].url).toBe(
        "https://jellyfin.example.com/Sessions/desktop-session/Playing/Seek?seekPositionTicks=70200000000",
      ),
    );
  });

  test("says the server is unreachable when the poll fails", async () => {
    const mock = apiMock();
    mock.reset();
    mock.onGet(/\/Sessions/).reply(500);

    await renderRemote(
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );

    expect(
      await screen.findByText("cast_targets.server_unreachable"),
    ).toBeTruthy();
    expect(screen.queryByText("cast_targets.nothing_playing")).toBeNull();
  });

  test("alerts when a command fails", async () => {
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 6e8, IsPaused: false },
      },
    ]);
    apiMock()
      .onPost(/\/Playing\/Stop/)
      .reply(401);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await renderRemote(new QueryClient());
    fireEvent.press(await screen.findByText("stop-circle-outline"));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        "player.client_error",
        'cast_targets.command_failed {"name":"maison-titateur"}',
      ),
    );
  });

  test("keeps the seek bar under the finger while a poll lands", async () => {
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 6e8, IsPaused: false },
      },
    ]);
    await renderRemote(new QueryClient());
    const seekBar = await screen.findByTestId("seek-bar");

    // The finger holds the bar at 50 min; the server still plays at 1:10.
    seekBar.props.onSlidingStart?.();
    seekBar.props.progress.value = 3e10;
    answerSessions([
      {
        Id: "desktop-session",
        NowPlayingItem: { Id: "movie-1", Name: "Akira", RunTimeTicks: 7e10 },
        PlayState: { PositionTicks: 7e8, IsPaused: false },
      },
    ]);
    expect(await screen.findByText("1:10", {}, { timeout: 3000 })).toBeTruthy();

    expect(seekBar.props.progress.value).toBe(3e10);
  });
});
