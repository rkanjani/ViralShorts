import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

type ProgressCallback = (progress: number) => void;

export interface ExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  format?: 'mp4' | 'webm';
}

export interface SubtitleConfig {
  text: string;
  startTime: number;
  endTime: number;
  style?: {
    color?: string;
    fontSize?: number;
    fontWeight?: string;
  };
}

class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private isLoaded = false;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    this.loadPromise = this._loadFFmpeg();

    try {
      await this.loadPromise;
      this.isLoaded = true;
    } finally {
      this.isLoading = false;
    }
  }

  private async _loadFFmpeg(): Promise<void> {
    this.ffmpeg = new FFmpeg();

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    console.log('FFmpeg loaded successfully');
  }

  private ensureLoaded(): void {
    if (!this.ffmpeg || !this.isLoaded) {
      throw new Error('FFmpeg not loaded. Call load() first.');
    }
  }

  async trimVideo(
    inputUrl: string,
    startTime: number,
    duration: number,
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    this.ensureLoaded();

    const inputFileName = 'input.mp4';
    const outputFileName = 'output.mp4';

    // Set up progress tracking
    if (onProgress) {
      this.ffmpeg!.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Write input file
    await this.ffmpeg!.writeFile(inputFileName, await fetchFile(inputUrl));

    // Run FFmpeg command
    await this.ffmpeg!.exec([
      '-i', inputFileName,
      '-ss', startTime.toString(),
      '-t', duration.toString(),
      '-c', 'copy',
      outputFileName,
    ]);

    // Read output
    const data = await this.ffmpeg!.readFile(outputFileName);
    const blob = new Blob([data], { type: 'video/mp4' });

    // Cleanup
    await this.ffmpeg!.deleteFile(inputFileName);
    await this.ffmpeg!.deleteFile(outputFileName);

    return blob;
  }

  async concatenateVideos(
    videoUrls: string[],
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    this.ensureLoaded();

    if (videoUrls.length === 0) {
      throw new Error('No videos to concatenate');
    }

    if (videoUrls.length === 1) {
      const response = await fetch(videoUrls[0]);
      return response.blob();
    }

    // Set up progress tracking
    if (onProgress) {
      this.ffmpeg!.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Write all input files
    const inputFiles: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const fileName = `input${i}.mp4`;
      await this.ffmpeg!.writeFile(fileName, await fetchFile(videoUrls[i]));
      inputFiles.push(fileName);
    }

    // Create concat file
    const concatContent = inputFiles.map((f) => `file '${f}'`).join('\n');
    await this.ffmpeg!.writeFile('concat.txt', concatContent);

    // Concatenate
    await this.ffmpeg!.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      'output.mp4',
    ]);

    // Read output
    const data = await this.ffmpeg!.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    // Cleanup
    for (const file of inputFiles) {
      await this.ffmpeg!.deleteFile(file);
    }
    await this.ffmpeg!.deleteFile('concat.txt');
    await this.ffmpeg!.deleteFile('output.mp4');

    return blob;
  }

  async addAudioToVideo(
    videoUrl: string,
    audioUrl: string,
    audioStartTime: number = 0,
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    this.ensureLoaded();

    // Set up progress tracking
    if (onProgress) {
      this.ffmpeg!.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    await this.ffmpeg!.writeFile('video.mp4', await fetchFile(videoUrl));
    await this.ffmpeg!.writeFile('audio.mp3', await fetchFile(audioUrl));

    await this.ffmpeg!.exec([
      '-i', 'video.mp4',
      '-i', 'audio.mp3',
      '-itsoffset', audioStartTime.toString(),
      '-i', 'audio.mp3',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      'output.mp4',
    ]);

    const data = await this.ffmpeg!.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    await this.ffmpeg!.deleteFile('video.mp4');
    await this.ffmpeg!.deleteFile('audio.mp3');
    await this.ffmpeg!.deleteFile('output.mp4');

    return blob;
  }

  async addSubtitles(
    videoUrl: string,
    subtitles: SubtitleConfig[],
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    this.ensureLoaded();

    // Set up progress tracking
    if (onProgress) {
      this.ffmpeg!.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    await this.ffmpeg!.writeFile('video.mp4', await fetchFile(videoUrl));

    // Create SRT subtitle file
    const srtContent = this.generateSRT(subtitles);
    await this.ffmpeg!.writeFile('subtitles.srt', srtContent);

    // Burn subtitles into video
    await this.ffmpeg!.exec([
      '-i', 'video.mp4',
      '-vf', `subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`,
      '-c:a', 'copy',
      'output.mp4',
    ]);

    const data = await this.ffmpeg!.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    await this.ffmpeg!.deleteFile('video.mp4');
    await this.ffmpeg!.deleteFile('subtitles.srt');
    await this.ffmpeg!.deleteFile('output.mp4');

    return blob;
  }

  private generateSRT(subtitles: SubtitleConfig[]): string {
    return subtitles
      .map((sub, index) => {
        const startFormatted = this.formatSRTTime(sub.startTime);
        const endFormatted = this.formatSRTTime(sub.endTime);
        return `${index + 1}\n${startFormatted} --> ${endFormatted}\n${sub.text}\n`;
      })
      .join('\n');
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  async exportVideo(
    clips: Array<{
      url: string;
      startTime: number;
      duration: number;
      trimStart: number;
      trimEnd: number;
    }>,
    audioClips: Array<{
      url: string;
      startTime: number;
      duration: number;
    }>,
    subtitles: SubtitleConfig[],
    options: ExportOptions = {},
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    this.ensureLoaded();

    const {
      width = 1080,
      height = 1920,
      fps = 30,
      videoBitrate = '4M',
      audioBitrate = '128k',
    } = options;

    let totalProgress = 0;
    const reportProgress = (stage: number, stageProgress: number) => {
      // 4 stages: process clips, concat, add audio, add subtitles
      const stageWeight = 25;
      totalProgress = stage * stageWeight + (stageProgress * stageWeight) / 100;
      onProgress?.(Math.min(totalProgress, 100));
    };

    // Stage 1: Process and trim each clip
    const processedClips: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const fileName = `clip${i}.mp4`;

      await this.ffmpeg!.writeFile(`raw${i}.mp4`, await fetchFile(clip.url));

      // Trim and scale clip
      await this.ffmpeg!.exec([
        '-i', `raw${i}.mp4`,
        '-ss', clip.trimStart.toString(),
        '-t', clip.duration.toString(),
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
        '-r', fps.toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        fileName,
      ]);

      processedClips.push(fileName);
      await this.ffmpeg!.deleteFile(`raw${i}.mp4`);
      reportProgress(0, ((i + 1) / clips.length) * 100);
    }

    // Stage 2: Concatenate clips
    const concatContent = processedClips.map((f) => `file '${f}'`).join('\n');
    await this.ffmpeg!.writeFile('concat.txt', concatContent);

    await this.ffmpeg!.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      'concat_output.mp4',
    ]);

    for (const file of processedClips) {
      await this.ffmpeg!.deleteFile(file);
    }
    await this.ffmpeg!.deleteFile('concat.txt');
    reportProgress(1, 100);

    // Stage 3: Mix audio tracks
    let currentOutput = 'concat_output.mp4';

    if (audioClips.length > 0) {
      // Write all audio files
      const audioFilters: string[] = [];
      const audioInputs: string[] = [];

      for (let i = 0; i < audioClips.length; i++) {
        const audioFileName = `audio${i}.mp3`;
        await this.ffmpeg!.writeFile(audioFileName, await fetchFile(audioClips[i].url));
        audioInputs.push('-i', audioFileName);
        audioFilters.push(`[${i + 1}:a]adelay=${Math.floor(audioClips[i].startTime * 1000)}|${Math.floor(audioClips[i].startTime * 1000)}[a${i}]`);
      }

      const mixFilter = audioFilters.length > 0
        ? `${audioFilters.join(';')};[0:a]${audioFilters.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioFilters.length + 1}[aout]`
        : '[0:a]anull[aout]';

      await this.ffmpeg!.exec([
        '-i', currentOutput,
        ...audioInputs,
        '-filter_complex', mixFilter,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', audioBitrate,
        'audio_output.mp4',
      ]);

      await this.ffmpeg!.deleteFile(currentOutput);
      for (let i = 0; i < audioClips.length; i++) {
        await this.ffmpeg!.deleteFile(`audio${i}.mp3`);
      }
      currentOutput = 'audio_output.mp4';
    }
    reportProgress(2, 100);

    // Stage 4: Add subtitles
    if (subtitles.length > 0) {
      const srtContent = this.generateSRT(subtitles);
      await this.ffmpeg!.writeFile('subtitles.srt', srtContent);

      await this.ffmpeg!.exec([
        '-i', currentOutput,
        '-vf', `subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,MarginV=50'`,
        '-c:a', 'copy',
        '-b:v', videoBitrate,
        'final_output.mp4',
      ]);

      await this.ffmpeg!.deleteFile(currentOutput);
      await this.ffmpeg!.deleteFile('subtitles.srt');
      currentOutput = 'final_output.mp4';
    }
    reportProgress(3, 100);

    // Read final output
    const data = await this.ffmpeg!.readFile(currentOutput);
    const blob = new Blob([data], { type: 'video/mp4' });
    await this.ffmpeg!.deleteFile(currentOutput);

    onProgress?.(100);
    return blob;
  }

  async generateThumbnail(
    videoUrl: string,
    time: number = 0
  ): Promise<Blob> {
    this.ensureLoaded();

    await this.ffmpeg!.writeFile('video.mp4', await fetchFile(videoUrl));

    await this.ffmpeg!.exec([
      '-i', 'video.mp4',
      '-ss', time.toString(),
      '-vframes', '1',
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      'thumbnail.png',
    ]);

    const data = await this.ffmpeg!.readFile('thumbnail.png');
    const blob = new Blob([data], { type: 'image/png' });

    await this.ffmpeg!.deleteFile('video.mp4');
    await this.ffmpeg!.deleteFile('thumbnail.png');

    return blob;
  }

  async getVideoDuration(videoUrl: string): Promise<number> {
    this.ensureLoaded();

    await this.ffmpeg!.writeFile('probe.mp4', await fetchFile(videoUrl));

    // FFprobe not available in ffmpeg.wasm, use workaround
    // Create video element to get duration
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = videoUrl;
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };
    });
  }

  isReady(): boolean {
    return this.isLoaded;
  }

  getLoadingState(): 'idle' | 'loading' | 'loaded' {
    if (this.isLoaded) return 'loaded';
    if (this.isLoading) return 'loading';
    return 'idle';
  }
}

// Export singleton instance
export const ffmpegService = new FFmpegService();
export default ffmpegService;
