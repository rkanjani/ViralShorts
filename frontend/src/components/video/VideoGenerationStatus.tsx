import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Loader2, AlertCircle } from 'lucide-react';
import type { VideoStatus } from '../../types';

interface VideoGenerationStatusProps {
  status: VideoStatus;
  progress?: number;
  error?: string | null;
}

const statusConfig: Record<VideoStatus, { icon: React.ReactNode; label: string; color: string }> = {
  queued: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Queued',
    color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
  },
  in_progress: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Generating',
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/50',
  },
  completed: {
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Complete',
    color: 'text-green-600 bg-green-100 dark:bg-green-900/50',
  },
  failed: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: 'Failed',
    color: 'text-red-600 bg-red-100 dark:bg-red-900/50',
  },
};

export function VideoGenerationStatus({ status, progress, error }: VideoGenerationStatusProps) {
  const config = statusConfig[status];

  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
        {progress !== undefined && status === 'in_progress' && (
          <span className="text-xs">({Math.round(progress)}%)</span>
        )}
      </div>

      {status === 'in_progress' && progress !== undefined && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

interface BatchGenerationStatusProps {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
}

export function BatchGenerationStatus({ total, completed, failed, inProgress }: BatchGenerationStatusProps) {
  const queued = total - completed - failed - inProgress;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium text-gray-900 dark:text-white">
          Video Generation Progress
        </h4>
        <span className="text-sm text-gray-500">
          {completed + failed} / {total}
        </span>
      </div>

      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded bg-gray-100 p-2 dark:bg-gray-800">
          <div className="font-semibold text-gray-900 dark:text-white">{queued}</div>
          <div className="text-gray-500">Queued</div>
        </div>
        <div className="rounded bg-blue-100 p-2 dark:bg-blue-900/50">
          <div className="font-semibold text-blue-600">{inProgress}</div>
          <div className="text-blue-600/70">In Progress</div>
        </div>
        <div className="rounded bg-green-100 p-2 dark:bg-green-900/50">
          <div className="font-semibold text-green-600">{completed}</div>
          <div className="text-green-600/70">Complete</div>
        </div>
        <div className="rounded bg-red-100 p-2 dark:bg-red-900/50">
          <div className="font-semibold text-red-600">{failed}</div>
          <div className="text-red-600/70">Failed</div>
        </div>
      </div>
    </div>
  );
}

export default VideoGenerationStatus;
