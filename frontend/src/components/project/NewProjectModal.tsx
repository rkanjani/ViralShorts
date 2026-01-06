import { useState } from 'react';
import { X } from 'lucide-react';
import { useProject, useToast } from '../../context';
import { Button } from '../common/Button';
import type { Project, ProjectDuration, CreateProjectForm } from '../../types';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const durations: { value: ProjectDuration; label: string; description: string }[] = [
  { value: '15-30', label: '15-30s', description: 'Quick, punchy content' },
  { value: '30-45', label: '30-45s', description: 'Standard short format' },
  { value: '45-60', label: '45-60s', description: 'More room for story' },
];

export function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const { createProject, saving } = useProject();
  const { error } = useToast();
  const [form, setForm] = useState<CreateProjectForm>({
    title: '',
    description: '',
    duration: '30-45',
  });
  const [errors, setErrors] = useState<Partial<CreateProjectForm>>({});

  const validate = (): boolean => {
    const newErrors: Partial<CreateProjectForm> = {};

    if (!form.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (form.title.length > 280) {
      newErrors.title = 'Title must be 280 characters or less';
    }

    if (form.description.length > 280) {
      newErrors.description = 'Description must be 280 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      const project = await createProject(form);
      onCreated(project);
    } catch (err) {
      error('Failed to create project');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 mx-4">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Create New Project
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Title / Hook
              <span className="ml-1 text-gray-400">({form.title.length}/280)</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Enter a catchy title or hook for your video..."
              className="input"
              maxLength={280}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Duration */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Video Length
            </label>
            <div className="grid grid-cols-3 gap-3">
              {durations.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setForm({ ...form, duration: d.value })}
                  className={`rounded-lg border p-3 text-center transition-colors ${
                    form.duration === d.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold">{d.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {d.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
              <span className="ml-1 text-gray-400">({form.description.length}/280)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe your video idea in more detail (optional)..."
              className="textarea"
              rows={3}
              maxLength={280}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-500">{errors.description}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving}
              className="flex-1"
            >
              Create Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewProjectModal;
