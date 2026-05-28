import { isLikelySafariOrIOS } from "@/features/hidock/services/env"
import type { DeviceService } from "@/features/hidock/services/device-service"
import type {
  AudioInputDevice,
  BatteryStatus,
  BluetoothDeviceInfo,
  BluetoothStatus,
  CardInfo,
  DeleteResult,
  DeviceInfo,
  DeviceSettings,
  DownloadProgress,
  DownloadReport,
  GenericResult,
  HiDockFile,
  RealtimeStatus,
  RecordingQuality,
  RecordingStatus,
} from "@/features/hidock/types/device"

const UNSUPPORTED_REASON =
  "WebUSB is unavailable in this browser runtime. Use Chrome/Edge desktop over localhost or HTTPS."

export class BrowserDeviceService implements DeviceService {
  private fail(): never {
    throw new Error(UNSUPPORTED_REASON)
  }

  async connect(): Promise<DeviceInfo> {
    return this.fail()
  }

  async disconnect(): Promise<void> {
    return
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return this.fail()
  }

  async getFileCount(): Promise<number> {
    return this.fail()
  }

  async listFiles(onPartial?: (files: HiDockFile[]) => void): Promise<HiDockFile[]> {
    void onPartial
    return this.fail()
  }

  async downloadFiles(
    files: HiDockFile[],
    destination: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<DownloadReport> {
    void files
    void destination
    void onProgress
    return this.fail()
  }

  async deleteFile(filename: string): Promise<DeleteResult> {
    void filename
    return this.fail()
  }

  async getCardInfo(): Promise<CardInfo> {
    return this.fail()
  }

  async formatCard(confirmed: boolean): Promise<GenericResult> {
    void confirmed
    return this.fail()
  }

  async getRecordingFile(): Promise<{ name: string; status: string } | null> {
    return this.fail()
  }

  async getBatteryStatus(): Promise<BatteryStatus | null> {
    return this.fail()
  }

  async getDeviceTime(): Promise<{ time: string }> {
    return this.fail()
  }

  async setDeviceTime(date: Date): Promise<GenericResult> {
    void date
    return this.fail()
  }

  async getSettings(): Promise<DeviceSettings> {
    return this.fail()
  }

  async setSettings(settings: Partial<DeviceSettings>): Promise<GenericResult> {
    void settings
    return this.fail()
  }

  async setNotification(enabled: boolean): Promise<GenericResult> {
    void enabled
    return this.fail()
  }

  async beginBncDemo(): Promise<GenericResult> {
    return this.fail()
  }

  async endBncDemo(): Promise<GenericResult> {
    return this.fail()
  }

  async startBluetoothScan(count: number): Promise<GenericResult> {
    void count
    return this.fail()
  }

  async stopBluetoothScan(): Promise<GenericResult> {
    return this.fail()
  }

  async getBluetoothScanResults(): Promise<BluetoothDeviceInfo[]> {
    return this.fail()
  }

  async getPairedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
    return this.fail()
  }

  async clearPairedBluetoothDevices(): Promise<GenericResult> {
    return this.fail()
  }

  async getBluetoothStatus(): Promise<BluetoothStatus | null> {
    return this.fail()
  }

  async disconnectBluetoothDevice(): Promise<GenericResult> {
    return this.fail()
  }

  async connectBluetoothDevice(mac: string): Promise<GenericResult> {
    void mac
    return this.fail()
  }

  async reconnectBluetoothDevice(mac: string): Promise<GenericResult> {
    void mac
    return this.fail()
  }

  async getWebUsbTimeout(): Promise<{ timeout: number }> {
    return this.fail()
  }

  async setWebUsbTimeout(timeoutMs: number): Promise<GenericResult> {
    void timeoutMs
    return this.fail()
  }

  async sendKeyCode(key: number, action: number): Promise<GenericResult> {
    void key
    void action
    return this.fail()
  }

  async enterMassStorageMode(): Promise<GenericResult> {
    return this.fail()
  }

  async getRecordingStatus(): Promise<RecordingStatus> {
    return this.fail()
  }

  async getRecordingQuality(): Promise<{ quality: RecordingQuality }> {
    return this.fail()
  }

  async setRecordingQuality(quality: RecordingQuality): Promise<GenericResult> {
    void quality
    return this.fail()
  }

  async getAudioInputDevice(): Promise<{ device: AudioInputDevice }> {
    return this.fail()
  }

  async setAudioInputDevice(device: AudioInputDevice): Promise<GenericResult> {
    void device
    return this.fail()
  }

  async startRealtime(mode: number): Promise<GenericResult | null> {
    void mode
    return this.fail()
  }

  async stopRealtime(): Promise<GenericResult> {
    return this.fail()
  }

  async getRealtime(): Promise<RealtimeStatus> {
    return this.fail()
  }

  getCapability() {
    const safariOrIOS = isLikelySafariOrIOS()
    return {
      canUsbOperate: false,
      canPickFolder: Boolean(window.showDirectoryPicker),
      runtime: "browser" as const,
      transport: "ui-only" as const,
      reason: safariOrIOS
        ? "Safari/iOS does not support WebUSB. Use Chrome/Edge desktop."
        : UNSUPPORTED_REASON,
    }
  }
}
