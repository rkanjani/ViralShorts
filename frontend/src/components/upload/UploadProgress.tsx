import { CheckCircle, XCircle, Upload, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface UploadProgressProps {
  status: 'idle' | 'exporting' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  youtubeUrl?: string;
}

const statusConfig = {
  idle: {
    icon: Upload,
    label: 'Ready to upload',
    color: 'text-gray-500',
  },
  exporting: {
    icon: Loader2,
    label: 'Exporting video...',
    color: 'text-blue-500',
  },
  uploading: {
    icon: Upload,
    label: 'Uploading to YouTube...',
    color: 'text-primary-500',
  },
  processing: {
    icon: Loader2,
    label: 'YouTube is processing...',
    color: 'text-yellow-500',
  },
  completed: {
    icon: CheckCircle,
    label: 'Upload complete!',
    color: 'text-green-500',
  },
  failed: {
    icon: XCircle,
    label: 'Upload failed',
    color: 'text-red-500',
  },
};

export function UploadProgress({
  status,
  progress,
  error,
  youtubeUrl,
}: UploadProgressProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimating = status === 'exporting' || status === 'processing';

  return (
    <div className="rounded-lg border bg-white p-6 dark:bg-gray-900 dark:border-gray-800">
      {/* Status icon and label */}
      <div className="flex items-center gap-4 mb-4">
        <div
          className={clsx(
            'flex h-12 w-12 items-center justify-center rounded-full',
            status === 'completed' && 'bg-green-100 dark:bg-green-900/30',
            status === 'failed' && 'bg-red-100 dark:bg-red-900/30',
            status === 'uploading' && 'bg-primary-100 dark:bg-primary-900/30',
            (status === 'idle' || status === 'exporting' || status === 'processing') &&
              'bg-gray-100 dark:bg-gray-800'
          )}
        >
          <Icon
            className={clsx('h-6 w-6', config.color, isAnimating && 'animate-spin')}
          />
        </div>
        <div className="flex-1">
          <h4 className={clsx('font-medium', config.color)}>{config.label}</h4>
          {status === 'uploading' && (
            <p className="text-sm text-gray-500">{progress}% complete</p>
          )}
          {status === 'processing' && (
            <p className="text-sm text-gray-500">This may take a few minutes</p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(status === 'exporting' || status === 'uploading') && (
        <div className="mb-4">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                status === 'exporting' ? 'bg-blue-500' : 'bg-primary-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {status === 'failed' && error && (
        <div className="p-3 rounded bg-red-50 dark:bg-red-900/20 mb-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Success message with link */}
      {status === 'completed' && youtubeUrl && (
        <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-300 mb-3">
            Your video has been uploaded to YouTube Shorts!
          </p>
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            View on YouTube
          </a>
        </div>
      )}

      {/* Upload stages indicator */}
      {status !== 'idle' && status !== 'completed' && status !== 'failed' && (
        <div className="flex items-center justify-between text-xs text-gray-500 mt-4">
          <div className="flex items-center gap-1">
            <div
              className={clsx(
                'h-2 w-2 rounded-full',
                status === 'exporting' || status === 'uploading' || status === 'processing'
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              )}
            />
            Export
          </div>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 mx-2" />
          <div className="flex items-center gap-1">
            <div
              className={clsx(
                'h-2 w-2 rounded-full',
                status === 'uploading' || status === 'processing'
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              )}
            />
            Upload
          </div>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700 mx-2" />
          <div className="flex items-center gap-1">
            <div
              className={clsx(
                'h-2 w-2 rounded-full',
                status === 'processing' ? 'bg-green-500' : 'bg-gray-300'
              )}
            />
            Process
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadProgress;
