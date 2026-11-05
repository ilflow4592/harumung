export type TranscodeResult = {
  outputPath: string;
  durationMs: number;
  sizeBytes: number;
};

export type TrimResult = { outputPath: string };
export type MuteResult = { outputPath: string };
export type CaptureFrameResult = { imagePath: string };

export type ProgressEvent = { jobId: string; progress: number };

export type MediaToolsModuleEvents = {
  onProgress: (event: ProgressEvent) => void;
};
