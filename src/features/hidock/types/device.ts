export type DeviceInfo = {
  connected: boolean
  model?: string
  vid?: string
  pid?: string
  serial?: string
  firmwareVersion?: string
}

export type HiDockFile = {
  filename: string
  fileLength: number
  createdAtRaw: string
  durationSec: number
  durationLabel: string
  mode?: "room" | "call" | "whisper"
  version?: number
  signature?: string
}

export type DownloadStatus = "success" | "failed" | "cancelled"

export type DownloadFileResult = {
  filename: string
  status: DownloadStatus
  bytesWritten: number
  error?: string
  outputPath?: string
}

export type DownloadReport = {
  files: DownloadFileResult[]
  totalBytesWritten: number
}

export type DownloadProgress = {
  filename: string
  done: number
  total: number
  aggregateDone: number
  aggregateTotal: number
}

export type DownloadOptions = {
  destinationPath?: string
}

export type CardInfo = {
  free?: number
  used: number
  capacity: number
  statusRaw: number
  status?: string
}

export type DeviceSettings = {
  autoRecord: boolean
  autoPlay: boolean
  bluetoothTone: boolean
  notificationSound?: boolean
}

export type BatteryStatus = {
  status: "idle" | "charging" | "full"
  battery: number
  voltage: number
}

export type BluetoothAudioCapability = {
  handsfree: boolean
  headset: boolean
  a2dp: boolean
  hfp: boolean
  avrcp: boolean
  battery: number
}

export type BluetoothDeviceInfo = {
  name: string
  mac: string
  rssi?: number
  cod?: number
  audio?: boolean
}

export type BluetoothStatus = {
  mac: string
  connected: boolean
  a2dp: boolean
  hfp: boolean
  avrcp: boolean
  battery: number
}

export type RecordingStatus = {
  recording: string | null
  duration: number
  samples: number[]
  type: "recording" | "whisper" | null
}

export type RecordingQuality = "normal" | "high"
export type AudioInputDevice = "bt-mic" | "mic"

export type RealtimeStatus = {
  rest: number
  muted: boolean
  dataLength: number
}

export type DeleteResult = {
  result: "success" | "not-exists" | "failed" | "unknown_error"
  code: number
}

export type GenericResult = {
  result: "success" | "failed"
  code?: number
  error?: string
}
