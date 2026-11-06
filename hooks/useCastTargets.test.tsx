import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createStore } from "jotai";
import type { ReactNode } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { queryDehydrateOptions } from "@/utils/queryPersistence";
import { useCastTargets } from "./useCastTargets";

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("react-native-google-cast", () => ({ useDevices: () => [] }));

describe("useCastTargets", () => {
  test("keeps the sessions poll out of the persisted cache", async () => {
    const { mock } = createStore().get(apiAtom) as unknown as ReturnType<
      typeof makeApi
    >;
    mock.onGet(/\/Sessions/).reply(200, []);
    const client = new QueryClient();

    await renderHook(() => useCastTargets(true), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    const query = client
      .getQueryCache()
      .find({ queryKey: ["castTargetSessions", "user-1"] });
    await waitFor(() => expect(query?.state.status).toBe("success"));
    expect(query?.options.gcTime).toBe(0);
    expect(queryDehydrateOptions.shouldDehydrateQuery?.(query as never)).toBe(
      false,
    );
  });
});
