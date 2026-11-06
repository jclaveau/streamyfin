import { buildCastTargets } from "./castTargets";

describe("buildCastTargets", () => {
  test("lists Chromecasts, then remote-controllable Jellyfin sessions", () => {
    expect(
      buildCastTargets(
        [{ deviceId: "cc-1", friendlyName: "Living room TV" }],
        [
          {
            Id: "s-desktop",
            DeviceId: "laptop",
            DeviceName: "maison-titateur",
            Client: "Jellyfin Desktop",
            SupportsRemoteControl: true,
          },
          {
            Id: "s-own",
            DeviceId: "this-phone",
            DeviceName: "Pixel 9 Pro XL",
            Client: "Streamyfin",
            SupportsRemoteControl: true,
          },
          {
            Id: "s-dlna",
            DeviceId: "renderer",
            DeviceName: "Old renderer",
            Client: "DLNA",
            SupportsRemoteControl: false,
          },
        ],
        "this-phone",
      ),
    ).toEqual([
      { kind: "chromecast", deviceId: "cc-1", name: "Living room TV" },
      {
        kind: "jellyfin-session",
        sessionId: "s-desktop",
        name: "maison-titateur",
        clientName: "Jellyfin Desktop",
      },
    ]);
  });

  test("names a target by its id when the device has no name", () => {
    expect(
      buildCastTargets(
        [{ deviceId: "cc-2", friendlyName: "" }],
        [{ Id: "s-web", DeviceId: "tab", SupportsRemoteControl: true }],
        undefined,
      ),
    ).toEqual([
      { kind: "chromecast", deviceId: "cc-2", name: "cc-2" },
      {
        kind: "jellyfin-session",
        sessionId: "s-web",
        name: "s-web",
        clientName: "",
      },
    ]);
  });
});
