import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Flex,
  FlexItem,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Progress,
} from '@patternfly/react-core';
import * as React from 'react';
import { storageService } from '@app/services/storageService';
import Emitter from '@app/utils/emitter';
import { formatBytes } from '@app/utils/format';

// Interface for individual transfer items
interface TransferItem {
  path: string;
  type: 'file' | 'directory';
}

interface TransferProgressProps {
  isOpen: boolean;
  jobId: string | null;
  sseUrl: string | null;
  onClose: () => void;
  originalItems?: TransferItem[];
}

// Interface for the SSE event data from backend (job-level updates)
interface JobProgressEvent {
  jobId: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progress: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    percentage: number;
  };
  files: Array<{
    file: string; // destinationPath
    loaded: number;
    total: number;
    status: 'queued' | 'transferring' | 'completed' | 'error';
    error?: string;
  }>;
}

// Interface for individual file transfer state (used in component state)
interface TransferEvent {
  file: string;
  status: 'queued' | 'transferring' | 'completed' | 'error';
  loaded?: number;
  total?: number;
  error?: string;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  isOpen,
  jobId,
  sseUrl,
  onClose,
  originalItems = [],
}) => {
  const [transfers, setTransfers] = React.useState<Map<string, TransferEvent>>(new Map());
  const [jobStatus, setJobStatus] = React.useState<'active' | 'completed' | 'failed' | 'cancelled'>(
    'active',
  );

  // Calculate selection summary with expanded file count
  // Uses React.useMemo to recalculate when transfers update (reactive to SSE events)
  const selectionSummary = React.useMemo(() => {
    const folderCount = originalItems.filter((item) => item.type === 'directory').length;
    const fileCount = originalItems.filter((item) => item.type === 'file').length;

    let summary = '';
    if (folderCount > 0) {
      summary += `${folderCount} folder${folderCount !== 1 ? 's' : ''}`;
    }
    if (fileCount > 0) {
      if (folderCount > 0) summary += ', ';
      summary += `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    }

    // Add expanded total file count if available and different from selection
    // transfers.size represents the expanded count (all files from folders + individual files)
    const expandedCount = transfers.size;
    if (expandedCount > 0 && (folderCount > 0 || expandedCount !== fileCount)) {
      summary += ` → ${expandedCount} total files`;
    }

    return summary;
  }, [originalItems, transfers.size]);

  React.useEffect(() => {
    if (!sseUrl || !jobId) return;

    console.log('[TransferProgress] Connecting to SSE:', sseUrl);
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data: JobProgressEvent = JSON.parse(event.data);
        console.log('[TransferProgress] Received job update:', {
          jobId: data.jobId,
          status: data.status,
          fileCount: data.files.length,
          progress: data.progress,
        });

        // Update all files from the job update
        setTransfers((prev) => {
          const newTransfers = new Map(prev);
          data.files.forEach((fileData) => {
            newTransfers.set(fileData.file, {
              file: fileData.file,
              status: fileData.status,
              loaded: fileData.loaded,
              total: fileData.total,
              error: fileData.error,
            });
          });
          return newTransfers;
        });

        // Close connection when job reaches terminal state
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          console.log('[TransferProgress] Job finished with status:', data.status);
          setJobStatus(data.status);
          eventSource.close();

          // Emit notification for job completion
          if (data.status === 'completed') {
            Emitter.emit('notification', {
              variant: 'success',
              title: 'Transfer completed',
              description: `Successfully transferred ${data.progress.completedFiles} file(s)`,
            });

            // Auto-close modal on successful completion (all files transferred, no failures)
            if (data.progress.failedFiles === 0) {
              setTimeout(() => {
                onClose();
              }, 2000);
            }
          } else if (data.status === 'failed') {
            Emitter.emit('notification', {
              variant: 'danger',
              title: 'Transfer failed',
              description: `Failed to transfer ${data.progress.failedFiles} file(s)`,
            });
          }
        }
      } catch (error) {
        console.error('[TransferProgress] Failed to parse SSE message:', error, 'Raw data:', event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[TransferProgress] SSE connection error:', error);
      console.error('[TransferProgress] EventSource readyState:', eventSource.readyState);
      console.error('[TransferProgress] EventSource URL:', eventSource.url);

      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Transfer connection error',
        description: 'Lost connection to transfer progress updates',
      });
      eventSource.close();
    };

    eventSource.onopen = () => {
      console.log('[TransferProgress] SSE connection established');
    };

    return () => {
      console.log('[TransferProgress] Closing SSE connection');
      eventSource.close();
    };
  }, [sseUrl, jobId]);

  const handleCancel = async () => {
    // Only attempt to cancel if job is still active
    if (jobId && jobStatus === 'active') {
      try {
        await storageService.cancelTransfer(jobId);
        Emitter.emit('notification', {
          variant: 'info',
          title: 'Transfer cancelled',
          description: 'The file transfer has been cancelled',
        });
      } catch (error) {
        console.error('Failed to cancel transfer:', error);
        Emitter.emit('notification', {
          variant: 'danger',
          title: 'Failed to cancel transfer',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    // Always close the modal
    onClose();
  };

  // Calculate total bytes by aggregating all transfers
  const totalBytes = Array.from(transfers.values()).reduce((sum, t) => sum + (t.total || 0), 0);
  const transferredBytes = Array.from(transfers.values()).reduce(
    (sum, t) => sum + (t.loaded || 0),
    0,
  );
  const percentageComplete =
    totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;

  const completedFiles = Array.from(transfers.values()).filter(
    transfer => transfer.status === 'completed'
  ).length;
  const totalFiles = transfers.size;
  const failedFiles = Array.from(transfers.values()).filter(
    transfer => transfer.status === 'error'
  ).length;

  return (
    <Modal variant="large" isOpen={isOpen} onClose={onClose} aria-labelledby="transfer-progress-modal">
      <ModalHeader
        title={`File Transfer Progress${selectionSummary ? `: ${selectionSummary}` : ''}`}
      />
      <ModalBody>
        {/* Progress overview */}
        <Card isCompact style={{ marginBottom: '1rem' }}>
          <CardBody>
            <Progress
              value={percentageComplete}
              title={`${formatBytes(transferredBytes)} / ${formatBytes(totalBytes)}`}
            />
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {completedFiles} / {totalFiles} files
                {failedFiles > 0 && (
                  <Label color="red" style={{ marginLeft: '0.5rem' }}>
                    {failedFiles} failed
                  </Label>
                )}
              </span>
              <span>{percentageComplete}%</span>
            </div>
          </CardBody>
        </Card>

        {/* Detailed file transfers */}
        {Array.from(transfers.values()).map((transfer) => (
          <Card key={transfer.file} isCompact style={{ marginBottom: '1rem' }}>
            <CardTitle>
              <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                <FlexItem>{transfer.file}</FlexItem>
                <FlexItem>
                  {transfer.status === 'error' ? (
                    <Label color="red">Error</Label>
                  ) : transfer.status === 'completed' ? (
                    <Label color="green">Complete</Label>
                  ) : transfer.status === 'queued' ? (
                    <Label color="grey">Queued</Label>
                  ) : (
                    <Label color="blue">Transferring</Label>
                  )}
                </FlexItem>
              </Flex>
            </CardTitle>
            <CardBody>
              {transfer.status === 'transferring' && transfer.loaded && transfer.total && (
                <Progress
                  value={(transfer.loaded / transfer.total) * 100}
                  title={`${formatBytes(transfer.loaded)} / ${formatBytes(transfer.total)}`}
                />
              )}
              {transfer.error && (
                <Alert variant="danger" title="Transfer error" isInline>
                  {transfer.error}
                </Alert>
              )}
            </CardBody>
          </Card>
        ))}

        {transfers.size === 0 && (
          <Alert variant="info" title="No transfers" isInline>
            No active transfers
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        {jobStatus === 'active' ? (
          <Button variant="danger" onClick={handleCancel}>
            Cancel Transfer
          </Button>
        ) : (
          <Button variant="primary" onClick={handleCancel}>
            Close
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};
