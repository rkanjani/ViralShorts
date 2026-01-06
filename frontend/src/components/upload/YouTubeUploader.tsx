import { useState, useEffect } from 'react';
import { Youtube, Upload, Eye, EyeOff, Globe, Lock, Tag, FileText, AlertCircle, Download } from 'lucide-react';
import { Button } from '../common/Button';
import { YouTubeConnect } from './YouTubeConnect';
import { UploadProgress } from './UploadProgress';
import { useAuth, useProject, useWebSocket, useToast } from '../../context';
import { uploadsApi } from '../../api';

type PrivacyStatus = 'public' | 'unlisted' | 'private';

const privacyOptions: { value: PrivacyStatus; label: string; icon: typeof Globe; description: string }[] = [
  { value: 'public', label: 'Public', icon: Globe, description: 'Anyone can watch' },
  { value: 'unlisted', label: 'Unlisted', icon: EyeOff, description: 'Only people with link' },
  { value: 'private', label: 'Private', icon: Lock, description: 'Only you can watch' },
];

export function YouTubeUploader() {
  const { user } = useAuth();
  const { currentProject } = useProject();
  const { socket } = useWebSocket();
  const { success, error: showError } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyStatus>('public');

  const [uploadStatus, setUploadStatus] = useState<
    'idle' | 'exporting' | 'uploading' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [youtubeUrl, setYoutubeUrl] = useState<string>();

  const isConnected = !!user?.youtubeChannelId;

  // Pre-fill form with project data
  useEffect(() => {
    if (currentProject) {
      setTitle(currentProject.title || '');
      setDescription(currentProject.description || '');
    }
  }, [currentProject]);

  // Listen for upload progress via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleUploadProgress = (data: { progress: number; status: string }) => {
      setProgress(data.progress);
      if (data.status === 'uploading') {
        setUploadStatus('uploading');
      } else if (data.status === 'processing') {
        setUploadStatus('processing');
      }
    };

    const handleUploadCompleted = (data: { videoId: string; url: string }) => {
      setUploadStatus('completed');
      setYoutubeUrl(data.url);
    };

    const handleUploadFailed = (data: { error: string }) => {
      setUploadStatus('failed');
      setError(data.error);
    };

    socket.on('upload:progress', handleUploadProgress);
    socket.on('upload:completed', handleUploadCompleted);
    socket.on('upload:failed', handleUploadFailed);

    return () => {
      socket.off('upload:progress', handleUploadProgress);
      socket.off('upload:completed', handleUploadCompleted);
      socket.off('upload:failed', handleUploadFailed);
    };
  }, [socket]);

  const handleUpload = async () => {
    if (!currentProject) return;

    // Check if video has been exported
    const videoUrl = currentProject.lastExport?.url;
    if (!videoUrl) {
      showError('Please export the video first before uploading to YouTube');
      return;
    }

    setUploadStatus('uploading');
    setProgress(0);
    setError(undefined);
    setYoutubeUrl(undefined);

    try {
      // Start upload with the exported video URL
      const result = await uploadsApi.uploadToYouTube(currentProject.id, {
        title: title || currentProject.title,
        description: `${description}\n\n#Shorts`,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        visibility: privacy,
        videoUrl,
      });

      // If upload completes synchronously
      if (result.youtubeUrl) {
        setUploadStatus('completed');
        setYoutubeUrl(result.youtubeUrl);
        success('Video uploaded to YouTube successfully!');
      }
      // Otherwise, progress updates will come via WebSocket
    } catch (err) {
      setUploadStatus('failed');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleReset = () => {
    setUploadStatus('idle');
    setProgress(0);
    setError(undefined);
    setYoutubeUrl(undefined);
  };

  // Check if video has been exported
  const hasExportedVideo = !!currentProject?.lastExport?.url;

  if (!hasExportedVideo) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Youtube className="h-6 w-6 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upload to YouTube Shorts
          </h2>
        </div>
        <div className="p-6 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-200">
                Export Required
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Please export your video first before uploading to YouTube. Go back to the Edit step and click "Export Video".
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Youtube className="h-6 w-6 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upload to YouTube Shorts
          </h2>
        </div>
        {/* Show exported video preview */}
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 dark:text-green-300">Video exported and ready</span>
            <a
              href={currentProject?.lastExport?.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 flex items-center gap-1"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        </div>
        <YouTubeConnect />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Youtube className="h-6 w-6 text-red-600" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Upload to YouTube Shorts
        </h2>
      </div>

      {/* Show exported video info */}
      <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-700 dark:text-green-300">Video exported and ready to upload</span>
          <a
            href={currentProject?.lastExport?.url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 flex items-center gap-1"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>

      {uploadStatus !== 'idle' ? (
        <div className="space-y-4">
          <UploadProgress
            status={uploadStatus}
            progress={progress}
            error={error}
            youtubeUrl={youtubeUrl}
          />

          {(uploadStatus === 'completed' || uploadStatus === 'failed') && (
            <Button variant="outline" onClick={handleReset} className="w-full">
              {uploadStatus === 'completed' ? 'Upload Another' : 'Try Again'}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FileText className="h-4 w-4 inline mr-1" />
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Enter video title"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100 characters</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Add a description for your video"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              #Shorts will be automatically added
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Tag className="h-4 w-4 inline mr-1" />
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="viral, shorts, trending (comma separated)"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
          </div>

          {/* Privacy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Eye className="h-4 w-4 inline mr-1" />
              Privacy
            </label>
            <div className="grid grid-cols-3 gap-2">
              {privacyOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setPrivacy(option.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      privacy === option.value
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 mb-1 ${
                        privacy === option.value ? 'text-primary-500' : 'text-gray-400'
                      }`}
                    />
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </div>
                    <div className="text-xs text-gray-500">{option.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload button */}
          <Button onClick={handleUpload} className="w-full" size="lg">
            <Upload className="h-5 w-5 mr-2" />
            Upload to YouTube Shorts
          </Button>

          {/* YouTube Connect status */}
          <div className="pt-4 border-t dark:border-gray-800">
            <YouTubeConnect />
          </div>
        </div>
      )}
    </div>
  );
}

export default YouTubeUploader;
