import { registerWebModule, NativeModule } from 'expo';

import type { MediaToolsModuleEvents } from './MediaTools.types';

class MediaToolsModule extends NativeModule<MediaToolsModuleEvents> {
  async transcode720p(): Promise<never> {
    throw new Error('MediaTools는 웹에서 지원하지 않습니다.');
  }
  async trim(): Promise<never> {
    throw new Error('MediaTools는 웹에서 지원하지 않습니다.');
  }
  async mute(): Promise<never> {
    throw new Error('MediaTools는 웹에서 지원하지 않습니다.');
  }
  async captureFrame(): Promise<never> {
    throw new Error('MediaTools는 웹에서 지원하지 않습니다.');
  }
}

export default registerWebModule(MediaToolsModule, 'MediaTools');
