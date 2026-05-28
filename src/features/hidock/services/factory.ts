import { BrowserDeviceService } from "@/features/hidock/services/browser-device-service"
import type { DeviceService } from "@/features/hidock/services/device-service"
import { WebUsbDeviceService } from "@/features/hidock/services/webusb-device-service"

export function createDeviceService(): DeviceService {
  return typeof navigator !== "undefined" && "usb" in navigator ? new WebUsbDeviceService() : new BrowserDeviceService()
}
