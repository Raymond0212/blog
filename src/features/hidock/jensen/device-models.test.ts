import { describe, expect, it } from "vitest"

import {
  isSupportedJensenDevice,
  modelFromProductId,
} from "@/features/hidock/jensen/device-models"

describe("Jensen product identification", () => {
  it.each([
    [45068, "hidock-h1"],
    [45069, "hidock-h1e"],
    [45070, "hidock-p1"],
    [45071, "hidock-p1:mini"],
    [256, "hidock-h1"],
    [257, "hidock-h1e"],
    [258, "hidock-h1"],
    [259, "hidock-h1e"],
    [8256, "hidock-p1"],
    [8257, "hidock-p1:mini"],
    [260, "hidock-h1:lite"],
  ] as const)("maps PID %i to %s", (pid, model) => {
    expect(modelFromProductId(pid)).toBe(model)
  })

  it.each([
    [44812, "hidock-h1"],
    [44813, "hidock-h1e"],
    [44814, "hidock-p1"],
    [44815, "hidock-p1:mini"],
  ] as const)(
    "keeps verified legacy PID %i as a documented alias",
    (pid, model) => {
      expect(modelFromProductId(pid)).toBe(model)
    },
  )

  it("accepts supported PIDs or an explicit HiDock product name", () => {
    expect(isSupportedJensenDevice({ productId: 45068 })).toBe(true)
    expect(
      isSupportedJensenDevice({
        productId: 999,
        productName: "HiDock Prototype",
      }),
    ).toBe(true)
    expect(
      isSupportedJensenDevice({
        productId: 999,
        productName: "Unrelated USB Audio",
      }),
    ).toBe(false)
  })
})
