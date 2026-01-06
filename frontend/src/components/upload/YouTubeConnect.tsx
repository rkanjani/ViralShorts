import { useState } from 'react';
import { Youtube, Link2, CheckCircle, ExternalLink } from 'lucide-react';
import { Button } from '../common/Button';
import { useAuth } from '../../context';
import { authApi } from '../../api';

export function YouTubeConnect() {
  const { user, updateYouTubeConnection } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = !!user?.youtubeChannelId;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { url } = await authApi.getYouTubeAuthUrl();
      // Open OAuth popup
      const popup = window.open(
        url,
        'youtube-auth',
        'width=500,height=600,left=100,top=100'
      );

      // Listen for message from popup
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'youtube-auth-success') {
          const { code } = event.data;
          try {
            const result = await authApi.connectYouTube(code);
            updateYouTubeConnection(result.channelId, result.channelName);
          } catch {
            // Error handled by API client
          }
          popup?.close();
          window.removeEventListener('message', handleMessage);
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup was closed
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          setIsConnecting(false);
          window.removeEventListener('message', handleMessage);
        }
      }, 500);
    } catch {
      setIsConnecting(false);
    }
  };

  if (isConnected) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-800">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-green-800 dark:text-green-300">
              YouTube Connected
            </h4>
            <p className="text-sm text-green-600 dark:text-green-400">
              {user?.youtubeChannelName || 'Channel connected'}
            </p>
          </div>
          <a
            href={`https://youtube.com/channel/${user?.youtubeChannelId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded hover:bg-green-100 dark:hover:bg-green-800 transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-green-600 dark:text-green-400" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mx-auto mb-4 dark:bg-red-900/30">
        <Youtube className="h-6 w-6 text-red-600" />
      </div>
      <h4 className="font-medium text-gray-900 dark:text-white mb-2">
        Connect Your YouTube Channel
      </h4>
      <p className="text-sm text-gray-500 mb-4">
        Connect your YouTube account to upload videos directly as Shorts
      </p>
      <Button onClick={handleConnect} loading={isConnecting}>
        <Link2 className="h-4 w-4 mr-2" />
        Connect YouTube
      </Button>
    </div>
  );
}

export default YouTubeConnect;
