import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Download,
  Upload,
  Layers,
  Type,
  Settings,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/common/Button';
import { Loader } from '../components/common/Loader';
import { Timeline, PreviewPlayer, SubtitleEditor } from '../components/editor';
import { YouTubeUploader } from '../components/upload';
import { EditorProvider, useEditor } from '../context/EditorContext';
import { useProject, useToast } from '../context';
import { useFFmpeg } from '../hooks/useFFmpeg';

type SidebarPanel = 'layers' | 'subtitles' | 'export' | 'settings';

function EditorContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, loading: projectLoading, loadProject, videos, voiceovers, scriptLines } = useProject();
  const editor = useEditor();
  const { state, loadProjectData, undo, redo, canUndo, canRedo, addClip } = editor;
  const { success, error: showError } = useToast();
  const {
    isLoading: ffmpegLoading,
    isReady: ffmpegReady,
    progress: exportProgress,
    load: loadFFmpeg,
    exportVideo,
  } = useFFmpeg();

  const [activePanel, setActivePanel] = useState<SidebarPanel>('layers');
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load project on mount
  useEffect(() => {
    if (id) {
      loadProject(id);
    }
  }, [id, loadProject]);

  // Initialize editor with project data - build timeline from videos and voiceovers
  useEffect(() => {
    if (currentProject && videos && voiceovers && scriptLines.length > 0) {
      // Build video clips from selected videos
      const videoClips: Array<{
        id: string;
        sourceId: string;
        sourceUrl: string;
        startTime: number;
        duration: number;
        trimStart: number;
        trimEnd: number;
        type: 'video';
      }> = [];

      // Build audio clips from voiceovers
      const audioClips: Array<{
        id: string;
        sourceId: string;
        sourceUrl: string;
        startTime: number;
        duration: number;
        trimStart: number;
        trimEnd: number;
        type: 'audio';
      }> = [];

      let currentTime = 0;

      // Process each script line in order
      scriptLines.forEach((line) => {
        // Get selected video for this line
        const lineVideos = videos.get(line.id) || [];
        const selectedVideo = lineVideos.find(v => v.id === line.selectedVideoId);

        // Get voiceover for this line
        const lineVoiceover = voiceovers.get(line.id);

        // Use voiceover duration as the clip duration, or video duration, or default 5 seconds
        const duration = lineVoiceover?.duration || selectedVideo?.duration || 5;

        if (selectedVideo) {
          videoClips.push({
            id: `video-${selectedVideo.id}`,
            sourceId: selectedVideo.id,
            sourceUrl: selectedVideo.storageUrl,
            startTime: currentTime,
            duration,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
          });
        }

        if (lineVoiceover) {
          audioClips.push({
            id: `audio-${lineVoiceover.id}`,
            sourceId: lineVoiceover.id,
            sourceUrl: lineVoiceover.storageUrl,
            startTime: currentTime,
            duration: lineVoiceover.duration,
            trimStart: 0,
            trimEnd: 0,
            type: 'audio',
          });
        }

        currentTime += duration;
      });

      // Build timeline tracks
      const tracks = [
        {
          id: 'video-track-1',
          name: 'Video',
          type: 'video' as const,
          clips: videoClips,
          visible: true,
          locked: false,
        },
        {
          id: 'audio-track-1',
          name: 'Voiceover',
          type: 'audio' as const,
          clips: audioClips,
          volume: 1,
          visible: true,
          locked: false,
        },
      ];

      loadProjectData({ tracks, subtitles: [] });
    }
  }, [currentProject, videos, voiceovers, scriptLines, loadProjectData]);

  // Load FFmpeg on mount
  useEffect(() => {
    loadFFmpeg();
  }, [loadFFmpeg]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save timeline state to project
      // await projectApi.updateTimeline(id, state);
      success('Project saved');
    } catch {
      showError('Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    if (!ffmpegReady) {
      showError('FFmpeg is still loading');
      return;
    }

    setIsExporting(true);
    try {
      // Prepare clips for export
      const videoClips = state.tracks
        .filter((t) => t.type === 'video' && t.visible)
        .flatMap((t) =>
          t.clips.map((clip) => ({
            url: clip.sourceUrl || '',
            startTime: clip.startTime,
            duration: clip.duration,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
          }))
        )
        .filter((c) => c.url);

      const audioClips = state.tracks
        .filter((t) => t.type === 'audio' && t.visible)
        .flatMap((t) =>
          t.clips.map((clip) => ({
            url: clip.sourceUrl || '',
            startTime: clip.startTime,
            duration: clip.duration,
          }))
        )
        .filter((c) => c.url);

      const blob = await exportVideo(
        videoClips,
        audioClips,
        state.subtitles.map((s) => ({
          text: s.text,
          startTime: s.startTime,
          endTime: s.endTime,
          style: s.style,
        }))
      );

      if (blob) {
        // Download the file
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProject?.title || 'video'}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        success('Video exported successfully');
      }
    } catch {
      showError('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const sidebarPanels: { id: SidebarPanel; icon: typeof Layers; label: string }[] = [
    { id: 'layers', icon: Layers, label: 'Layers' },
    { id: 'subtitles', icon: Type, label: 'Subtitles' },
    { id: 'export', icon: Upload, label: 'Upload' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  if (projectLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader size="lg" />
        </div>
      </Layout>
    );
  }

  if (!currentProject) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full">
          <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Project not found
          </h2>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
      {/* Header */}
      <header className="h-14 bg-white dark:bg-gray-900 border-b dark:border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/project/${id}`)}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900 dark:text-white">
              {currentProject.title}
            </h1>
            <p className="text-xs text-gray-500">Video Editor</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex items-center gap-1 mr-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6M3 13a9 9 0 1 0 1.83-5.5" />
              </svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6M21 13a9 9 0 1 1-1.83-5.5" />
              </svg>
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={handleSave} loading={isSaving}>
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            loading={isExporting}
            disabled={!ffmpegReady}
          >
            {ffmpegLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Loading FFmpeg...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-1" />
                Export
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar icons */}
        <div className="w-14 bg-gray-900 flex flex-col items-center py-2 shrink-0">
          {sidebarPanels.map((panel) => {
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center mb-1 transition-colors',
                  activePanel === panel.id
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                )}
                title={panel.label}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>

        {/* Sidebar panel */}
        <div className="w-80 bg-white dark:bg-gray-900 border-r dark:border-gray-800 overflow-y-auto shrink-0">
          <div className="p-4">
            {activePanel === 'layers' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Tracks & Layers
                </h3>
                <div className="space-y-2">
                  {state.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-gray-900 dark:text-white">
                          {track.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {track.clips.length} clips
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePanel === 'subtitles' && <SubtitleEditor />}

            {activePanel === 'export' && <YouTubeUploader />}

            {activePanel === 'settings' && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Export Settings
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Resolution
                    </label>
                    <select className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                      <option value="1080x1920">1080x1920 (9:16)</option>
                      <option value="1920x1080">1920x1080 (16:9)</option>
                      <option value="1080x1080">1080x1080 (1:1)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Frame Rate
                    </label>
                    <select className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                      <option value="30">30 FPS</option>
                      <option value="60">60 FPS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Quality
                    </label>
                    <select className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                      <option value="high">High (4 Mbps)</option>
                      <option value="medium">Medium (2 Mbps)</option>
                      <option value="low">Low (1 Mbps)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Preview */}
          <div className="flex-1 p-4 flex items-center justify-center bg-gray-200 dark:bg-gray-950">
            <div className="w-full max-w-sm">
              <PreviewPlayer aspectRatio="9:16" />
            </div>
          </div>

          {/* Timeline */}
          <div className="h-64 shrink-0">
            <Timeline />
          </div>
        </div>
      </div>

      {/* Export progress overlay */}
      {isExporting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              Exporting Video...
            </h3>
            <div className="space-y-2">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 text-center">{exportProgress}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function EditorPage() {
  return (
    <EditorProvider>
      <EditorContent />
    </EditorProvider>
  );
}

export default EditorPage;
