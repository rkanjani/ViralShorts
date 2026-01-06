import { useEffect } from 'react';
import { clsx } from 'clsx';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '../../context';

type ToastType = 'success' | 'error' | 'warning' | 'info';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
};

const styles: Record<ToastType, string> = {
  success: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/30',
  error: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30',
  warning: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/30',
  info: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30',
};

interface ToastItemProps {
  id: string;
  type: ToastType;
  message: string;
  onDismiss: (id: string) => void;
}

function ToastItem({ id, type, message, onDismiss }: ToastItemProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 rounded-lg border p-4 shadow-lg animate-in',
        styles[type]
      )}
    >
      {icons[type]}
      <p className="flex-1 text-sm text-gray-900 dark:text-gray-100">{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  );
}

export default ToastContainer;
