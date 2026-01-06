import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Sparkles, Zap, Upload } from 'lucide-react';
import { useAuth } from '../context';
import { Button } from '../components/common/Button';

export function LandingPage() {
  const { isAuthenticated, loading, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const features = [
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: 'AI Script Generation',
      description: 'Generate viral, attention-grabbing scripts with GPT-4',
    },
    {
      icon: <Video className="h-6 w-6" />,
      title: 'Sora Video Generation',
      description: 'Create stunning video clips for each line of your script',
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: 'AI Voiceover',
      description: 'Natural-sounding voiceovers with customizable styles',
    },
    {
      icon: <Upload className="h-6 w-6" />,
      title: 'Direct Upload',
      description: 'Upload directly to YouTube Shorts with one click',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-8 flex items-center gap-2">
          <Video className="h-12 w-12 text-primary-500" />
          <h1 className="text-4xl font-bold gradient-text">ViralShorts</h1>
        </div>

        <h2 className="mb-4 max-w-2xl text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
          Create Viral Short-Form Videos
          <span className="block text-primary-500">Powered by AI</span>
        </h2>

        <p className="mb-8 max-w-lg text-lg text-gray-600 dark:text-gray-400">
          Generate scripts, create videos, add voiceovers, and publish to YouTube Shorts
          — all with the power of AI.
        </p>

        <Button
          size="lg"
          onClick={loginWithGoogle}
          loading={loading}
          className="gap-3"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </Button>
      </div>

      {/* Features Section */}
      <div className="bg-white/50 dark:bg-gray-800/50 py-16">
        <div className="container mx-auto px-4">
          <h3 className="mb-12 text-center text-2xl font-bold text-gray-900 dark:text-white">
            Everything you need to go viral
          </h3>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900"
              >
                <div className="mb-4 inline-flex rounded-lg bg-primary-100 p-3 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400">
                  {feature.icon}
                </div>
                <h4 className="mb-2 font-semibold text-gray-900 dark:text-white">
                  {feature.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-white dark:bg-gray-900 dark:border-gray-800 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>ViralShorts - AI-Powered Short-Form Video Creation</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
