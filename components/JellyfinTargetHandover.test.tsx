import { act, render, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { jellyfinCastTargetAtom } from "@/utils/atoms/jellyfinCastTarget";
import { JellyfinTargetHandover } from "./JellyfinTargetHandover";

const mockStartedListeners = new Set<() => void>();
// What the native SDK does: every listener still subscribed hears the start.
const startChromecastSession = () =>
  mockStartedListeners.forEach((listener) => {
    listener();
  });

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: {
    getSessionManager: () => ({
      onSessionStarted: (listener: () => void) => {
        mockStartedListeners.add(listener);
        return { remove: () => mockStartedListeners.delete(listener) };
      },
    }),
  },
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

describe("JellyfinTargetHandover", () => {
  test("a Chromecast session start stops and drops the Jellyfin player", async () => {
    const { mock } = createStore().get(apiAtom) as unknown as ReturnType<
      typeof makeApi
    >;
    mock.reset();
    mock.onPost(/\/Playing\/Stop/).reply(204);
    const store = createStore();
    store.set(jellyfinCastTargetAtom, {
      kind: "jellyfin-session",
      sessionId: "desktop-session",
      name: "maison-titateur",
      clientName: "Jellyfin Desktop",
    });

    await render(
      <JotaiProvider store={store}>
        <JellyfinTargetHandover />
      </JotaiProvider>,
    );
    startChromecastSession();

    await waitFor(() =>
      expect(mock.history.post.map((request) => request.url)).toEqual([
        "https://jellyfin.example.com/Sessions/desktop-session/Playing/Stop",
      ]),
    );
    expect(store.get(jellyfinCastTargetAtom)).toBeNull();
  });

  test("a Chromecast session start stops only the Jellyfin player picked last", async () => {
    const { mock } = createStore().get(apiAtom) as unknown as ReturnType<
      typeof makeApi
    >;
    mock.reset();
    mock.onPost(/\/Playing\/Stop/).reply(204);
    const store = createStore();
    store.set(jellyfinCastTargetAtom, {
      kind: "jellyfin-session",
      sessionId: "desktop-session",
      name: "maison-titateur",
      clientName: "Jellyfin Desktop",
    });
    await render(
      <JotaiProvider store={store}>
        <JellyfinTargetHandover />
      </JotaiProvider>,
    );
    await act(() =>
      store.set(jellyfinCastTargetAtom, {
        kind: "jellyfin-session",
        sessionId: "tv-session",
        name: "salon",
        clientName: "Jellyfin Android TV",
      }),
    );

    startChromecastSession();

    await waitFor(() =>
      expect(mock.history.post.map((request) => request.url)).toEqual([
        "https://jellyfin.example.com/Sessions/tv-session/Playing/Stop",
      ]),
    );
  });

  test("logging out drops the Jellyfin player", async () => {
    const store = createStore();
    store.set(jellyfinCastTargetAtom, {
      kind: "jellyfin-session",
      sessionId: "desktop-session",
      name: "maison-titateur",
      clientName: "Jellyfin Desktop",
    });
    await render(
      <JotaiProvider store={store}>
        <JellyfinTargetHandover />
      </JotaiProvider>,
    );

    // clearSessionState, on logout as on session expiry.
    await act(() => store.set(apiAtom, null as never));

    expect(store.get(jellyfinCastTargetAtom)).toBeNull();
  });
});
