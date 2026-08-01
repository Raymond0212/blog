import { describe, expect, it } from "vitest"

import { getCapabilities } from "@/features/hidock/jensen/capability-policy"

describe("Jensen capability policy", () => {
  it("applies H1 firmware thresholds", () => {
    const old = getCapabilities(
      { model: "hidock-h1", versionNumber: 327704 },
      { busy: false, liveMode: false, listingFiles: false },
    )
    expect(old.factoryReset.allowed).toBe(false)
    expect(old.cardInfo.allowed).toBe(false)
    expect(old.settings.allowed).toBe(true)

    const current = getCapabilities(
      { model: "hidock-h1", versionNumber: 327944 },
      { busy: false, liveMode: false, listingFiles: false },
    )
    expect(current.factoryReset.allowed).toBe(true)
    expect(current.restoreFactorySettings.allowed).toBe(true)
    expect(current.cardInfo.allowed).toBe(true)
    expect(current.bluetoothPromptSetting.allowed).toBe(true)
  })

  it("limits exact-model P1 features and blocks live-mode conflicts", () => {
    const p1 = getCapabilities(
      { model: "hidock-p1", versionNumber: 66564 },
      { busy: false, liveMode: true, listingFiles: false },
    )
    expect(p1.bluetooth.allowed).toBe(true)
    expect(p1.recordOnVibe.allowed).toBe(true)
    expect(p1.battery.allowed).toBe(false)
    expect(p1.fileList.allowed).toBe(false)

    const mini = getCapabilities(
      { model: "hidock-p1:mini", versionNumber: 999999 },
      { busy: false, liveMode: false, listingFiles: false },
    )
    expect(mini.bluetooth.allowed).toBe(true)
    expect(mini.factoryReset.allowed).toBe(true)
    expect(mini.restoreFactorySettings.allowed).toBe(true)
    expect(mini.cardInfo.allowed).toBe(true)
    expect(mini.battery.allowed).toBe(false)
    expect(mini.recordOnVibe.allowed).toBe(false)
    expect(mini).toMatchObject({
      webUsbTimeout: {
        allowed: false,
        reason: "WebUSB timeout commands are not supported by the P1 Mini.",
      },
    })
  })

  it("blocks realtime while a command or file listing owns the transport", () => {
    expect(
      getCapabilities(
        { model: "hidock-h1e", versionNumber: 393476 },
        { busy: true, liveMode: false, listingFiles: false },
      ).startRealtime.allowed,
    ).toBe(false)
    expect(
      getCapabilities(
        { model: "hidock-h1e", versionNumber: 393476 },
        { busy: false, liveMode: false, listingFiles: true },
      ).startRealtime.allowed,
    ).toBe(false)
  })
})
