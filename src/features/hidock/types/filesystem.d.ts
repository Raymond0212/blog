interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>
  close(): Promise<void>
}

interface FileSystemFileHandle {
  kind: "file"
  name: string
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle {
  kind: "directory"
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
}

interface USBEndpoint {
  direction: "in" | "out"
  endpointNumber: number
}

interface USBAlternateInterface {
  endpoints: USBEndpoint[]
}

interface USBInterface {
  interfaceNumber: number
  alternates: USBAlternateInterface[]
}

interface USBConfiguration {
  configurationValue?: number
  interfaces: USBInterface[]
}

interface USBInTransferResult {
  status: "ok" | "stall" | "babble"
  data?: DataView
}

interface USBOutTransferResult {
  status: "ok" | "stall" | "babble"
  bytesWritten?: number
}

interface USBDevice {
  opened?: boolean
  vendorId: number
  productId: number
  serialNumber?: string
  configuration: USBConfiguration | null
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResult>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
}

interface USB {
  getDevices(): Promise<USBDevice[]>
  requestDevice(options: { filters: Array<{ vendorId: number; productId?: number }> }): Promise<USBDevice>
}

interface Navigator {
  usb?: USB
}

interface Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}
