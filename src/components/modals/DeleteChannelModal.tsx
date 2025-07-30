import { useState } from 'react';

interface DeleteChannelModalProps {
  isOpen: boolean;
  username: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: (confirmation: string) => void;
}

export function DeleteChannelModal({
  isOpen,
  username,
  isDeleting,
  onClose,
  onConfirm,
}: DeleteChannelModalProps) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(deleteConfirmation);
  };

  const handleClose = () => {
    setDeleteConfirmation('');
    onClose();
  };

  return (
    <div className="bg-chat-modal-overlay fixed inset-0 z-50 flex items-center justify-center">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-bold text-red-600">Delete Channel Confirmation</h3>
        <p className="mb-4">
          Are you sure you want to delete your Slack channel? This action cannot be undone.
        </p>
        <p className="mb-2 text-sm text-gray-600">
          <strong>Important:</strong> Deleting your channel will also log you out of the
          application.
        </p>
        <p className="mb-4 text-sm text-gray-600">
          Please type your username <strong>{username}</strong> to confirm deletion:
        </p>
        <input
          type="text"
          value={deleteConfirmation}
          onChange={e => setDeleteConfirmation(e.target.value)}
          className="mb-4 w-full rounded border border-gray-300 p-2"
          placeholder="Enter your username to confirm"
        />
        <div className="flex justify-end space-x-2">
          <button onClick={handleClose} className="rounded bg-gray-300 px-4 py-2 hover:bg-gray-400">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting || deleteConfirmation !== username}
            className="bg-chat-notification hover:bg-chat-notification-hover disabled:bg-chat-notification-disabled rounded px-4 py-2 text-white"
          >
            {isDeleting ? 'Deleting...' : 'Confirm Delete & Logout'}
          </button>
        </div>
      </div>
    </div>
  );
}
