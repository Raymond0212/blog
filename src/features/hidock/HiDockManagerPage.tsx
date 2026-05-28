import { useMemo, useState } from "react";
import {
  Battery,
  Bell,
  Bluetooth,
  Clock3,
  Database,
  Download,
  HardDrive,
  Info,
  Keyboard,
  ListOrdered,
  Mic,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Settings2,
  Trash2,
  Usb,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createDeviceService } from "@/features/hidock/services/factory";
import type {
  AudioInputDevice,
  DeviceSettings,
  HiDockFile,
  RecordingQuality,
} from "@/features/hidock/types/device";
import { formatBytes } from "@/features/hidock/utils/format";
import { logger } from "@/features/hidock/utils/logger";

type SortKey = "filename" | "fileLength" | "createdAtRaw" | "durationSec";
type PendingConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

type ButtonDoc = {
  label: string;
  risk: "Read-only" | "Writes setting" | "Device mode" | "Destructive";
  description: string;
};

const buttonDocs: ButtonDoc[] = [
  {
    label: "Connect",
    risk: "Read-only",
    description: "Requests WebUSB access and opens the HiDock interface.",
  },
  {
    label: "Disconnect",
    risk: "Read-only",
    description: "Closes the browser's USB session with the device.",
  },
  {
    label: "List Files",
    risk: "Read-only",
    description:
      "Reads the device file list and derives duration with HiDock's file-version rules.",
  },
  {
    label: "Download Selected",
    risk: "Read-only",
    description:
      "Streams selected recordings from the device and saves them through the browser.",
  },
  {
    label: "Device Info",
    risk: "Read-only",
    description:
      "Reads firmware version, serial number, USB IDs, and inferred model.",
  },
  {
    label: "File Count",
    risk: "Read-only",
    description: "Reads the number of stored recordings.",
  },
  {
    label: "Recording File",
    risk: "Read-only",
    description:
      "Reads the active or last recording filename reported by the device.",
  },
  {
    label: "Card Info",
    risk: "Read-only",
    description: "Reads free, used, capacity, and card status fields.",
  },
  {
    label: "Battery",
    risk: "Read-only",
    description:
      "Reads charging state, battery level, and voltage when supported.",
  },
  {
    label: "Get Time",
    risk: "Read-only",
    description: "Reads the HiDock clock using its BCD time response.",
  },
  {
    label: "Set Time Now",
    risk: "Writes setting",
    description: "Writes the current computer clock to the device.",
  },
  {
    label: "Get Settings",
    risk: "Read-only",
    description:
      "Reads auto-record, auto-play, notification, and Bluetooth prompt settings.",
  },
  {
    label: "Toggle AutoRecord",
    risk: "Writes setting",
    description: "Flips the auto-record setting.",
  },
  {
    label: "Toggle Notification",
    risk: "Writes setting",
    description: "Flips the notification popup/sound setting.",
  },
  {
    label: "Bluetooth Status",
    risk: "Read-only",
    description:
      "Reads connected Bluetooth MAC, profiles, and remote battery value.",
  },
  {
    label: "Start Scan",
    risk: "Device mode",
    description: "Starts a Bluetooth scan on supported HiDock models.",
  },
  {
    label: "Stop Scan",
    risk: "Device mode",
    description: "Stops an active Bluetooth scan.",
  },
  {
    label: "Scan Results",
    risk: "Read-only",
    description: "Reads Bluetooth devices discovered by the latest scan.",
  },
  {
    label: "Paired Devices",
    risk: "Read-only",
    description: "Reads saved Bluetooth pairings.",
  },
  {
    label: "Clear Paired",
    risk: "Destructive",
    description: "Removes stored Bluetooth pairings from the device.",
  },
  {
    label: "Disconnect BT",
    risk: "Device mode",
    description: "Disconnects the current Bluetooth audio device.",
  },
  {
    label: "Connect BT",
    risk: "Device mode",
    description: "Connects to a prompted Bluetooth MAC address.",
  },
  {
    label: "Reconnect BT",
    risk: "Device mode",
    description: "Reconnects to a prompted Bluetooth MAC address.",
  },
  {
    label: "Get Timeout",
    risk: "Read-only",
    description: "Reads the device WebUSB timeout value.",
  },
  {
    label: "Set Timeout",
    risk: "Writes setting",
    description: "Writes a prompted WebUSB timeout in milliseconds.",
  },
  {
    label: "Recording Status",
    risk: "Read-only",
    description:
      "Reads active recording name, duration, type, and sample bytes.",
  },
  {
    label: "Get Quality",
    risk: "Read-only",
    description: "Reads normal/high recording quality.",
  },
  {
    label: "Switch Quality",
    risk: "Writes setting",
    description: "Toggles normal/high recording quality.",
  },
  {
    label: "Get Audio Input",
    risk: "Read-only",
    description: "Reads whether the source is Bluetooth mic or built-in mic.",
  },
  {
    label: "Switch Audio Input",
    risk: "Writes setting",
    description: "Toggles between Bluetooth mic and built-in mic.",
  },
  {
    label: "Start Live",
    risk: "Device mode",
    description: "Starts realtime/live audio mode.",
  },
  {
    label: "Live Status",
    risk: "Read-only",
    description: "Reads realtime buffer and mute status.",
  },
  {
    label: "Stop Live",
    risk: "Device mode",
    description: "Stops realtime/live audio mode.",
  },
  {
    label: "Mass Storage",
    risk: "Device mode",
    description:
      "Switches the device to USB mass-storage mode, which can interrupt WebUSB.",
  },
  {
    label: "Mute Key",
    risk: "Device mode",
    description: "Sends the mute key code to the device.",
  },
  {
    label: "Record Key",
    risk: "Device mode",
    description: "Sends the record long-press key code.",
  },
  {
    label: "Playback Key",
    risk: "Device mode",
    description: "Sends the playback double-press key code.",
  },
  {
    label: "Delete One",
    risk: "Destructive",
    description: "Permanently deletes the first selected recording.",
  },
  {
    label: "Format Card",
    risk: "Destructive",
    description: "Formats the storage card and erases recordings.",
  },
];

export default function HiDockManagerPage() {
  const service = useMemo(() => createDeviceService(), []);
  const capability = service.getCapability();

  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<HiDockFile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Ready");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("createdAtRaw");
  const [sortAsc, setSortAsc] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [progress, setProgress] = useState<{
    current: string;
    aggregate: string;
  }>({
    current: "-",
    aggregate: "-",
  });

  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timed out")), ms);
      promise
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });

  const refreshAfterSuccess = async () => {
    const [infoR, countR, listR, timeR, settingsR] = await Promise.allSettled([
      withTimeout(service.getDeviceInfo(), 5000),
      withTimeout(service.getFileCount(), 5000),
      withTimeout(service.listFiles(), 12000),
      withTimeout(service.getDeviceTime(), 5000),
      withTimeout(service.getSettings(), 5000),
    ]);

    const info = infoR.status === "fulfilled" ? infoR.value : null;
    const count = countR.status === "fulfilled" ? countR.value : null;
    const list = listR.status === "fulfilled" ? listR.value : null;
    const time = timeR.status === "fulfilled" ? timeR.value : null;
    const settings = settingsR.status === "fulfilled" ? settingsR.value : null;

    if (list) {
      setFiles(list);
      setSelected({});
    }
    setDetails(
      JSON.stringify(
        {
          device: info,
          fileCount: count,
          deviceTime: time,
          settings,
        },
        null,
        2,
      ),
    );
  };

  const selectedFiles = files.filter((f) => selected[f.filename]);

  const sortedFiles = [...files].sort((a, b) => {
    const factor = sortAsc ? 1 : -1;
    if (sortKey === "fileLength" || sortKey === "durationSec") {
      return (a[sortKey] - b[sortKey]) * factor;
    }
    return String(a[sortKey]).localeCompare(String(b[sortKey])) * factor;
  });

  const run = async (label: string, fn: () => Promise<void>) => {
    logger.info("ui", `action start: ${label}`);
    setBusy(true);
    setStatus(label);
    try {
      await fn();
      logger.info("ui", `action success: ${label}`);
    } catch (error) {
      logger.error("ui", `action failed: ${label}`, error);
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onConnect = async () =>
    run("Connecting to device...", async () => {
      const info = await service.connect();
      setConnected(true);
      setStatus(`Connected ${info.model ? `(${info.model})` : ""}`);
      void refreshAfterSuccess();
    });

  const onDisconnect = async () =>
    run("Disconnecting...", async () => {
      await service.disconnect();
      setConnected(false);
      setFiles([]);
      setSelected({});
      setStatus("Disconnected");
      setProgress({ current: "-", aggregate: "-" });
    });

  const onListFiles = async () =>
    run("Loading file list...", async () => {
      const list = await service.listFiles((partial) => {
        setFiles(partial);
        setStatus(`Streaming file list... ${partial.length} parsed`);
      });
      setFiles(list);
      setSelected({});
      setStatus(`Loaded ${list.length} files`);
      setDetails(JSON.stringify({ files: list.length }, null, 2));
    });

  const onDownload = async () => {
    if (selectedFiles.length === 0) {
      setStatus("Select at least one file to download.");
      return;
    }

    await run(`Downloading ${selectedFiles.length} file(s)...`, async () => {
      const report = await service.downloadFiles(selectedFiles, "", (p) => {
        setProgress({
          current: `${p.filename}: ${formatBytes(p.done)} / ${formatBytes(p.total)}`,
          aggregate: `${formatBytes(p.aggregateDone)} / ${formatBytes(p.aggregateTotal)}`,
        });
      });
      const failures = report.files.filter((f) => f.status !== "success");
      await refreshAfterSuccess();
      setStatus(
        failures.length === 0
          ? `Downloaded ${report.files.length} files (${formatBytes(report.totalBytesWritten)})`
          : `Completed with ${failures.length} failure(s)`,
      );
      setDetails(JSON.stringify(report, null, 2));
    });
  };

  const onGetDeviceInfo = async () =>
    run("Reading device info...", async () =>
      setDetails(JSON.stringify(await service.getDeviceInfo(), null, 2)),
    );
  const onGetFileCount = async () =>
    run("Reading file count...", async () =>
      setDetails(
        JSON.stringify({ count: await service.getFileCount() }, null, 2),
      ),
    );
  const onRecordingFile = async () =>
    run("Reading recording file...", async () =>
      setDetails(JSON.stringify(await service.getRecordingFile(), null, 2)),
    );
  const onGetCardInfo = async () =>
    run("Reading card info...", async () =>
      setDetails(JSON.stringify(await service.getCardInfo(), null, 2)),
    );
  const onGetTime = async () =>
    run("Reading device time...", async () =>
      setDetails(JSON.stringify(await service.getDeviceTime(), null, 2)),
    );

  const confirmPendingAction = () => {
    const action = pendingConfirmation;
    setPendingConfirmation(null);
    if (action) void action.onConfirm();
  };

  const requestConfirmedAction = (
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => Promise<void>,
  ) => {
    setPendingConfirmation({ title, description, confirmLabel, onConfirm });
  };

  const promptNumber = (label: string, fallback: number) => {
    const input = window.prompt(label, String(fallback));
    if (input == null) return null;
    const value = Number.parseInt(input, 10);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a positive number.");
      return null;
    }
    return value;
  };

  const promptBluetoothMac = () => {
    const input = window.prompt(
      "Bluetooth MAC address (AA-BB-CC-DD-EE-FF)",
      "",
    );
    return input?.trim() || null;
  };

  const requestSetNow = async () => {
    requestConfirmedAction(
      "Set device time?",
      "This will update the connected HiDock device clock to the current computer time.",
      "Set Time",
      onSetNow,
    );
  };

  const onSetNow = async () =>
    run("Setting device time to now...", async () => {
      setDetails(
        JSON.stringify(await service.setDeviceTime(new Date()), null, 2),
      );
      await refreshAfterSuccess();
    });
  const onGetSettings = async () =>
    run("Reading settings...", async () =>
      setDetails(JSON.stringify(await service.getSettings(), null, 2)),
    );

  const requestSetSettings = async () => {
    requestConfirmedAction(
      "Toggle AutoRecord?",
      "This will change the connected HiDock auto-recording setting.",
      "Toggle Setting",
      onSetSettings,
    );
  };

  const onSetSettings = async () =>
    run("Toggling autoRecord setting...", async () => {
      const current = await service.getSettings();
      const next: Partial<DeviceSettings> = { autoRecord: !current.autoRecord };
      setDetails(JSON.stringify(await service.setSettings(next), null, 2));
      await refreshAfterSuccess();
    });

  const requestFormat = async () => {
    requestConfirmedAction(
      "Format storage card?",
      "This will erase every recording on the connected HiDock storage card. This action cannot be undone.",
      "Format Card",
      onFormat,
    );
  };

  const onFormat = async () =>
    run("Formatting card...", async () => {
      setDetails(JSON.stringify(await service.formatCard(true), null, 2));
      await refreshAfterSuccess();
    });

  const requestDeleteFirstSelected = async () => {
    const target = selectedFiles[0];
    if (!target) {
      setStatus("Select one file to delete first");
      return;
    }

    requestConfirmedAction(
      "Delete selected recording?",
      `This will permanently delete "${target.filename}" from the connected HiDock device.`,
      "Delete File",
      () => onDeleteFile(target),
    );
  };

  const onDeleteFile = async (target: HiDockFile) =>
    run("Deleting file...", async () => {
      setDetails(
        JSON.stringify(await service.deleteFile(target.filename), null, 2),
      );
      await refreshAfterSuccess();
    });

  const onGetBattery = async () =>
    run("Reading battery...", async () =>
      setDetails(JSON.stringify(await service.getBatteryStatus(), null, 2)),
    );

  const onToggleNotification = async () =>
    run("Toggling notification...", async () => {
      const current = await service.getSettings();
      setDetails(
        JSON.stringify(
          await service.setNotification(!current.notificationSound),
          null,
          2,
        ),
      );
      await refreshAfterSuccess();
    });

  const requestToggleNotification = async () =>
    requestConfirmedAction(
      "Toggle notification?",
      "This will change the device notification popup or sound setting.",
      "Toggle Notification",
      onToggleNotification,
    );

  const onBluetoothStatus = async () =>
    run("Reading Bluetooth status...", async () =>
      setDetails(JSON.stringify(await service.getBluetoothStatus(), null, 2)),
    );

  const onStartBluetoothScan = async () =>
    run("Starting Bluetooth scan...", async () => {
      const count = promptNumber("Bluetooth scan count", 10);
      if (count == null) return;
      setDetails(
        JSON.stringify(await service.startBluetoothScan(count), null, 2),
      );
    });

  const requestStartBluetoothScan = async () =>
    requestConfirmedAction(
      "Start Bluetooth scan?",
      "This asks the HiDock device to scan nearby Bluetooth devices and may temporarily change Bluetooth state.",
      "Start Scan",
      onStartBluetoothScan,
    );

  const onStopBluetoothScan = async () =>
    run("Stopping Bluetooth scan...", async () =>
      setDetails(JSON.stringify(await service.stopBluetoothScan(), null, 2)),
    );

  const requestStopBluetoothScan = async () =>
    requestConfirmedAction(
      "Stop Bluetooth scan?",
      "This stops the current device Bluetooth scan.",
      "Stop Scan",
      onStopBluetoothScan,
    );

  const onBluetoothScanResults = async () =>
    run("Reading Bluetooth scan results...", async () =>
      setDetails(
        JSON.stringify(await service.getBluetoothScanResults(), null, 2),
      ),
    );

  const onPairedBluetoothDevices = async () =>
    run("Reading paired Bluetooth devices...", async () =>
      setDetails(
        JSON.stringify(await service.getPairedBluetoothDevices(), null, 2),
      ),
    );

  const onClearPairedBluetoothDevices = async () =>
    run("Clearing paired Bluetooth devices...", async () => {
      setDetails(
        JSON.stringify(await service.clearPairedBluetoothDevices(), null, 2),
      );
    });

  const requestClearPairedBluetoothDevices = async () =>
    requestConfirmedAction(
      "Clear paired Bluetooth devices?",
      "This removes saved Bluetooth pairings from the connected HiDock device.",
      "Clear Pairings",
      onClearPairedBluetoothDevices,
    );

  const onDisconnectBluetoothDevice = async () =>
    run("Disconnecting Bluetooth device...", async () => {
      setDetails(
        JSON.stringify(await service.disconnectBluetoothDevice(), null, 2),
      );
    });

  const requestDisconnectBluetoothDevice = async () =>
    requestConfirmedAction(
      "Disconnect Bluetooth device?",
      "This disconnects the currently connected Bluetooth audio device.",
      "Disconnect BT",
      onDisconnectBluetoothDevice,
    );

  const onConnectBluetoothDevice = async () =>
    run("Connecting Bluetooth device...", async () => {
      const mac = promptBluetoothMac();
      if (!mac) return;
      setDetails(
        JSON.stringify(await service.connectBluetoothDevice(mac), null, 2),
      );
    });

  const requestConnectBluetoothDevice = async () =>
    requestConfirmedAction(
      "Connect Bluetooth device?",
      "This asks HiDock to connect to the entered Bluetooth MAC address.",
      "Connect BT",
      onConnectBluetoothDevice,
    );

  const onReconnectBluetoothDevice = async () =>
    run("Reconnecting Bluetooth device...", async () => {
      const mac = promptBluetoothMac();
      if (!mac) return;
      setDetails(
        JSON.stringify(await service.reconnectBluetoothDevice(mac), null, 2),
      );
    });

  const requestReconnectBluetoothDevice = async () =>
    requestConfirmedAction(
      "Reconnect Bluetooth device?",
      "This asks HiDock to reconnect to the entered Bluetooth MAC address.",
      "Reconnect BT",
      onReconnectBluetoothDevice,
    );

  const onGetWebUsbTimeout = async () =>
    run("Reading WebUSB timeout...", async () =>
      setDetails(JSON.stringify(await service.getWebUsbTimeout(), null, 2)),
    );

  const onSetWebUsbTimeout = async () =>
    run("Setting WebUSB timeout...", async () => {
      const timeout = promptNumber("WebUSB timeout in milliseconds", 10000);
      if (timeout == null) return;
      setDetails(
        JSON.stringify(await service.setWebUsbTimeout(timeout), null, 2),
      );
    });

  const requestSetWebUsbTimeout = async () =>
    requestConfirmedAction(
      "Set WebUSB timeout?",
      "This writes a new device-side WebUSB timeout value.",
      "Set Timeout",
      onSetWebUsbTimeout,
    );

  const onRecordingStatus = async () =>
    run("Reading recording status...", async () =>
      setDetails(JSON.stringify(await service.getRecordingStatus(), null, 2)),
    );

  const onGetRecordingQuality = async () =>
    run("Reading recording quality...", async () =>
      setDetails(JSON.stringify(await service.getRecordingQuality(), null, 2)),
    );

  const onSwitchRecordingQuality = async () =>
    run("Switching recording quality...", async () => {
      const current = await service.getRecordingQuality();
      const next: RecordingQuality =
        current.quality === "normal" ? "high" : "normal";
      setDetails(
        JSON.stringify(await service.setRecordingQuality(next), null, 2),
      );
    });

  const requestSwitchRecordingQuality = async () =>
    requestConfirmedAction(
      "Switch recording quality?",
      "This changes the recording quality used by the connected HiDock device.",
      "Switch Quality",
      onSwitchRecordingQuality,
    );

  const onGetAudioInputDevice = async () =>
    run("Reading audio input...", async () =>
      setDetails(JSON.stringify(await service.getAudioInputDevice(), null, 2)),
    );

  const onSwitchAudioInputDevice = async () =>
    run("Switching audio input...", async () => {
      const current = await service.getAudioInputDevice();
      const next: AudioInputDevice =
        current.device === "bt-mic" ? "mic" : "bt-mic";
      setDetails(
        JSON.stringify(await service.setAudioInputDevice(next), null, 2),
      );
    });

  const requestSwitchAudioInputDevice = async () =>
    requestConfirmedAction(
      "Switch audio input?",
      "This changes the device recording input between Bluetooth mic and built-in mic.",
      "Switch Input",
      onSwitchAudioInputDevice,
    );

  const onStartRealtime = async () =>
    run("Starting realtime audio...", async () =>
      setDetails(JSON.stringify(await service.startRealtime(2), null, 2)),
    );

  const requestStartRealtime = async () =>
    requestConfirmedAction(
      "Start realtime audio?",
      "This puts the device into live audio mode until stopped.",
      "Start Live",
      onStartRealtime,
    );

  const onStopRealtime = async () =>
    run("Stopping realtime audio...", async () =>
      setDetails(JSON.stringify(await service.stopRealtime(), null, 2)),
    );

  const requestStopRealtime = async () =>
    requestConfirmedAction(
      "Stop realtime audio?",
      "This exits live audio mode on the device.",
      "Stop Live",
      onStopRealtime,
    );

  const onGetRealtime = async () =>
    run("Reading realtime status...", async () =>
      setDetails(JSON.stringify(await service.getRealtime(), null, 2)),
    );

  const onEnterMassStorageMode = async () =>
    run("Entering mass storage mode...", async () =>
      setDetails(JSON.stringify(await service.enterMassStorageMode(), null, 2)),
    );

  const requestEnterMassStorageMode = async () =>
    requestConfirmedAction(
      "Enter mass storage mode?",
      "This can interrupt the WebUSB session and expose the device as USB storage.",
      "Mass Storage",
      onEnterMassStorageMode,
    );

  const requestSendKeyCode = async (
    label: string,
    key: number,
    action: number,
  ) =>
    requestConfirmedAction(
      `Send ${label}?`,
      "This sends a physical-button command to the device.",
      label,
      () =>
        run(`Sending ${label}...`, async () =>
          setDetails(
            JSON.stringify(await service.sendKeyCode(key, action), null, 2),
          ),
        ),
    );

  const toggleSort = (next: SortKey) => {
    if (sortKey === next) {
      setSortAsc((v) => !v);
      return;
    }
    setSortKey(next);
    setSortAsc(true);
  };

  const toggleFile = (name: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [name]: checked }));
  };

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const file of files) next[file.filename] = checked;
    setSelected(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <HardDrive className="h-6 w-6" />
            HiDock Manager
          </h1>
          <p className="text-muted-foreground">
            Manage HiDock recordings inside the existing MockerPI workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || connected || !capability.canUsbOperate}
            onClick={onConnect}
          >
            <Usb className="h-4 w-4" />
            Connect
          </Button>
          <Button
            variant="outline"
            disabled={busy || !connected}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
          <Button
            variant="outline"
            disabled={busy || !connected}
            onClick={onListFiles}
          >
            <RefreshCw className="h-4 w-4" />
            List Files
          </Button>
          <Button
            disabled={busy || !connected || !capability.canUsbOperate}
            onClick={onDownload}
          >
            <Download className="h-4 w-4" />
            Download Selected
          </Button>
        </div>
      </div>

      {!capability.canUsbOperate && (
        <Alert>
          <Usb className="h-4 w-4" />
          <AlertTitle>WebUSB unavailable</AlertTitle>
          <AlertDescription>{capability.reason}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          label="Status"
          value={status}
          secondary={
            connected ? "Device session active" : "No device connected"
          }
        />
        <StatusCard
          label="Download Progress"
          value={progress.current}
          secondary={progress.aggregate}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Files</CardTitle>
            <CardDescription>
              Sort, select, and download recordings from the connected device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        files.length > 0 &&
                        selectedFiles.length === files.length
                      }
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all files"
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      onClick={() => toggleSort("filename")}
                      active={sortKey === "filename"}
                    >
                      Filename
                    </SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton
                      onClick={() => toggleSort("fileLength")}
                      active={sortKey === "fileLength"}
                    >
                      Size
                    </SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton
                      onClick={() => toggleSort("createdAtRaw")}
                      active={sortKey === "createdAtRaw"}
                    >
                      Created
                    </SortButton>
                  </TableHead>
                  <TableHead>
                    <SortButton
                      onClick={() => toggleSort("durationSec")}
                      active={sortKey === "durationSec"}
                    >
                      Duration
                    </SortButton>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiles.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground"
                    >
                      No files loaded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedFiles.map((file) => (
                    <TableRow key={file.filename}>
                      <TableCell>
                        <Checkbox
                          checked={Boolean(selected[file.filename])}
                          onCheckedChange={(checked) =>
                            toggleFile(file.filename, checked === true)
                          }
                          aria-label={`Select ${file.filename}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {file.filename}
                      </TableCell>
                      <TableCell>{formatBytes(file.fileLength)}</TableCell>
                      <TableCell>{file.createdAtRaw || "-"}</TableCell>
                      <TableCell>{file.durationLabel}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
            <CardDescription>
              Raw operation output and device snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted/50 p-4 text-xs leading-6">
              {details || "No details yet."}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Device Actions</CardTitle>
          <CardDescription>
            Run direct device commands without leaving the current content
            panel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <ActionButton
              disabled={busy || !connected}
              icon={Info}
              onClick={onGetDeviceInfo}
              label="Device Info"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={ListOrdered}
              onClick={onGetFileCount}
              label="File Count"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={HardDrive}
              onClick={onRecordingFile}
              label="Recording File"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={HardDrive}
              onClick={onGetCardInfo}
              label="Card Info"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Battery}
              onClick={onGetBattery}
              label="Battery"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Clock3}
              onClick={onGetTime}
              label="Get Time"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Clock3}
              onClick={requestSetNow}
              label="Set Time Now"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Settings2}
              onClick={onGetSettings}
              label="Get Settings"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Settings2}
              onClick={requestSetSettings}
              label="Toggle AutoRecord"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bell}
              onClick={requestToggleNotification}
              label="Toggle Notification"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={onBluetoothStatus}
              label="Bluetooth Status"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={requestStartBluetoothScan}
              label="Start Scan"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={requestStopBluetoothScan}
              label="Stop Scan"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={onBluetoothScanResults}
              label="Scan Results"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={onPairedBluetoothDevices}
              label="Paired Devices"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Trash2}
              onClick={requestClearPairedBluetoothDevices}
              label="Clear Paired"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={requestDisconnectBluetoothDevice}
              label="Disconnect BT"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={requestConnectBluetoothDevice}
              label="Connect BT"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Bluetooth}
              onClick={requestReconnectBluetoothDevice}
              label="Reconnect BT"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Usb}
              onClick={onGetWebUsbTimeout}
              label="Get Timeout"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Usb}
              onClick={requestSetWebUsbTimeout}
              label="Set Timeout"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Radio}
              onClick={onRecordingStatus}
              label="Recording Status"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Volume2}
              onClick={onGetRecordingQuality}
              label="Get Quality"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Volume2}
              onClick={requestSwitchRecordingQuality}
              label="Switch Quality"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Mic}
              onClick={onGetAudioInputDevice}
              label="Get Audio Input"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Mic}
              onClick={requestSwitchAudioInputDevice}
              label="Switch Audio Input"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={PlayCircle}
              onClick={requestStartRealtime}
              label="Start Live"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Radio}
              onClick={onGetRealtime}
              label="Live Status"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={PauseCircle}
              onClick={requestStopRealtime}
              label="Stop Live"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Database}
              onClick={requestEnterMassStorageMode}
              label="Mass Storage"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Keyboard}
              onClick={() => requestSendKeyCode("Mute Key", 1, 4)}
              label="Mute Key"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Keyboard}
              onClick={() => requestSendKeyCode("Record Key", 2, 3)}
              label="Record Key"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Keyboard}
              onClick={() => requestSendKeyCode("Playback Key", 3, 5)}
              label="Playback Key"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={Trash2}
              onClick={requestDeleteFirstSelected}
              label="Delete One"
            />
            <ActionButton
              disabled={busy || !connected}
              icon={HardDrive}
              onClick={requestFormat}
              label="Format Card"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Button Guide</CardTitle>
          <CardDescription>
            Protocol notes for the HiDock controls on this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Button</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>How it works</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buttonDocs.map((doc) => (
                <TableRow key={doc.label}>
                  <TableCell className="font-medium">{doc.label}</TableCell>
                  <TableCell>{doc.risk}</TableCell>
                  <TableCell>{doc.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingConfirmation !== null}
        onOpenChange={(open) => !open && setPendingConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={confirmPendingAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pendingConfirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  onClick,
  label,
}: {
  disabled: boolean;
  icon: LucideIcon;
  onClick: () => Promise<void>;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      className="justify-start"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function StatusCard({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-medium">{value}</p>
      {secondary ? (
        <p className="mt-1 text-sm text-muted-foreground">{secondary}</p>
      ) : null}
    </div>
  );
}

function SortButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center font-medium transition-colors ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
