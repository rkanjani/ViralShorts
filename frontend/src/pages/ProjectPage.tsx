import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Video, Mic, Edit, Upload, ChevronRight } from 'lucide-react';
import { useProject, useToast, useWebSocket } from '../context';
import { Button } from '../components/common/Button';
import { Loader } from '../components/common/Loader';
import { ScriptGenerator } from '../components/script/ScriptGenerator';
import { VideoSelection } from '../components/video/VideoSelection';
import { VoiceoverGeneration } from '../components/voiceover/VoiceoverGeneration';
import { VideoEditor } from '../components/editor';
import { YouTubeUploader } from '../components/upload';
import type { ProjectStatus } from '../types';

interface Step {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'completed' | 'current' | 'upcoming';
}

const getSteps = (projectStatus: ProjectStatus): Step[] => {
  const statusOrder: ProjectStatus[] = ['draft', 'scripted', 'generating', 'generated', 'editing', 'exported', 'uploaded'];
  const currentIndex = statusOrder.indexOf(projectStatus);

  return [
    {
      id: 'script',
      label: 'Generate Script',
      icon: <Sparkles className="h-4 w-4" />,
      status: currentIndex >= 1 ? 'completed' : currentIndex === 0 ? 'current' : 'upcoming',
    },
    {
      id: 'videos',
      label: 'Generate Videos',
      icon: <Video className="h-4 w-4" />,
      status: currentIndex >= 3 ? 'completed' : currentIndex >= 1 && currentIndex <= 2 ? 'current' : 'upcoming',
    },
    {
      id: 'voiceover',
      label: 'Add Voiceover',
      icon: <Mic className="h-4 w-4" />,
      status: currentIndex >= 4 ? 'completed' : currentIndex === 3 ? 'current' : 'upcoming',
    },
    {
      id: 'edit',
      label: 'Edit Video',
      icon: <Edit className="h-4 w-4" />,
      status: currentIndex >= 5 ? 'completed' : currentIndex === 4 ? 'current' : 'upcoming',
    },
    {
      id: 'upload',
      label: 'Upload',
      icon: <Upload className="h-4 w-4" />,
      status: currentIndex >= 6 ? 'completed' : currentIndex === 5 ? 'current' : 'upcoming',
    },
  ];
};

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, loading, error, loadProject, clearError } = useProject();
  const { joinProjectRoom, leaveProjectRoom } = useWebSocket();
  const { error: showError } = useToast();
  const [activeStep, setActiveStep] = useState('script');
  const hasInitializedStep = useRef(false);

  useEffect(() => {
    if (id) {
      hasInitializedStep.current = false; // Reset for new project
      loadProject(id);
      joinProjectRoom(id);
    }

    return () => {
      leaveProjectRoom();
    };
  }, [id, loadProject, joinProjectRoom, leaveProjectRoom]);

  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  useEffect(() => {
    // Only auto-select step on initial project load, not on subsequent updates
    if (currentProject && !hasInitializedStep.current) {
      hasInitializedStep.current = true;
      const status = currentProject.status;
      if (status === 'draft') setActiveStep('script');
      else if (status === 'scripted' || status === 'generating' || status === 'generated') setActiveStep('videos');
      else if (status === 'editing') setActiveStep('voiceover');
      else if (status === 'exported') setActiveStep('edit');
      else if (status === 'uploaded') setActiveStep('upload');
    }
  }, [currentProject]);

  if (loading && !currentProject) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size="lg" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Project not found
        </h2>
        <Button onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const steps = getSteps(currentProject.status);

  const renderStepContent = () => {
    switch (activeStep) {
      case 'script':
        return <ScriptGenerator onContinue={() => setActiveStep('videos')} />;
      case 'videos':
        return currentProject.status === 'draft' ? (
          <div className="text-center py-12">
            <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Generate Script First
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You need to generate a script before creating videos.
            </p>
            <Button onClick={() => setActiveStep('script')}>
              Go to Script Generation
            </Button>
          </div>
        ) : (
          <VideoSelection onContinue={() => setActiveStep('voiceover')} />
        );
      case 'voiceover':
        return <VoiceoverGeneration onContinue={() => setActiveStep('edit')} />;
      case 'edit':
        return <VideoEditor onContinue={() => setActiveStep('upload')} />;
      case 'upload':
        return <YouTubeUploader />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {currentProject.title}
        </h1>
        {currentProject.description && (
          <p className="text-gray-600 dark:text-gray-400">
            {currentProject.description}
          </p>
        )}
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <nav className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => setActiveStep(step.id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeStep === step.id
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-400'
                    : step.status === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    step.status === 'completed'
                      ? 'bg-green-100 text-green-600 dark:bg-green-900/50'
                      : activeStep === step.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700'
                  }`}
                >
                  {step.status === 'completed' ? '✓' : index + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {index < steps.length - 1 && (
                <ChevronRight className="mx-2 h-4 w-4 text-gray-400" />
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Step Content */}
      <div className="rounded-xl border bg-white p-6 dark:bg-gray-900 dark:border-gray-800">
        {renderStepContent()}
      </div>
    </div>
  );
}

export default ProjectPage;
