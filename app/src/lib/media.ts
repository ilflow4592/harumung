import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ulid } from 'ulid';

import { MediaTools } from '../../modules/media-tools';

const mediaDir = new Directory(Paths.document, 'media');

function ensureDir(): void {
  if (!mediaDir.exists) mediaDir.create();
}

/** 촬영 원본을 앱 문서 폴더로 옮기고 경로를 돌려준다. */
export function persistCapture(tempPath: string, ext: 'jpg' | 'mp4'): string {
  ensureDir();
  const dest = new File(mediaDir, `${ulid()}.${ext}`);
  new File(tempPath).move(dest);
  return dest.uri;
}

/** 긴 변 400px JPEG 썸네일. */
export async function makeThumbnail(imagePath: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(imagePath).resize({ width: 400 });
  const rendered = await ctx.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return result.uri;
}

/** 영상: 720p로 변환하고 첫 프레임 썸네일을 만든다. */
export async function processVideo(
  tempPath: string,
): Promise<{ localPath: string; thumbPath: string; durationMs: number; sizeBytes: number }> {
  const transcoded = await MediaTools.transcode720p(tempPath);
  const localPath = persistCapture(transcoded.outputPath, 'mp4');
  const frame = await MediaTools.captureFrame(localPath, 0);
  const thumbPath = await makeThumbnail(frame.imagePath);
  return { localPath, thumbPath, durationMs: transcoded.durationMs, sizeBytes: transcoded.sizeBytes };
}

export function fileSize(path: string): number | null {
  const f = new File(path);
  return f.exists ? (f.size ?? null) : null;
}
