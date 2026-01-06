import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Video, Clock, Trash2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import { useProject, useToast } from '../context';
import { Button } from '../components/common/Button';
import { Loader } from '../components/common/Loader';
import { NewProjectModal } from '../components/project/NewProjectModal';
import type { Project, ProjectStatus } from '../types';

const statusColors: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  scripted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  generating: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
  generated: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  editing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  exported: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  uploaded: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
};

const statusLabels: Record<ProjectStatus, string> = {
  draft: 'Draft',
  scripted: 'Script Ready',
  generating: 'Generating Videos',
  generated: 'Videos Ready',
  editing: 'Editing',
  exported: 'Exported',
  uploaded: 'Uploaded',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { projects, loading, loadProjects, deleteProject, duplicateProject } = useProject();
  const { success, error } = useToast();
  const [showNewProject, setShowNewProject] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    setDeletingId(id);
    try {
      await deleteProject(id);
      success('Project deleted');
    } catch (err) {
      error('Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const newProject = await duplicateProject(id);
      success('Project duplicated');
      navigate(`/project/${newProject.id}`);
    } catch (err) {
      error('Failed to duplicate project');
    }
  };

  const handleProjectCreated = (project: Project) => {
    setShowNewProject(false);
    navigate(`/project/${project.id}`);
  };

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            My Projects
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Create and manage your viral short videos
          </p>
        </div>
        <Button onClick={() => setShowNewProject(true)} icon={<Plus className="h-4 w-4" />}>
          New Project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 py-24 dark:border-gray-700">
          <Video className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No projects yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Create your first viral short video project
          </p>
          <Button onClick={() => setShowNewProject(true)} icon={<Plus className="h-4 w-4" />}>
            Create Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group rounded-lg border bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-900 dark:border-gray-800"
            >
              <div className="mb-4 flex items-start justify-between">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status]}`}
                >
                  {statusLabels[project.status]}
                </span>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleDuplicate(project.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                    title="Duplicate"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id, project.title)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                    title="Delete"
                    disabled={deletingId === project.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => navigate(`/project/${project.id}`)}
                className="block w-full text-left"
              >
                <h3 className="mb-2 font-semibold text-gray-900 dark:text-white line-clamp-2">
                  {project.title}
                </h3>
                {project.description && (
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {project.description}
                  </p>
                )}
              </button>

              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {project.duration}s
                </span>
                <span>
                  Updated {format(new Date(project.updatedAt), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}

export default DashboardPage;
