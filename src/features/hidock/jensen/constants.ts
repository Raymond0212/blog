export const JENSEN_MAGIC = [0x12, 0x34] as const
export const JENSEN_HEADER_SIZE = 12
export const JENSEN_VENDOR_IDS = [4310, 14471] as const
export const JENSEN_USB_CONFIGURATION = 1
export const JENSEN_USB_INTERFACE = 0
export const JENSEN_USB_ALTERNATE = 0
export const JENSEN_USB_OUT_ENDPOINT = 1
export const JENSEN_USB_IN_ENDPOINT = 2
export const JENSEN_USB_READ_SIZE = 512 * 1024
export const JENSEN_MAX_PAYLOAD_SIZE = JENSEN_USB_READ_SIZE
export const JENSEN_MAX_RECEIVE_BUFFER_SIZE = JENSEN_USB_READ_SIZE * 2

export const JensenCommand = {
  GetDeviceInfo: 1,
  GetDeviceTime: 2,
  SetDeviceTime: 3,
  GetFileList: 4,
  TransferFile: 5,
  GetFileCount: 6,
  DeleteFile: 7,
  BncDemo: 10,
  GetSettings: 11,
  SetSettings: 12,
  GetFileBlock: 13,
  GetCardInfo: 16,
  FormatCard: 17,
  GetRecordingFile: 18,
  RestoreFactorySettings: 19,
  ScheduleInfo: 20,
  TransferFilePartial: 21,
  ToneUpdate: 22,
  UacUpdate: 24,
  SendKeyCode: 28,
  GetRecordingStatus: 29,
  SetRecordingQuality: 30,
  GetRecordingQuality: 31,
  RealtimeSettings: 32,
  RealtimeControl: 33,
  GetRealtime: 34,
  BluetoothCommand: 4098,
  GetBluetoothStatus: 4099,
  GetBatteryStatus: 4100,
  BluetoothScan: 4101,
  GetBluetoothScanResults: 4102,
  GetPairedBluetoothDevices: 4103,
  ClearPairedBluetoothDevices: 4104,
  GetAudioInputDevice: 4106,
  FactoryReset: 61451,
  EnterMassStorageMode: 61455,
  SetWebUsbTimeout: 61456,
  GetWebUsbTimeout: 61457,
} as const
