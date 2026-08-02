import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
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
  LockKeyhole,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Usb,
  Volume2,
  VolumeX,
  X,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createDeviceService } from "@/features/hidock/services/factory";
import { getCapabilities } from "@/features/hidock/jensen/capability-policy";
import {
  canRunLocally,
  filterLocalRecordings,
  getLocalRecordingCounts,
  getRecordingMimeType,
  getRecordingPlaybackAction,
  type LocalActionRisk,
  type LocalRecordingView,
} from "@/features/hidock/local-workspace";
import type {
  AudioInputDevice,
  DeviceInfo,
  DeviceSettings,
  HiDockFile,
  RecordingQuality,
  RecordingStatus,
} from "@/features/hidock/types/device";
import {
  decodeRealtimePcm16,
  encodeMonoPcm16Wav,
  suppressRealtimeNoise,
  type RealtimeNoiseState,
} from "@/features/hidock/jensen/parsers";
import { formatBytes } from "@/features/hidock/utils/format";
import { logger } from "@/features/hidock/utils/logger";

type SortKey = "filename" | "fileLength" | "createdAtRaw" | "durationSec";
type ManagerTab = "recordings" | "live" | "configurations" | "tools";
type DeviceActivity =
  | "idle"
  | "recording"
  | "stopping"
  | "file-transfer"
  | "playback"
  | "realtime-monitor"
  | "error";
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
    label: "Download recording",
    risk: "Read-only",
    description:
      "Streams one recording from its row menu and saves it through the browser.",
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
      "Reads auto-record, auto-play, notification, Bluetooth prompt, and record-on-vibration settings.",
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
    label: "Toggle Vibration",
    risk: "Writes setting",
    description: "Flips record-on-vibration on supported P1 firmware.",
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
    label: "Start Live",
    risk: "Device mode",
    description: "Starts realtime/live audio mode.",
  },
  {
    label: "Pause Live",
    risk: "Device mode",
    description: "Pauses realtime/live audio mode with Jensen command 33.",
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
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [files, setFiles] = useState<HiDockFile[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Ready to connect");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("createdAtRaw");
  const [sortAsc, setSortAsc] = useState(false);
  const [recordingView, setRecordingView] = useState<LocalRecordingView>("all");
  const [recordingQuery, setRecordingQuery] = useState("");
  const [safetyLock, setSafetyLock] = useState(true);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [progress, setProgress] = useState<{
    current: string;
    aggregate: string;
  }>({
    current: "-",
    aggregate: "-",
  });
  const [activeTab, setActiveTab] = useState<ManagerTab>("recordings");
  const [activity, setActivity] = useState<DeviceActivity>("idle");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>({
    recording: null,
    duration: 0,
    samples: [],
    type: null,
  });
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{
    file: HiDockFile | null;
    url: string | null;
    progress: number;
    error?: string;
  }>({ file: null, url: null, progress: 0 });
  const [monitor, setMonitor] = useState({
    rms: 0,
    localMuted: false,
    deviceMuted: false,
    rest: 0,
    elapsedSec: 0,
  });
  const [localMonitorRecording, setLocalMonitorRecording] = useState<{
    url: string;
    filename: string;
    bytes: number;
  } | null>(null);
  const [configuration, setConfiguration] = useState<{
    settings: DeviceSettings | null;
    quality: RecordingQuality | null;
    audioInput: AudioInputDevice | null;
    bluetooth: Awaited<ReturnType<typeof service.getBluetoothStatus>>;
    paired: Awaited<ReturnType<typeof service.getPairedBluetoothDevices>>;
    deviceTime: string | null;
  }>({
    settings: null,
    quality: null,
    audioInput: null,
    bluetooth: null,
    paired: [],
    deviceTime: null,
  });
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const playbackElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const monitorGainRef = useRef<GainNode | null>(null);
  const monitorChunksRef = useRef<Float32Array[]>([]);
  const monitorRecordingUrlRef = useRef<string | null>(null);
  const monitorNoiseStateRef = useRef<RealtimeNoiseState>({
    noiseFloor: 0.005,
    previousInput: 0,
    previousOutput: 0,
  });
  const nextAudioTimeRef = useRef(0);
  const monitorStartedAtRef = useRef(0);
  const previousRecordingRef = useRef<string | null>(null);

  const releasePlayback = useCallback(() => {
    playbackElementRef.current?.pause();
    playbackElementRef.current = null;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = null;
    setPlayback({ file: null, url: null, progress: 0 });
  }, []);

  const releaseLocalMonitorRecording = useCallback(() => {
    if (monitorRecordingUrlRef.current)
      URL.revokeObjectURL(monitorRecordingUrlRef.current);
    monitorRecordingUrlRef.current = null;
    monitorChunksRef.current = [];
    setLocalMonitorRecording(null);
  }, []);

  const finishMonitorRecording = useCallback(() => {
    const chunks = monitorChunksRef.current;
    monitorChunksRef.current = [];
    if (chunks.length === 0) return;
    if (monitorRecordingUrlRef.current)
      URL.revokeObjectURL(monitorRecordingUrlRef.current);
    const blob = encodeMonoPcm16Wav(chunks, 16_000);
    const url = URL.createObjectURL(blob);
    const filename = `P1-mini-monitor-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.wav`;
    monitorRecordingUrlRef.current = url;
    setLocalMonitorRecording({ url, filename, bytes: blob.size });
  }, []);

  const releaseMonitorAudio = useCallback(() => {
    for (const source of audioSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source may already have ended.
      }
      source.disconnect();
    }
    audioSourcesRef.current.clear();
    monitorGainRef.current?.disconnect();
    monitorGainRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    nextAudioTimeRef.current = 0;
    if (context) void context.close();
  }, []);

  useEffect(() => {
    const unsubscribe = service.subscribeConnectionState((state) => {
      if (state === "connected" || state === "connected-unidentified") {
        setConnected(true);
        if (state === "connected-unidentified") {
          setStatus("Connected, but device identification failed");
        }
        return;
      }
      if (
        state === "idle" ||
        state === "disconnected" ||
        state === "transport-error"
      ) {
        setConnected(false);
        setDeviceInfo(null);
        setLiveMode(false);
        setActivity("idle");
        setRecordingStatus({
          recording: null,
          duration: 0,
          samples: [],
          type: null,
        });
        releasePlayback();
        releaseMonitorAudio();
        releaseLocalMonitorRecording();
        if (state === "transport-error") setStatus("Device transport error");
        if (state === "disconnected") setStatus("Device disconnected");
        if (state === "idle") setStatus("Ready to connect");
      }
    });
    return () => {
      unsubscribe();
      releasePlayback();
      releaseMonitorAudio();
      releaseLocalMonitorRecording();
      service.dispose();
    };
  }, [
    releaseLocalMonitorRecording,
    releaseMonitorAudio,
    releasePlayback,
    service,
  ]);

  const protocolCapabilities = getCapabilities(
    {
      model: deviceInfo?.model,
      versionNumber: deviceInfo?.versionNumber,
    },
    {
      busy,
      liveMode,
      listingFiles: status.startsWith("Streaming file list"),
    },
  );

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
    if (info) setDeviceInfo(info);
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

  const recordingCounts = getLocalRecordingCounts(files);
  const visibleFiles = filterLocalRecordings(files, {
    view: recordingView,
    query: recordingQuery,
  });
  const sortedFiles = [...visibleFiles].sort((a, b) => {
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
      setStatus(
        (error as Error).name === "AbortError"
          ? "Transfer cancelled"
          : (error as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };

  const onConnect = async () =>
    run("Connecting to device...", async () => {
      const info = await service.connect();
      setDeviceInfo(info);
      setConnected(true);
      setStatus(`Connected ${info.model ? `(${info.model})` : ""}`);
      void refreshAfterSuccess();
    });

  const onDisconnect = async () =>
    run("Disconnecting...", async () => {
      releasePlayback();
      releaseMonitorAudio();
      await service.disconnect();
      setConnected(false);
      setDeviceInfo(null);
      setLiveMode(false);
      setFiles([]);
      setSelected({});
      setActivity("idle");
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

  const onDownloadFile = async (file: HiDockFile) => {
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    setActivity("file-transfer");
    try {
      await run(`Downloading ${file.filename}...`, async () => {
        const report = await service.downloadFiles(
          [file],
          "",
          (p) => {
            setProgress({
              current: `${p.filename}: ${formatBytes(p.done)} / ${formatBytes(p.total)}`,
              aggregate: `${formatBytes(p.aggregateDone)} / ${formatBytes(p.aggregateTotal)}`,
            });
          },
          { signal: controller.signal },
        );
        const failures = report.files.filter((f) => f.status !== "success");
        await refreshAfterSuccess();
        setStatus(
          failures.length === 0
            ? `Downloaded ${file.filename} (${formatBytes(report.totalBytesWritten)})`
            : `Download failed for ${file.filename}`,
        );
        setDetails(JSON.stringify(report, null, 2));
      });
    } finally {
      if (playbackAbortRef.current === controller)
        playbackAbortRef.current = null;
      setActivity("idle");
    }
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
    risk: Exclude<LocalActionRisk, "read-only">,
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => Promise<void>,
  ) => {
    if (!canRunLocally(risk, safetyLock)) {
      setStatus("Safety lock is on. Unlock device changes before continuing.");
      return;
    }
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
      "writes-setting",
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
      "writes-setting",
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

  const onToggleRecordOnVibe = async () =>
    run("Toggling record-on-vibration...", async () => {
      const current = await service.getSettings();
      const result = await service.setSettings({
        recordOnVibe: !current.recordOnVibe,
      });
      setDetails(JSON.stringify(result, null, 2));
      await refreshAfterSuccess();
    });

  const requestToggleRecordOnVibe = async () =>
    requestConfirmedAction(
      "writes-setting",
      "Toggle record-on-vibration?",
      "This changes the P1 record-on-vibration setting.",
      "Toggle Vibration",
      onToggleRecordOnVibe,
    );

  const requestFormat = async () => {
    requestConfirmedAction(
      "destructive",
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

    requestDeleteFile(target);
  };

  const requestDeleteFile = (target: HiDockFile) => {
    requestConfirmedAction(
      "destructive",
      "Delete recording?",
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
      "writes-setting",
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
      "device-mode",
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
      "safe-exit",
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
      "destructive",
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
      "safe-exit",
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
      "device-mode",
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
      "device-mode",
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
      "writes-setting",
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
      "writes-setting",
      "Switch recording quality?",
      "This changes the recording quality used by the connected HiDock device.",
      "Switch Quality",
      onSwitchRecordingQuality,
    );

  const onStartRealtime = async () =>
    run("Starting realtime audio...", async () => {
      const result = await service.startRealtime(2);
      setDetails(JSON.stringify(result, null, 2));
      if (result?.result === "success") setLiveMode(true);
    });

  const requestStartRealtime = async () =>
    requestConfirmedAction(
      "device-mode",
      "Start realtime audio?",
      "This puts the device into live audio mode until stopped.",
      "Start Live",
      onStartRealtime,
    );

  const onStopRealtime = async () =>
    run("Stopping realtime audio...", async () => {
      const result = await service.stopRealtime();
      setDetails(JSON.stringify(result, null, 2));
      if (result.result === "success") setLiveMode(false);
    });

  const requestStopRealtime = async () =>
    requestConfirmedAction(
      "safe-exit",
      "Stop realtime audio?",
      "This exits live audio mode on the device.",
      "Stop Live",
      onStopRealtime,
    );

  const onPauseRealtime = async () =>
    run("Pausing realtime audio...", async () => {
      const result = await service.pauseRealtime();
      setDetails(JSON.stringify(result, null, 2));
      if (result.result === "success") setLiveMode(false);
    });

  const requestPauseRealtime = async () =>
    requestConfirmedAction(
      "safe-exit",
      "Pause realtime audio?",
      "This pauses the active live audio stream.",
      "Pause Live",
      onPauseRealtime,
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
      "device-mode",
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
      "device-mode",
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

  const onPlayRecording = async (file: HiDockFile) => {
    if (!getRecordingMimeType(file.filename)) {
      setPlayback({
        file,
        url: null,
        progress: 0,
        error: `Unsupported preview format for ${file.filename}`,
      });
      return;
    }
    releasePlayback();
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    setActivity("file-transfer");
    setBusy(true);
    setStatus(`Preparing ${file.filename} for playback...`);
    setPlayback({ file, url: null, progress: 0 });
    try {
      const transfer = await service.transferRecording(
        file,
        (event) => {
          const percent =
            event.total > 0 ? Math.round((event.done / event.total) * 100) : 0;
          setPlayback({ file, url: null, progress: percent });
          setProgress({
            current: `${event.filename}: ${formatBytes(event.done)} / ${formatBytes(event.total)}`,
            aggregate: `${percent}% ready`,
          });
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(transfer.blob);
      playbackUrlRef.current = url;
      setPlayback({ file, url, progress: 100 });
      setActivity("playback");
      setStatus(`Ready to play ${file.filename}`);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setActivity("idle");
        setStatus("Playback transfer cancelled");
      } else {
        setActivity("error");
        setPlayback({
          file,
          url: null,
          progress: 0,
          error: (error as Error).message,
        });
        setStatus((error as Error).message);
      }
    } finally {
      playbackAbortRef.current = null;
      setBusy(false);
    }
  };

  const stopRecordingPlayback = () => {
    const element = playbackElementRef.current;
    if (element) {
      element.pause();
      element.currentTime = 0;
    }
    setActivity("idle");
    setStatus(`Stopped ${playback.file?.filename ?? "recording"}`);
  };

  const onToggleRecordingPlayback = async (file: HiDockFile) => {
    const action = getRecordingPlaybackAction(
      playback.file?.filename ?? null,
      activity,
      file.filename,
    );
    if (action === "stop") {
      stopRecordingPlayback();
      return;
    }
    if (playback.file?.filename === file.filename && playback.url) {
      try {
        await playbackElementRef.current?.play();
      } catch (error) {
        setStatus((error as Error).message);
      }
      return;
    }
    await onPlayRecording(file);
  };

  const cancelPlaybackTransfer = () => {
    playbackAbortRef.current?.abort();
    releasePlayback();
    setActivity("idle");
    setStatus("Transfer cancelled");
  };

  const downloadPlaybackFallback = async () => {
    if (!playback.file) return;
    await run(`Downloading ${playback.file.filename}...`, async () => {
      const report = await service.downloadFiles(
        [playback.file as HiDockFile],
        "",
        (event) =>
          setProgress({
            current: `${event.filename}: ${formatBytes(event.done)} / ${formatBytes(event.total)}`,
            aggregate: `${formatBytes(event.aggregateDone)} / ${formatBytes(event.aggregateTotal)}`,
          }),
      );
      setDetails(JSON.stringify(report, null, 2));
      setStatus(`Downloaded ${playback.file?.filename ?? "recording"}`);
    });
  };

  const onStartRecording = async () =>
    run("Starting P1 Mini recording...", async () => {
      releasePlayback();
      const result = await service.sendKeyCode(2, 3);
      if (result.result !== "success")
        throw new Error(result.error ?? "The device did not start recording");
      setActivity("recording");
      setStatus("Recording started");
    });

  const requestStartRecording = async () =>
    requestConfirmedAction(
      "device-mode",
      "Start a P1 Mini recording?",
      "This sends the recorder long-press command and creates a new file on the device.",
      "Start Recording",
      onStartRecording,
    );

  const onStopRecording = async () =>
    run("Stopping P1 Mini recording...", async () => {
      setActivity("stopping");
      const result = await service.sendKeyCode(2, 3);
      if (result.result !== "success")
        throw new Error(result.error ?? "The device did not stop recording");
      setStatus("Waiting for the recording file to finish...");
    });

  const onStartMonitor = async () =>
    run("Starting realtime monitor...", async () => {
      releasePlayback();
      releaseMonitorAudio();
      releaseLocalMonitorRecording();
      const result = await service.startRealtime(2);
      if (result?.result !== "success")
        throw new Error(result?.error ?? "Realtime monitor did not start");
      let context: AudioContext;
      try {
        context = new AudioContext({ sampleRate: 16_000 });
        await context.resume();
      } catch (error) {
        await service.stopRealtime().catch(() => undefined);
        throw error;
      }
      const gain = context.createGain();
      gain.gain.value = 1;
      gain.connect(context.destination);
      audioContextRef.current = context;
      monitorGainRef.current = gain;
      nextAudioTimeRef.current = context.currentTime + 0.05;
      monitorStartedAtRef.current = Date.now();
      monitorChunksRef.current = [];
      monitorNoiseStateRef.current = {
        noiseFloor: 0.005,
        previousInput: 0,
        previousOutput: 0,
      };
      setMonitor({
        rms: 0,
        localMuted: false,
        deviceMuted: false,
        rest: 0,
        elapsedSec: 0,
      });
      setLiveMode(true);
      setActivity("realtime-monitor");
      setStatus("Realtime audio monitor active");
    });

  const requestStartMonitor = async () =>
    requestConfirmedAction(
      "device-mode",
      "Start realtime audio monitoring?",
      "This enters P1 Mini realtime mode, suppresses background noise, plays a mono monitor stream, and captures a local WAV in this browser.",
      "Start Monitor",
      onStartMonitor,
    );

  const onStopMonitor = async () =>
    run("Stopping realtime monitor...", async () => {
      const result = await service.stopRealtime();
      finishMonitorRecording();
      setLiveMode(false);
      releaseMonitorAudio();
      setActivity("idle");
      if (result.result !== "success")
        throw new Error(
          result.error ?? "Realtime monitor did not stop cleanly",
        );
      setStatus("Realtime monitor stopped; local WAV is ready");
    });

  const onToggleMonitorMute = () => {
    const nextMuted = !monitor.localMuted;
    if (monitorGainRef.current)
      monitorGainRef.current.gain.value = nextMuted ? 0 : 1;
    setMonitor((current) => ({ ...current, localMuted: nextMuted }));
    setStatus(nextMuted ? "Browser monitor muted" : "Browser monitor unmuted");
  };

  const downloadLocalMonitorRecording = () => {
    if (!localMonitorRecording) return;
    const anchor = document.createElement("a");
    anchor.href = localMonitorRecording.url;
    anchor.download = localMonitorRecording.filename;
    anchor.click();
    setStatus(`Downloaded ${localMonitorRecording.filename}`);
  };

  const loadConfiguration = useCallback(async () => {
    if (
      !connected ||
      activity === "recording" ||
      activity === "stopping" ||
      activity === "file-transfer" ||
      activity === "realtime-monitor"
    )
      return;
    setStatus("Reading P1 Mini configuration...");
    const [settings, quality, audioInput, bluetooth, paired, time] =
      await Promise.allSettled([
        service.getSettings(),
        service.getRecordingQuality(),
        service.getAudioInputDevice(),
        service.getBluetoothStatus(),
        service.getPairedBluetoothDevices(),
        service.getDeviceTime(),
      ]);
    setConfiguration({
      settings: settings.status === "fulfilled" ? settings.value : null,
      quality: quality.status === "fulfilled" ? quality.value.quality : null,
      audioInput:
        audioInput.status === "fulfilled" ? audioInput.value.device : null,
      bluetooth: bluetooth.status === "fulfilled" ? bluetooth.value : null,
      paired: paired.status === "fulfilled" ? paired.value : [],
      deviceTime: time.status === "fulfilled" ? time.value.time : null,
    });
    setStatus("Configuration loaded");
  }, [activity, connected, service]);

  const requestSettingsChange = (
    label: string,
    description: string,
    patch: Partial<DeviceSettings>,
  ) =>
    requestConfirmedAction(
      "writes-setting",
      `${label}?`,
      description,
      label,
      () =>
        run(`${label}...`, async () => {
          const result = await service.setSettings(patch);
          if (result.result !== "success")
            throw new Error(result.error ?? `${label} failed`);
          await loadConfiguration();
        }),
    );

  const requestQualityChange = (quality: RecordingQuality) =>
    requestConfirmedAction(
      "writes-setting",
      "Change recording quality?",
      `This changes future recordings to ${quality === "high" ? "High (768 kbps)" : "Standard (96 kbps)"}.`,
      "Change Quality",
      () =>
        run("Changing recording quality...", async () => {
          const result = await service.setRecordingQuality(quality);
          if (result.result !== "success")
            throw new Error(result.error ?? "Recording quality change failed");
          await loadConfiguration();
        }),
    );

  const requestSyncDeviceTime = () =>
    requestConfirmedAction(
      "writes-setting",
      "Sync device time?",
      "This updates the P1 Mini clock to the current computer time.",
      "Sync Time",
      () =>
        run("Syncing device time...", async () => {
          const result = await service.setDeviceTime(new Date());
          if (result.result !== "success")
            throw new Error(result.error ?? "Device time sync failed");
          await loadConfiguration();
        }),
    );

  const requestFactoryReset = () =>
    requestConfirmedAction(
      "destructive",
      "Factory reset the P1 Mini?",
      "This erases recordings and resets device settings. It cannot be undone.",
      "Factory Reset",
      () =>
        run("Factory resetting device...", async () => {
          const result = await service.factoryReset(true);
          if (result.result !== "success")
            throw new Error(result.error ?? "Factory reset failed");
          setFiles([]);
          setConfiguration({
            settings: null,
            quality: null,
            audioInput: null,
            bluetooth: null,
            paired: [],
            deviceTime: null,
          });
        }),
    );

  useEffect(() => {
    if (activeTab === "configurations" && connected) void loadConfiguration();
  }, [activeTab, connected, loadConfiguration]);

  useEffect(() => {
    if (
      !connected ||
      busy ||
      activity === "file-transfer" ||
      activity === "realtime-monitor"
    )
      return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const current = await service.getRecordingStatus();
        if (cancelled) return;
        setRecordingStatus(current);
        if (current.recording) {
          if (activity === "playback") releasePlayback();
          previousRecordingRef.current = current.recording;
          if (activity !== "stopping") setActivity("recording");
        } else if (previousRecordingRef.current) {
          const completed = previousRecordingRef.current;
          previousRecordingRef.current = null;
          const list = await service.listFiles();
          if (cancelled) return;
          setFiles(list);
          setSelected({});
          setHighlightedFile(completed);
          setActivity("idle");
          setStatus(`Recording complete: ${completed}`);
        } else if (activity === "recording" || activity === "stopping") {
          setActivity("idle");
        }
      } catch (error) {
        logger.error("ui", "recording status poll failed", error);
      } finally {
        if (!cancelled) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activity, busy, connected, releasePlayback, service]);

  useEffect(() => {
    if (activity !== "realtime-monitor" || activeTab === "live") return;
    void service.stopRealtime().catch(() => undefined);
    finishMonitorRecording();
    setLiveMode(false);
    setActivity("idle");
    releaseMonitorAudio();
    setStatus("Realtime monitor stopped when leaving Live Recording");
  }, [
    activeTab,
    activity,
    finishMonitorRecording,
    releaseMonitorAudio,
    service,
  ]);

  useEffect(() => {
    if (activity !== "realtime-monitor") return;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const current = await service.getRealtime();
        if (cancelled) return;
        failures = 0;
        const decoded = decodeRealtimePcm16(current.audioData);
        const processed = suppressRealtimeNoise(
          decoded.left,
          decoded.right,
          monitorNoiseStateRef.current,
        );
        monitorNoiseStateRef.current = processed.state;
        if (processed.mono.length > 0)
          monitorChunksRef.current.push(processed.mono);
        const context = audioContextRef.current;
        const gain = monitorGainRef.current;
        if (context && gain && processed.mono.length > 0) {
          const buffer = context.createBuffer(1, processed.mono.length, 16_000);
          buffer.getChannelData(0).set(processed.mono);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(gain);
          const startAt = Math.max(
            context.currentTime + 0.02,
            nextAudioTimeRef.current,
          );
          source.start(startAt);
          nextAudioTimeRef.current = startAt + buffer.duration;
          audioSourcesRef.current.add(source);
          source.onended = () => {
            source.disconnect();
            audioSourcesRef.current.delete(source);
          };
        }
        setMonitor((previous) => ({
          rms: processed.rms,
          localMuted: previous.localMuted,
          deviceMuted: current.muted,
          rest: current.rest,
          elapsedSec: Math.max(
            0,
            Math.floor((Date.now() - monitorStartedAtRef.current) / 1000),
          ),
        }));
        timer = setTimeout(poll, current.rest > 1 ? 50 : 100);
      } catch (error) {
        failures += 1;
        if (failures >= 5) {
          logger.error(
            "ui",
            "realtime monitor stopped after read failures",
            error,
          );
          void service.stopRealtime().catch(() => undefined);
          finishMonitorRecording();
          setLiveMode(false);
          setActivity("error");
          setStatus("Realtime monitor stopped after repeated read failures");
          releaseMonitorAudio();
          return;
        }
        timer = setTimeout(poll, 100);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      void service.stopRealtime().catch(() => undefined);
      releaseMonitorAudio();
    };
  }, [activity, finishMonitorRecording, releaseMonitorAudio, service]);

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
    for (const file of visibleFiles) next[file.filename] = checked;
    setSelected((previous) => ({ ...previous, ...next }));
  };

  const lockedReason = safetyLock
    ? "Safety lock is on. Unlock device changes to use this control."
    : undefined;
  const settingsLocked = !canRunLocally("writes-setting", safetyLock);
  const deviceModeLocked = !canRunLocally("device-mode", safetyLock);
  const destructiveLocked = !canRunLocally("destructive", safetyLock);
  const deviceActivityLocked =
    activity === "recording" ||
    activity === "stopping" ||
    activity === "file-transfer" ||
    activity === "realtime-monitor";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <HardDrive className="h-6 w-6" />
            HiDock Manager
          </h1>
          <p className="text-muted-foreground">
            Manage P1 Mini recordings directly in this browser without a HiNotes
            account or upload step.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Implementation and hardware validation scope: HiDock P1 Mini only.
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
            disabled={
              busy ||
              !connected ||
              deviceActivityLocked ||
              !protocolCapabilities.fileList.allowed
            }
            title={protocolCapabilities.fileList.reason}
            onClick={onListFiles}
          >
            <RefreshCw className="h-4 w-4" />
            List Files
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

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Local-only USB workspace</AlertTitle>
        <AlertDescription>
          Device commands travel only between this browser and the connected P1
          Mini. Recordings leave the device only when you download them to your
          computer; this page has no cloud upload action.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Device-change safety lock</p>
            <p className="text-sm text-muted-foreground">
              Keep this on for read-only inspection and downloads. Unlocking
              enables setting, device-mode, and destructive controls; every
              action still asks for confirmation. Disconnect and stop controls
              remain available as safe exits.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={safetyLock}
            onCheckedChange={(checked) => setSafetyLock(checked === true)}
            aria-label="Device-change safety lock"
          />
          {safetyLock ? "Safety lock on" : "Device changes unlocked"}
        </label>
      </div>

      <Card className="overflow-hidden border-primary/20">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`relative flex h-3 w-3 shrink-0 rounded-full ${
                activity === "recording" || activity === "stopping"
                  ? "bg-red-500"
                  : activity === "realtime-monitor"
                    ? "bg-emerald-500"
                    : connected
                      ? "bg-primary"
                      : "bg-muted-foreground/40"
              }`}
            >
              {(activity === "recording" ||
                activity === "realtime-monitor") && (
                <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-50" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {activity === "recording" || activity === "stopping"
                  ? `Recording ${formatElapsed(recordingStatus.duration)}`
                  : activity === "realtime-monitor"
                    ? `Realtime monitor ${formatElapsed(monitor.elapsedSec)}`
                    : status}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {recordingStatus.recording ??
                  (connected
                    ? `${deviceInfo?.model ?? "P1 Mini"} connected · ${progress.current}`
                    : "Connect the P1 Mini to begin")}
              </p>
            </div>
            <MiniWaveform
              samples={
                activity === "realtime-monitor"
                  ? [monitor.rms]
                  : recordingStatus.samples
              }
              active={
                activity === "recording" ||
                activity === "stopping" ||
                activity === "realtime-monitor"
              }
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {(activity === "recording" || activity === "stopping") && (
              <Button
                variant="destructive"
                disabled={busy || activity === "stopping"}
                onClick={onStopRecording}
              >
                <PauseCircle className="h-4 w-4" />
                Stop Recording
              </Button>
            )}
            {activity === "realtime-monitor" && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={onStopMonitor}
              >
                <PauseCircle className="h-4 w-4" />
                Stop Monitor
              </Button>
            )}
            {activity === "file-transfer" && (
              <Button variant="outline" onClick={cancelPlaybackTransfer}>
                <X className="h-4 w-4" />
                Cancel Transfer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ManagerTab)}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 lg:grid-cols-4">
          <TabsTrigger value="recordings">Recordings</TabsTrigger>
          <TabsTrigger value="live">Live Recording</TabsTrigger>
          <TabsTrigger value="configurations">Configurations</TabsTrigger>
          <TabsTrigger value="tools">Device Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="recordings" className="space-y-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Local Recordings</CardTitle>
                <CardDescription>
                  HiNotes-style Notes and Whispers views backed only by the
                  files reported by your connected P1 Mini.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["all", "All", recordingCounts.all],
                        ["notes", "Notes", recordingCounts.notes],
                        ["whispers", "Whispers", recordingCounts.whispers],
                      ] as const
                    ).map(([view, label, count]) => (
                      <Button
                        key={view}
                        size="sm"
                        variant={recordingView === view ? "default" : "outline"}
                        onClick={() => setRecordingView(view)}
                      >
                        {label} {count}
                      </Button>
                    ))}
                  </div>
                  <Input
                    className="lg:max-w-xs"
                    value={recordingQuery}
                    onChange={(event) => setRecordingQuery(event.target.value)}
                    placeholder={`Search ${recordingView}`}
                    aria-label="Search local recordings"
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            visibleFiles.length > 0 &&
                            visibleFiles.every(
                              (file) => selected[file.filename],
                            )
                          }
                          onCheckedChange={(checked) =>
                            toggleAll(checked === true)
                          }
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
                      <TableHead>View</TableHead>
                      <TableHead className="w-16 text-right">
                        <span className="sr-only">Playback</span>
                      </TableHead>
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFiles.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center text-muted-foreground"
                        >
                          {files.length === 0
                            ? "No recordings loaded yet. Connect and list files to begin."
                            : "No local recordings match this view."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedFiles.map((file) => (
                        <TableRow
                          key={file.filename}
                          className={
                            highlightedFile === file.filename
                              ? "bg-primary/10"
                              : undefined
                          }
                        >
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
                          <TableCell>
                            {file.mode === "whisper" ? "Whisper" : "Note"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant={
                                playback.file?.filename === file.filename
                                  ? "secondary"
                                  : "outline"
                              }
                              disabled={
                                busy ||
                                !connected ||
                                activity === "recording" ||
                                activity === "stopping" ||
                                activity === "realtime-monitor"
                              }
                              onClick={() => onToggleRecordingPlayback(file)}
                              aria-label={`${
                                getRecordingPlaybackAction(
                                  playback.file?.filename ?? null,
                                  activity,
                                  file.filename,
                                ) === "stop"
                                  ? "Stop"
                                  : "Play"
                              } ${file.filename}`}
                              title={`${
                                getRecordingPlaybackAction(
                                  playback.file?.filename ?? null,
                                  activity,
                                  file.filename,
                                ) === "stop"
                                  ? "Stop"
                                  : "Play"
                              } ${file.filename}`}
                            >
                              {getRecordingPlaybackAction(
                                playback.file?.filename ?? null,
                                activity,
                                file.filename,
                              ) === "stop" ? (
                                <PauseCircle className="h-4 w-4" />
                              ) : (
                                <PlayCircle className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={
                                    busy ||
                                    !connected ||
                                    activity === "recording" ||
                                    activity === "stopping" ||
                                    activity === "file-transfer" ||
                                    activity === "playback" ||
                                    activity === "realtime-monitor"
                                  }
                                  aria-label={`Actions for ${file.filename}`}
                                  title={`Actions for ${file.filename}`}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => void onDownloadFile(file)}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  disabled={destructiveLocked}
                                  onSelect={() => requestDeleteFile(file)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {playback.file && (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{playback.file.filename}</p>
                        <p className="text-sm text-muted-foreground">
                          Temporary browser playback · cleared on disconnect or
                          reload
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {activity === "file-transfer" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelPlaybackTransfer}
                          >
                            Cancel
                          </Button>
                        )}
                        {playback.error && (
                          <Button size="sm" onClick={downloadPlaybackFallback}>
                            <Download className="h-4 w-4" />
                            Download instead
                          </Button>
                        )}
                      </div>
                    </div>
                    {!playback.url && !playback.error && (
                      <Progress value={playback.progress} className="h-2" />
                    )}
                    {playback.url && (
                      <audio
                        ref={playbackElementRef}
                        className="w-full"
                        controls
                        autoPlay
                        src={playback.url}
                        onPlay={() => {
                          setActivity("playback");
                        }}
                        onPause={() => {
                          setActivity("idle");
                        }}
                        onEnded={() => {
                          setActivity("idle");
                        }}
                        onError={() =>
                          setPlayback((current) => ({
                            ...current,
                            error:
                              "This browser could not decode the recording.",
                          }))
                        }
                      />
                    )}
                    {playback.error && (
                      <p className="text-sm text-destructive">
                        {playback.error}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="live" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Radio className="h-5 w-5 text-red-500" />
                  P1 Mini Recording
                </CardTitle>
                <CardDescription>
                  Create a normal recording on the device. Completed files stay
                  on the P1 Mini until you choose Play or Download.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="overflow-hidden rounded-lg border bg-muted/30 p-5">
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground">
                        {recordingStatus.recording ? "Recording" : "Ready"}
                      </p>
                      <p className="mt-1 font-mono text-3xl tabular-nums">
                        {formatElapsed(recordingStatus.duration)}
                      </p>
                      <p className="mt-1 max-w-full truncate text-sm text-muted-foreground">
                        {recordingStatus.recording ?? "No active recording"}
                      </p>
                    </div>
                    <MiniWaveform
                      samples={recordingStatus.samples}
                      active={Boolean(recordingStatus.recording)}
                      large
                    />
                  </div>
                </div>
                {activity === "recording" || activity === "stopping" ? (
                  <Button
                    className="w-full"
                    variant="destructive"
                    disabled={busy || activity === "stopping"}
                    onClick={onStopRecording}
                  >
                    <PauseCircle className="h-4 w-4" />
                    {activity === "stopping"
                      ? "Finishing recording..."
                      : "Stop Recording"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={
                      busy ||
                      !connected ||
                      deviceModeLocked ||
                      activity === "file-transfer" ||
                      activity === "realtime-monitor" ||
                      !protocolCapabilities.recordingControl.allowed
                    }
                    title={
                      lockedReason ??
                      protocolCapabilities.recordingControl.reason
                    }
                    onClick={requestStartRecording}
                  >
                    <Radio className="h-4 w-4" />
                    Start Recording
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  Realtime Audio Monitor
                </CardTitle>
                <CardDescription>
                  Experimental 16 kHz mono monitoring with adaptive noise
                  suppression. Audio is captured locally as a downloadable WAV
                  and is never written to the P1 Mini.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Meter label="Input level" value={monitor.rms} />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <StatusCard
                    label="Elapsed"
                    value={formatElapsed(monitor.elapsedSec)}
                  />
                  <StatusCard label="Buffer" value={String(monitor.rest)} />
                  <StatusCard
                    label="Mute"
                    value={monitor.localMuted ? "Muted" : "Open"}
                  />
                </div>
                {activity === "realtime-monitor" ? (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={onToggleMonitorMute}
                    >
                      {monitor.localMuted ? (
                        <Volume2 className="h-4 w-4" />
                      ) : (
                        <VolumeX className="h-4 w-4" />
                      )}
                      {monitor.localMuted
                        ? "Unmute Browser Audio"
                        : "Mute Browser Audio"}
                    </Button>
                    <Button
                      className="flex-1"
                      variant="destructive"
                      disabled={busy}
                      onClick={onStopMonitor}
                    >
                      <PauseCircle className="h-4 w-4" />
                      Stop & Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    disabled={
                      busy ||
                      !connected ||
                      deviceModeLocked ||
                      activity === "recording" ||
                      activity === "stopping" ||
                      activity === "file-transfer" ||
                      !protocolCapabilities.startRealtime.allowed
                    }
                    title={
                      lockedReason ?? protocolCapabilities.startRealtime.reason
                    }
                    onClick={requestStartMonitor}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Monitor
                  </Button>
                )}
                {localMonitorRecording && (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">Local monitor recording</p>
                        <p className="text-sm text-muted-foreground">
                          {localMonitorRecording.filename} ·{" "}
                          {formatBytes(localMonitorRecording.bytes)}
                        </p>
                      </div>
                      <Button onClick={downloadLocalMonitorRecording}>
                        <Download className="h-4 w-4" />
                        Download WAV
                      </Button>
                    </div>
                    <audio
                      className="w-full"
                      controls
                      src={localMonitorRecording.url}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="configurations" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Configurations</CardTitle>
                <CardDescription>
                  P1 Mini settings are read from the device. Every write waits
                  for confirmation before the displayed value changes.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !connected}
                onClick={loadConfiguration}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="divide-y">
              <ConfigurationRow
                title="Recording quality"
                description="Standard uses smaller 96 kbps files; High records at 768 kbps for up to one hour."
              >
                <Select
                  value={configuration.quality ?? undefined}
                  disabled={busy || !connected || settingsLocked}
                  onValueChange={(value) =>
                    requestQualityChange(value as RecordingQuality)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="Read from device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Standard (96 kbps)</SelectItem>
                    <SelectItem value="high">High (768 kbps)</SelectItem>
                  </SelectContent>
                </Select>
              </ConfigurationRow>
              <ConfigurationRow
                title="Audio input source"
                description="Reported by the P1 Mini. The device selects and controls this source automatically."
              >
                <div
                  className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium"
                  aria-label="Device-reported audio input source"
                >
                  {configuration.audioInput === "bt-mic"
                    ? "Bluetooth microphone"
                    : configuration.audioInput === "mic"
                      ? "Built-in microphone"
                      : "Not read yet"}
                </div>
              </ConfigurationRow>
              <ConfigurationRow
                title="Auto Record"
                description="Record supported phone calls automatically."
              >
                <Switch
                  checked={configuration.settings?.autoRecord ?? false}
                  disabled={busy || !connected || settingsLocked}
                  onCheckedChange={(checked) =>
                    requestSettingsChange(
                      checked ? "Enable Auto Record" : "Disable Auto Record",
                      "This changes the device auto-record setting.",
                      { autoRecord: checked },
                    )
                  }
                  aria-label="Auto Record"
                />
              </ConfigurationRow>
              <ConfigurationRow
                title="Auto Play"
                description="Play recordings automatically when supported by the device."
              >
                <Switch
                  checked={configuration.settings?.autoPlay ?? false}
                  disabled={busy || !connected || settingsLocked}
                  onCheckedChange={(checked) =>
                    requestSettingsChange(
                      checked ? "Enable Auto Play" : "Disable Auto Play",
                      "This changes the device auto-play setting.",
                      { autoPlay: checked },
                    )
                  }
                  aria-label="Auto Play"
                />
              </ConfigurationRow>
              <ConfigurationRow
                title="Notify About Recording"
                description='Play the device "Recording Started" notification.'
              >
                <Switch
                  checked={configuration.settings?.notificationSound ?? false}
                  disabled={busy || !connected || settingsLocked}
                  onCheckedChange={(checked) =>
                    requestSettingsChange(
                      checked
                        ? "Enable Recording Notification"
                        : "Disable Recording Notification",
                      "This changes the P1 Mini recording notification setting.",
                      { notificationSound: checked },
                    )
                  }
                  aria-label="Recording notification"
                />
              </ConfigurationRow>
              <ConfigurationRow
                title="Bluetooth earphones"
                description={
                  configuration.bluetooth?.connected
                    ? `Connected to ${configuration.bluetooth.name ?? configuration.bluetooth.mac}`
                    : `${configuration.paired.length} paired device${configuration.paired.length === 1 ? "" : "s"}.`
                }
              >
                <Button
                  variant="outline"
                  disabled={busy || !connected}
                  onClick={loadConfiguration}
                >
                  <Bluetooth className="h-4 w-4" />
                  Refresh Devices
                </Button>
              </ConfigurationRow>
              <ConfigurationRow
                title="Device time"
                description={configuration.deviceTime ?? "Not read yet"}
              >
                <Button
                  variant="outline"
                  disabled={busy || !connected || settingsLocked}
                  onClick={requestSyncDeviceTime}
                >
                  <Clock3 className="h-4 w-4" />
                  Sync with Computer
                </Button>
              </ConfigurationRow>
              <ConfigurationRow
                title="Save Vibe-mic Recordings"
                description="Unsupported on the P1 Mini."
                disabled
              >
                <Switch
                  disabled
                  checked={false}
                  aria-label="Vibe-mic unsupported"
                />
              </ConfigurationRow>
              <ConfigurationRow
                title="WebUSB timeout"
                description="Unsupported by P1 Mini firmware; the control is intentionally unavailable."
                disabled
              >
                <Button variant="outline" disabled>
                  Unavailable
                </Button>
              </ConfigurationRow>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
              <CardDescription>
                Factory reset erases recordings and restores device settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end">
              <Button
                variant="destructive"
                disabled={
                  busy ||
                  !connected ||
                  destructiveLocked ||
                  !protocolCapabilities.factoryReset.allowed
                }
                title={lockedReason ?? protocolCapabilities.factoryReset.reason}
                onClick={requestFactoryReset}
              >
                Factory Reset
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Device Actions</CardTitle>
              <CardDescription>
                Read-only controls stay available under the safety lock. Locked
                controls show why they cannot run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset
                disabled={deviceActivityLocked}
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-5"
                title={
                  deviceActivityLocked
                    ? "Device tools are paused while recording, transferring, or monitoring."
                    : undefined
                }
              >
                <ActionButton
                  disabled={busy || !connected}
                  icon={Info}
                  onClick={onGetDeviceInfo}
                  label="Device Info"
                />
                <ActionButton
                  disabled={
                    busy || !connected || !protocolCapabilities.fileList.allowed
                  }
                  unavailableReason={protocolCapabilities.fileList.reason}
                  icon={ListOrdered}
                  onClick={onGetFileCount}
                  label="File Count"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.recordingFile.allowed
                  }
                  unavailableReason={protocolCapabilities.recordingFile.reason}
                  icon={HardDrive}
                  onClick={onRecordingFile}
                  label="Recording File"
                />
                <ActionButton
                  disabled={
                    busy || !connected || !protocolCapabilities.cardInfo.allowed
                  }
                  unavailableReason={protocolCapabilities.cardInfo.reason}
                  icon={HardDrive}
                  onClick={onGetCardInfo}
                  label="Card Info"
                />
                <ActionButton
                  disabled={
                    busy || !connected || !protocolCapabilities.battery.allowed
                  }
                  unavailableReason={protocolCapabilities.battery.reason}
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
                  disabled={busy || !connected || settingsLocked}
                  unavailableReason={lockedReason}
                  icon={Clock3}
                  onClick={requestSetNow}
                  label="Set Time Now"
                />
                <ActionButton
                  disabled={
                    busy || !connected || !protocolCapabilities.settings.allowed
                  }
                  unavailableReason={protocolCapabilities.settings.reason}
                  icon={Settings2}
                  onClick={onGetSettings}
                  label="Get Settings"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    settingsLocked ||
                    !protocolCapabilities.settings.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.settings.reason
                  }
                  icon={Settings2}
                  onClick={requestSetSettings}
                  label="Toggle AutoRecord"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    settingsLocked ||
                    !protocolCapabilities.settings.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.settings.reason
                  }
                  icon={Bell}
                  onClick={requestToggleNotification}
                  label="Toggle Notification"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    settingsLocked ||
                    !protocolCapabilities.recordOnVibe.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.recordOnVibe.reason
                  }
                  icon={Radio}
                  onClick={requestToggleRecordOnVibe}
                  label="Toggle Vibration"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.bluetoothStatus.allowed
                  }
                  unavailableReason={
                    protocolCapabilities.bluetoothStatus.reason
                  }
                  icon={Bluetooth}
                  onClick={onBluetoothStatus}
                  label="Bluetooth Status"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    deviceModeLocked ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.bluetooth.reason
                  }
                  icon={Bluetooth}
                  onClick={requestStartBluetoothScan}
                  label="Start Scan"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={protocolCapabilities.bluetooth.reason}
                  icon={Bluetooth}
                  onClick={requestStopBluetoothScan}
                  label="Stop Scan"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={protocolCapabilities.bluetooth.reason}
                  icon={Bluetooth}
                  onClick={onBluetoothScanResults}
                  label="Scan Results"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={protocolCapabilities.bluetooth.reason}
                  icon={Bluetooth}
                  onClick={onPairedBluetoothDevices}
                  label="Paired Devices"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    destructiveLocked ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.bluetooth.reason
                  }
                  icon={Trash2}
                  onClick={requestClearPairedBluetoothDevices}
                  label="Clear Paired"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={protocolCapabilities.bluetooth.reason}
                  icon={Bluetooth}
                  onClick={requestDisconnectBluetoothDevice}
                  label="Disconnect BT"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    deviceModeLocked ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.bluetooth.reason
                  }
                  icon={Bluetooth}
                  onClick={requestConnectBluetoothDevice}
                  label="Connect BT"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    deviceModeLocked ||
                    !protocolCapabilities.bluetooth.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.bluetooth.reason
                  }
                  icon={Bluetooth}
                  onClick={requestReconnectBluetoothDevice}
                  label="Reconnect BT"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    !protocolCapabilities.webUsbTimeout.allowed
                  }
                  unavailableReason={protocolCapabilities.webUsbTimeout.reason}
                  icon={Usb}
                  onClick={onGetWebUsbTimeout}
                  label="Get Timeout"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    settingsLocked ||
                    !protocolCapabilities.webUsbTimeout.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.webUsbTimeout.reason
                  }
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
                  disabled={busy || !connected || settingsLocked}
                  unavailableReason={lockedReason}
                  icon={Volume2}
                  onClick={requestSwitchRecordingQuality}
                  label="Switch Quality"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    deviceModeLocked ||
                    !protocolCapabilities.startRealtime.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.startRealtime.reason
                  }
                  icon={PlayCircle}
                  onClick={requestStartRealtime}
                  label="Start Live"
                />
                <ActionButton
                  disabled={busy || !connected || !liveMode}
                  unavailableReason={
                    liveMode
                      ? undefined
                      : "Pause is available only during live mode."
                  }
                  icon={PauseCircle}
                  onClick={requestPauseRealtime}
                  label="Pause Live"
                />
                <ActionButton
                  disabled={busy || !connected || !liveMode}
                  unavailableReason={
                    liveMode
                      ? undefined
                      : "Live status is available only during live mode."
                  }
                  icon={Radio}
                  onClick={onGetRealtime}
                  label="Live Status"
                />
                <ActionButton
                  disabled={busy || !connected || !liveMode}
                  unavailableReason={
                    liveMode
                      ? undefined
                      : "Stop is available only during live mode."
                  }
                  icon={PauseCircle}
                  onClick={requestStopRealtime}
                  label="Stop Live"
                />
                <ActionButton
                  disabled={busy || !connected || deviceModeLocked}
                  unavailableReason={lockedReason}
                  icon={Database}
                  onClick={requestEnterMassStorageMode}
                  label="Mass Storage"
                />
                <ActionButton
                  disabled={busy || !connected || deviceModeLocked}
                  unavailableReason={lockedReason}
                  icon={Keyboard}
                  onClick={() => requestSendKeyCode("Mute Key", 1, 4)}
                  label="Mute Key"
                />
                <ActionButton
                  disabled={busy || !connected || deviceModeLocked}
                  unavailableReason={lockedReason}
                  icon={Keyboard}
                  onClick={() => requestSendKeyCode("Record Key", 2, 3)}
                  label="Record Key"
                />
                <ActionButton
                  disabled={busy || !connected || deviceModeLocked}
                  unavailableReason={lockedReason}
                  icon={Keyboard}
                  onClick={() => requestSendKeyCode("Playback Key", 3, 5)}
                  label="Playback Key"
                />
                <ActionButton
                  disabled={busy || !connected || destructiveLocked}
                  unavailableReason={lockedReason}
                  icon={Trash2}
                  onClick={requestDeleteFirstSelected}
                  label="Delete One"
                />
                <ActionButton
                  disabled={
                    busy ||
                    !connected ||
                    destructiveLocked ||
                    !protocolCapabilities.cardInfo.allowed
                  }
                  unavailableReason={
                    lockedReason ?? protocolCapabilities.cardInfo.reason
                  }
                  icon={HardDrive}
                  onClick={requestFormat}
                  label="Format Card"
                />
              </fieldset>
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
        </TabsContent>
      </Tabs>

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
  unavailableReason,
}: {
  disabled: boolean;
  icon: LucideIcon;
  onClick: () => Promise<void>;
  label: string;
  unavailableReason?: string;
}) {
  return (
    <Button
      variant="outline"
      disabled={disabled}
      title={disabled ? unavailableReason : undefined}
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

function ConfigurationRow({
  title,
  description,
  disabled = false,
  children,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <div className="max-w-2xl">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function MiniWaveform({
  samples,
  active,
  large = false,
}: {
  samples: number[];
  active: boolean;
  large?: boolean;
}) {
  const normalized = samples.length > 0 ? samples.slice(-24) : [0];
  return (
    <div
      className={`min-w-0 items-center justify-center gap-0.5 overflow-hidden ${
        large
          ? "flex h-20 w-40 max-w-[45%] shrink"
          : "hidden h-10 w-28 max-w-[30%] shrink sm:flex"
      }`}
      aria-label={active ? "Live audio waveform" : "Audio waveform idle"}
    >
      {Array.from({ length: 24 }, (_, index) => {
        const raw = normalized[index % normalized.length] ?? 0;
        const magnitude = Math.abs(raw > 1 ? raw / 255 : raw);
        const height = active ? 8 + Math.min(1, magnitude) * 48 : 4;
        return (
          <span
            key={index}
            className={`min-w-0 flex-1 rounded-full transition-all ${
              active ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-muted-foreground">
          {percent.toFixed(0)}%
        </span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return [hours, minutes, remaining]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
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
