import React from 'react';
import { Candidate } from '../types';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface VoteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate | null;
  onConfirm: () => void;
  isSubmitting: boolean;
}

const VoteConfirmModal: React.FC<VoteConfirmModalProps> = ({
  isOpen,
  onClose,
  candidate,
  onConfirm,
  isSubmitting,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Your Vote">
      <div className="space-y-4">
        {candidate && (
          <div className="bg-gray-700 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">You are voting for:</p>
            <h3 className="text-lg font-bold">{candidate.name}</h3>
            <p className="text-gray-400 text-sm">{candidate.party || 'Independent'}</p>
          </div>
        )}
        <div className="bg-green-900 border border-green-700 rounded-lg p-4">
          <p className="text-green-200 text-sm">
            ✓ Your vote is gas-free and will be recorded permanently on the blockchain.
          </p>
        </div>
        <div className="flex gap-2 pt-4">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onConfirm}
            isLoading={isSubmitting}
            className="flex-1"
          >
            Confirm Vote
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default VoteConfirmModal;
