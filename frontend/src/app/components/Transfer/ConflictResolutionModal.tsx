import {
  Alert,
  Button,
  Form,
  FormGroup,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Radio,
} from '@patternfly/react-core';
import * as React from 'react';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflictingFiles: string[];
  nonConflictingFiles: string[];
  onResolve: (resolution: 'overwrite' | 'skip' | 'rename') => void;
  onCancel: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  conflictingFiles,
  nonConflictingFiles,
  onResolve,
  onCancel,
}) => {
  const [resolution, setResolution] = React.useState<'overwrite' | 'skip' | 'rename'>('skip');

  const handleResolve = () => {
    onResolve(resolution);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      variant="medium"
    >
      <ModalHeader title="Resolve File Conflicts" />
      <ModalBody>
        {/* Non-conflicting files info */}
        {nonConflictingFiles.length > 0 && (
          <Alert
            variant="info"
            isInline
            title="Non-conflicting files"
            style={{ marginBottom: '1rem' }}
          >
            <p>
              {nonConflictingFiles.length} file{nonConflictingFiles.length !== 1 ? 's' : ''} will be
              copied automatically (no conflicts).
            </p>
          </Alert>
        )}

        {/* Conflict info */}
        <Alert
          variant="warning"
          isInline
          title="Conflicting files"
          style={{ marginBottom: '1rem' }}
        >
          <p>
            {conflictingFiles.length} file{conflictingFiles.length !== 1 ? 's' : ''} already exist
            {conflictingFiles.length === 1 ? 's' : ''} in the destination. How should these be
            handled?
          </p>
        </Alert>

        {/* Resolution options */}
        <Form>
          <FormGroup label="Resolution strategy">
            <Radio
              id="skip"
              name="resolution"
              label="Skip"
              description="Skip conflicting files, keep existing destination files"
              isChecked={resolution === 'skip'}
              onChange={() => setResolution('skip')}
            />
            <Radio
              id="overwrite"
              name="resolution"
              label="Overwrite"
              description="Replace existing files with source files"
              isChecked={resolution === 'overwrite'}
              onChange={() => setResolution('overwrite')}
            />
            <Radio
              id="rename"
              name="resolution"
              label="Rename"
              description="Copy source files with new names (e.g., file.txt → file (1).txt)"
              isChecked={resolution === 'rename'}
              onChange={() => setResolution('rename')}
            />
          </FormGroup>
        </Form>

        {/* Conflict list (show first 25) */}
        {conflictingFiles.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h4>Conflicting files:</h4>
            {conflictingFiles.length > 25 && (
              <small style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
                Showing first 25 of {conflictingFiles.length} conflicts
              </small>
            )}
            <List isPlain>
              {conflictingFiles.slice(0, 25).map((file) => (
                <ListItem key={file}>
                  <ExclamationTriangleIcon
                    style={{
                      marginRight: '0.5rem',
                      color: 'var(--pf-t--global--icon--color--status--warning--default)',
                    }}
                  />
                  {file}
                </ListItem>
              ))}
            </List>
          </div>
        )}

        {/* Summary */}
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: 'var(--pf-t--global--background--color--secondary--default)',
            borderRadius: '4px',
          }}
        >
          <h5>Summary</h5>
          <p>
            • {nonConflictingFiles.length} file{nonConflictingFiles.length !== 1 ? 's' : ''} will be
            copied automatically
          </p>
          <p>
            • {conflictingFiles.length} conflict{conflictingFiles.length !== 1 ? 's' : ''} will be{' '}
            {resolution === 'skip'
              ? 'skipped'
              : resolution === 'overwrite'
                ? 'overwritten'
                : 'renamed'}
          </p>
          <p>
            • Total:{' '}
            {nonConflictingFiles.length + (resolution === 'skip' ? 0 : conflictingFiles.length)} files
            will be copied
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button key="apply" variant="primary" onClick={handleResolve}>
          Apply
        </Button>
        <Button key="cancel" variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};
