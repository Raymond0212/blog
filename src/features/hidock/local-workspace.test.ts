import { describe, expect, it } from "vitest";

import * as workspace from "@/features/hidock/local-workspace";
import {
  canRunLocally,
  filterLocalRecordings,
  getLocalRecordingCounts,
} from "@/features/hidock/local-workspace";
import type { HiDockFile } from "@/features/hidock/types/device";

const recordings: HiDockFile[] = [
  {
    filename: "20260802-standup.wav",
    fileLength: 1200,
    createdAtRaw: "2026-08-02 09:00:00",
    durationSec: 60,
    durationLabel: "01:00",
    mode: "room",
  },
  {
    filename: "20260802-private-idea.wav",
    fileLength: 800,
    createdAtRaw: "2026-08-02 10:00:00",
    durationSec: 30,
    durationLabel: "00:30",
    mode: "whisper",
  },
  {
    filename: "20260801-call.wav",
    fileLength: 2400,
    createdAtRaw: "2026-08-01 15:00:00",
    durationSec: 120,
    durationLabel: "02:00",
    mode: "call",
  },
];

describe("local HiDock workspace", () => {
  it("keeps whisper recordings out of the Notes view", () => {
    expect(
      filterLocalRecordings(recordings, { view: "notes", query: "" }).map(
        (file) => file.filename,
      ),
    ).toEqual(["20260802-standup.wav", "20260801-call.wav"]);
  });

  it("searches the selected local view without changing the source list", () => {
    const result = filterLocalRecordings(recordings, {
      view: "all",
      query: "PRIVATE",
    });

    expect(result.map((file) => file.filename)).toEqual([
      "20260802-private-idea.wav",
    ]);
    expect(recordings).toHaveLength(3);
  });

  it("reports counts for all, note, and whisper recordings", () => {
    expect(getLocalRecordingCounts(recordings)).toEqual({
      all: 3,
      notes: 2,
      whispers: 1,
    });
  });

  it("allows reads and safe exits while locking device changes", () => {
    expect(canRunLocally("read-only", true)).toBe(true);
    expect(canRunLocally("safe-exit", true)).toBe(true);
    expect(canRunLocally("writes-setting", true)).toBe(false);
    expect(canRunLocally("device-mode", true)).toBe(false);
    expect(canRunLocally("destructive", true)).toBe(false);
    expect(canRunLocally("destructive", false)).toBe(true);
  });

  it("maps device recording extensions to browser playback MIME types", () => {
    const getRecordingMimeType = (
      workspace as typeof workspace & {
        getRecordingMimeType?: (filename: string) => string | null;
      }
    ).getRecordingMimeType;

    expect(typeof getRecordingMimeType).toBe("function");
    if (!getRecordingMimeType) return;

    expect(getRecordingMimeType("meeting.MP3")).toBe("audio/mpeg");
    expect(getRecordingMimeType("meeting.hda")).toBe("audio/mpeg");
    expect(getRecordingMimeType("meeting.wav")).toBe("audio/wav");
    expect(getRecordingMimeType("meeting.bin")).toBeNull();
  });

  it("shows Stop only for the recording that is actively playing", () => {
    const getRecordingPlaybackAction = (
      workspace as typeof workspace & {
        getRecordingPlaybackAction?: (
          activeFilename: string | null,
          activity: "idle" | "file-transfer" | "playback",
          filename: string,
        ) => "play" | "stop";
      }
    ).getRecordingPlaybackAction;

    expect(typeof getRecordingPlaybackAction).toBe("function");
    if (!getRecordingPlaybackAction) return;

    expect(
      getRecordingPlaybackAction("meeting.wav", "playback", "meeting.wav"),
    ).toBe("stop");
    expect(
      getRecordingPlaybackAction("meeting.wav", "idle", "meeting.wav"),
    ).toBe("play");
    expect(
      getRecordingPlaybackAction("meeting.wav", "file-transfer", "meeting.wav"),
    ).toBe("play");
    expect(
      getRecordingPlaybackAction("other.wav", "playback", "meeting.wav"),
    ).toBe("play");
  });
});
