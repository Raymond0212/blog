import type { HiDockModel } from "@/features/hidock/jensen/device-models"

export type CapabilityDecision = {
  allowed: boolean
  reason?: string
}

export type JensenCapabilities = {
  factoryReset: CapabilityDecision
  restoreFactorySettings: CapabilityDecision
  settings: CapabilityDecision
  cardInfo: CapabilityDecision
  recordingFile: CapabilityDecision
  bluetooth: CapabilityDecision
  bluetoothStatus: CapabilityDecision
  recordOnVibe: CapabilityDecision
  battery: CapabilityDecision
  bluetoothPromptSetting: CapabilityDecision
  fileList: CapabilityDecision
  startRealtime: CapabilityDecision
  recordingControl: CapabilityDecision
  webUsbTimeout: CapabilityDecision
}

type DeviceContext = {
  model?: HiDockModel | string
  versionNumber?: number
}

export type JensenRuntimeState = {
  busy: boolean
  liveMode: boolean
  listingFiles: boolean
}

function decision(allowed: boolean, reason: string): CapabilityDecision {
  return allowed ? { allowed: true } : { allowed: false, reason }
}

export function getCapabilities(
  device: DeviceContext,
  runtime: JensenRuntimeState,
): JensenCapabilities {
  const model = device.model
  const version = device.versionNumber ?? 0
  const h1 = model === "hidock-h1"
  const h1e = model === "hidock-h1e"
  const h1Family = h1 || h1e
  const p1 = model === "hidock-p1"
  const p1Family = p1 || model === "hidock-p1:mini"
  const bluetoothModel = p1Family || model === "hidock-h1:lite"
  const knownModel = h1Family || bluetoothModel
  const notLive = !runtime.liveMode
  const idle = !runtime.busy

  return {
    factoryReset: decision(
      knownModel && (!h1Family || version >= 327705),
      "Factory reset requires H1/H1E firmware 327705 or newer.",
    ),
    restoreFactorySettings: decision(
      knownModel &&
        (!h1Family || (h1e && version >= 393476) || (h1 && version >= 327944)),
      "Restore factory settings is unavailable for this model or firmware.",
    ),
    settings: decision(
      knownModel && notLive,
      runtime.liveMode
        ? "Settings are unavailable in live mode."
        : "Settings are unavailable for this model.",
    ),
    cardInfo: decision(
      knownModel && (!h1Family || version >= 327733),
      "Card operations require H1/H1E firmware 327733 or newer.",
    ),
    recordingFile: decision(
      knownModel && (!h1Family || version >= 327733) && notLive,
      runtime.liveMode
        ? "Recording-file queries are unavailable in live mode."
        : "Recording-file queries require H1/H1E firmware 327733 or newer.",
    ),
    bluetooth: decision(
      bluetoothModel,
      "Bluetooth operations require a P1-family or H1 Lite device.",
    ),
    bluetoothStatus: decision(
      bluetoothModel && notLive,
      runtime.liveMode
        ? "Bluetooth status is unavailable in live mode."
        : "Bluetooth status requires a P1-family or H1 Lite device.",
    ),
    recordOnVibe: decision(
      p1 && version >= 66564,
      "Record on vibration requires P1 firmware 66564 or newer.",
    ),
    battery: decision(
      p1 && idle && notLive,
      runtime.liveMode || runtime.busy
        ? "Battery status is unavailable while the device is busy or live."
        : "Battery status is available only on the P1.",
    ),
    bluetoothPromptSetting: decision(
      (h1e && version >= 393476) || (h1 && version >= 327940),
      "Bluetooth prompt requires newer H1/H1E firmware.",
    ),
    fileList: decision(notLive, "File listing is unavailable in live mode."),
    startRealtime: decision(
      idle && !runtime.listingFiles && !runtime.liveMode,
      "Realtime cannot start while another command, file listing, or live session is active.",
    ),
    recordingControl: decision(
      model === "hidock-p1:mini" && version >= 131840 && notLive,
      runtime.liveMode
        ? "Recording controls are unavailable in realtime monitor mode."
        : "P1 Mini recording controls require firmware 2.3.0 or newer.",
    ),
    webUsbTimeout: decision(
      knownModel && model !== "hidock-p1:mini",
      model === "hidock-p1:mini"
        ? "WebUSB timeout commands are not supported by the P1 Mini."
        : "WebUSB timeout commands are unavailable for this model.",
    ),
  }
}
