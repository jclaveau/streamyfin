// Covers app/(auth)/jellyfin-remote.tsx: Expo Router would take a spec under
// app/ for a route, so it lives with the session helpers the screen uses.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
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
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/components/common/Text", () => ({
  Text: jest.requireActual("react-native").Text,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

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

const answerSessions = (sessions: unknown[]) => {
  const { mock } = createStore().get(apiAtom) as unknown as ReturnType<
    typeof makeApi
  >;
  mock.reset();
  mock.onGet(/\/Sessions/).reply(200, sessions);
};

describe("Jellyfin remote screen", () => {
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
});
