import { makeApi } from "@/test-utils/jellyfinApi";
import {
  PlaystateCommand,
  playOnJellyfinSession,
  readRemotePlaybackState,
  sendRemotePlaystate,
  skipTargetTicks,
} from "./jellyfinSessionRemote";

describe("readRemotePlaybackState", () => {
  test("reads an episode playing on the remote session", () => {
    expect(
      readRemotePlaybackState({
        NowPlayingItem: {
          Id: "ep-1",
          Name: "Angel Attack",
          SeriesName: "Evangelion",
          RunTimeTicks: 14_400_000_000,
        },
        PlayState: { PositionTicks: 600_000_000, IsPaused: true },
      }),
    ).toEqual({
      itemId: "ep-1",
      title: "Evangelion — Angel Attack",
      positionTicks: 600_000_000,
      runtimeTicks: 14_400_000_000,
      isPaused: true,
    });
  });

  test("reads a film with no play state yet", () => {
    expect(
      readRemotePlaybackState({
        NowPlayingItem: { Id: "film-1", Name: "Le Roi et l'Oiseau" },
      }),
    ).toEqual({
      itemId: "film-1",
      title: "Le Roi et l'Oiseau",
      positionTicks: 0,
      runtimeTicks: 0,
      isPaused: false,
    });
  });

  test("is null while the session plays nothing", () => {
    expect(readRemotePlaybackState({ Id: "s-idle" })).toBeNull();
  });
});

describe("skipTargetTicks", () => {
  test.each([
    [600_000_000, 30, 14_400_000_000, 900_000_000],
    [100_000_000, -30, 14_400_000_000, 0],
    [14_300_000_000, 30, 14_400_000_000, 14_400_000_000],
    [600_000_000, 30, 0, 900_000_000],
  ])(
    "%d ticks skipped by %ds (runtime %d) → %d",
    (position, skip, runtime, expected) => {
      expect(skipTargetTicks(position, skip, runtime)).toBe(expected);
    },
  );
});

describe("playOnJellyfinSession", () => {
  test("sends PlayNow with the resume point and the picked streams", async () => {
    const api = makeApi();
    api.mock.onPost(/\/Sessions\/desktop-session\/Playing/).reply(204);

    await playOnJellyfinSession(api, "desktop-session", {
      itemId: "movie-1",
      startPositionTicks: 600_000_000,
      mediaSourceId: "source-1",
      audioStreamIndex: 2,
      subtitleStreamIndex: 5,
    });

    expect(api.mock.history.post[0].url).toBe(
      "https://jellyfin.example.com/Sessions/desktop-session/Playing?playCommand=PlayNow&itemIds=movie-1&startPositionTicks=600000000&mediaSourceId=source-1&audioStreamIndex=2&subtitleStreamIndex=5",
    );
  });
});

describe("sendRemotePlaystate", () => {
  test("sends a seek with its target position", async () => {
    const api = makeApi();
    api.mock.onPost(/\/Sessions\/desktop-session\/Playing\/Seek/).reply(204);

    await sendRemotePlaystate(
      api,
      "desktop-session",
      PlaystateCommand.Seek,
      900_000_000,
    );

    expect(api.mock.history.post[0].url).toBe(
      "https://jellyfin.example.com/Sessions/desktop-session/Playing/Seek?seekPositionTicks=900000000",
    );
  });
});
