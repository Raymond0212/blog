import type { HiDockFile } from "@/features/hidock/types/device";

export type LocalRecordingView = "all" | "notes" | "whispers";
export type LocalActionRisk =
  | "read-only"
  | "safe-exit"
  | "writes-setting"
  | "device-mode"
  | "destructive";

export function filterLocalRecordings(
  files: HiDockFile[],
  options: { view: LocalRecordingView; query: string },
): HiDockFile[] {
  const query = options.query.trim().toLocaleLowerCase();

  return files.filter((file) => {
    const inView =
      options.view === "all" ||
      (options.view === "whispers"
        ? file.mode === "whisper"
        : file.mode !== "whisper");
    const matchesQuery =
      query.length === 0 || file.filename.toLocaleLowerCase().includes(query);
    return inView && matchesQuery;
  });
}

export function getLocalRecordingCounts(files: HiDockFile[]): {
  all: number;
  notes: number;
  whispers: number;
} {
  const whispers = files.filter((file) => file.mode === "whisper").length;
  return {
    all: files.length,
    notes: files.length - whispers,
    whispers,
  };
}

export function canRunLocally(
  risk: LocalActionRisk,
  safetyLock: boolean,
): boolean {
  return !safetyLock || risk === "read-only" || risk === "safe-exit";
}

export function getRecordingMimeType(filename: string): string | null {
  const normalized = filename.toLocaleLowerCase();
  if (normalized.endsWith(".mp3") || normalized.endsWith(".hda")) {
    return "audio/mpeg";
  }
  if (normalized.endsWith(".wav")) return "audio/wav";
  return null;
}

export function getRecordingPlaybackAction(
  activeFilename: string | null,
  activity: string,
  filename: string,
): "play" | "stop" {
  return activeFilename === filename && activity === "playback"
    ? "stop"
    : "play";
}
