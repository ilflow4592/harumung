import { NativeModule, requireNativeModule } from 'expo';

import type {
  CaptureFrameResult,
  MediaToolsModuleEvents,
  MuteResult,
  TranscodeResult,
  TrimResult,
} from './MediaTools.types';

declare class MediaToolsModule extends NativeModule<MediaToolsModuleEvents> {
  /** 입력 영상을 H.264 720p 30fps mp4로 변환한다. 출력은 새 파일. */
  transcode720p(inputPath: string): Promise<TranscodeResult>;
  /** startMs~endMs 구간만 남긴다. 출력은 새 파일. */
  trim(inputPath: string, startMs: number, endMs: number): Promise<TrimResult>;
  /** 오디오 트랙을 제거한다. 출력은 새 파일. */
  mute(inputPath: string): Promise<MuteResult>;
  /** atMs 시점의 프레임을 JPEG로 저장한다. */
  captureFrame(inputPath: string, atMs: number): Promise<CaptureFrameResult>;
}

export default requireNativeModule<MediaToolsModule>('MediaTools');
