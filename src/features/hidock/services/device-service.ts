import type {
  CardInfo,
  AudioInputDevice,
  BatteryStatus,
  BluetoothDeviceInfo,
  BluetoothStatus,
  DeleteResult,
  DeviceInfo,
  DeviceSettings,
  DownloadOptions,
  DownloadProgress,
  DownloadReport,
  GenericResult,
  HiDockFile,
  RealtimeStatus,
  RecordingQuality,
  RecordingStatus,
} from "@/features/hidock/types/device"

export interface DeviceService {
  connect(): Promise<DeviceInfo>
  disconnect(): Promise<void>
  getDeviceInfo(): Promise<DeviceInfo>
  getFileCount(): Promise<number>
  listFiles(onPartial?: (files: HiDockFile[]) => void): Promise<HiDockFile[]>
  downloadFiles(
    files: HiDockFile[],
    destination: string,
    onProgress: (progress: DownloadProgress) => void,
    options?: DownloadOptions
  ): Promise<DownloadReport>
  deleteFile(filename: string): Promise<DeleteResult>
  getCardInfo(): Promise<CardInfo>
  formatCard(confirmed: boolean): Promise<GenericResult>
  getRecordingFile(): Promise<{ name: string; status: string } | null>
  getBatteryStatus(): Promise<BatteryStatus | null>
  getDeviceTime(): Promise<{ time: string }>
  setDeviceTime(date: Date): Promise<GenericResult>
  getSettings(): Promise<DeviceSettings>
  setSettings(settings: Partial<DeviceSettings>): Promise<GenericResult>
  setNotification(enabled: boolean): Promise<GenericResult>
  beginBncDemo(): Promise<GenericResult>
  endBncDemo(): Promise<GenericResult>
  startBluetoothScan(count: number): Promise<GenericResult>
  stopBluetoothScan(): Promise<GenericResult>
  getBluetoothScanResults(): Promise<BluetoothDeviceInfo[]>
  getPairedBluetoothDevices(): Promise<BluetoothDeviceInfo[]>
  clearPairedBluetoothDevices(): Promise<GenericResult>
  getBluetoothStatus(): Promise<BluetoothStatus | null>
  disconnectBluetoothDevice(): Promise<GenericResult>
  connectBluetoothDevice(mac: string): Promise<GenericResult>
  reconnectBluetoothDevice(mac: string): Promise<GenericResult>
  getWebUsbTimeout(): Promise<{ timeout: number }>
  setWebUsbTimeout(timeoutMs: number): Promise<GenericResult>
  sendKeyCode(key: number, action: number): Promise<GenericResult>
  enterMassStorageMode(): Promise<GenericResult>
  getRecordingStatus(): Promise<RecordingStatus>
  getRecordingQuality(): Promise<{ quality: RecordingQuality }>
  setRecordingQuality(quality: RecordingQuality): Promise<GenericResult>
  getAudioInputDevice(): Promise<{ device: AudioInputDevice }>
  setAudioInputDevice(device: AudioInputDevice): Promise<GenericResult>
  startRealtime(mode: number): Promise<GenericResult | null>
  stopRealtime(): Promise<GenericResult>
  getRealtime(): Promise<RealtimeStatus>
  getCapability(): {
    canUsbOperate: boolean
    canPickFolder: boolean
    runtime: "browser"
    transport: "webusb" | "ui-only"
    reason?: string
  }
}
