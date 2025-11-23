import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  ContentVariants,
  DataList,
  DataListCell,
  DataListItem,
  DataListItemCells,
  DataListItemRow,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core';
import { FolderIcon, PlusIcon } from '@patternfly/react-icons';
import * as React from 'react';
import { FileEntry, StorageLocation, storageService } from '@app/services/storageService';
import Emitter from '@app/utils/emitter';

interface DestinationPickerProps {
  isOpen: boolean;
  onSelect: (locationId: string, path: string) => void;
  onCancel: () => void;
}

export const DestinationPicker: React.FC<DestinationPickerProps> = ({
  isOpen,
  onSelect,
  onCancel,
}) => {
  const [locations, setLocations] = React.useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = React.useState<string>('');
  const [currentPath, setCurrentPath] = React.useState<string>('');
  const [directories, setDirectories] = React.useState<FileEntry[]>([]);

  // Folder creation modal state
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFolderNameRulesVisibility, setNewFolderNameRulesVisibility] = React.useState(false);

  // Load locations on mount
  React.useEffect(() => {
    if (isOpen) {
      storageService
        .getLocations()
        .then((locations) => {
          setLocations(locations);

          // Check if we got any available locations
          const availableLocations = locations.filter((loc) => loc.available);
          if (locations.length === 0) {
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'No storage locations available',
              description:
                'All storage sources failed to load. Check S3 and local storage configuration. See browser console for details.',
            });
          } else if (availableLocations.length === 0) {
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'All storage locations unavailable',
              description: 'Storage locations exist but are not accessible. Check configuration.',
            });
          }
        })
        .catch((error: any) => {
          // This should not happen with allSettled, but keep as safety net
          console.error('Failed to fetch locations:', error);
          Emitter.emit('notification', {
            variant: 'danger',
            title: 'Failed to load storage locations',
            description: error.message || 'Unknown error',
          });
        });
    }
  }, [isOpen]);

  // Load directories when location or path changes
  React.useEffect(() => {
    if (selectedLocation) {
      storageService
        .listFiles(selectedLocation, currentPath)
        .then(({ files }) => {
          setDirectories(files.filter((f) => f.type === 'directory'));
        })
        .catch((error: any) => {
          console.error('Failed to list directories:', error);
          Emitter.emit('notification', {
            variant: 'danger',
            title: 'Failed to load directories',
            description: error.message || 'Unknown error',
          });
        });
    }
  }, [selectedLocation, currentPath]);

  // Folder name validation function - storage-type-aware
  const validateFolderName = (folderName: string, storageType?: 's3' | 'local'): boolean => {
    if (folderName === '') {
      return false;
    }

    // Storage-type-specific validation patterns (no spaces allowed in either)
    const validCharacters =
      storageType === 's3'
        ? /^[a-zA-Z0-9!.\-_*'()]+$/ // S3: letters, numbers, and safe special chars
        : /^[a-zA-Z0-9._-]+$/; // Local/PVC: only letters, numbers, dots, underscores, hyphens

    if (!validCharacters.test(folderName)) {
      return false;
    }
    return true;
  };

  // Real-time validation feedback for folder name
  React.useEffect(() => {
    if (newFolderName.length > 0) {
      const location = locations.find((loc) => loc.id === selectedLocation);
      setNewFolderNameRulesVisibility(!validateFolderName(newFolderName, location?.type));
    } else {
      setNewFolderNameRulesVisibility(false);
    }
  }, [newFolderName, selectedLocation, locations]);

  const handleNavigateInto = (dir: FileEntry) => {
    setCurrentPath(dir.path);
  };

  const handleBreadcrumbClick = (path: string) => {
    setCurrentPath(path);
  };

  // Open create folder modal
  const handleCreateFolder = () => {
    setIsCreateFolderModalOpen(true);
  };

  // Handle folder creation confirmation
  const handleCreateFolderConfirm = async () => {
    const location = locations.find((loc) => loc.id === selectedLocation);
    if (!validateFolderName(newFolderName, location?.type)) {
      return;
    }

    const newPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;

    try {
      await storageService.createDirectory(selectedLocation, newPath);

      // Refresh directory list
      const { files } = await storageService.listFiles(selectedLocation, currentPath);
      setDirectories(files.filter((f) => f.type === 'directory'));

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Folder created',
        description: `Folder "${newFolderName}" created successfully`,
      });

      // Close modal and reset state
      setNewFolderName('');
      setIsCreateFolderModalOpen(false);
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Failed to create folder',
        description: error.message || 'Unknown error',
      });
    }
  };

  // Cancel folder creation
  const handleCreateFolderCancel = () => {
    setNewFolderName('');
    setIsCreateFolderModalOpen(false);
  };

  return (
    <>
      <Modal
        className="standard-modal"
        isOpen={isOpen}
        onClose={onCancel}
      >
      <ModalHeader title="Select Destination" />
      <ModalBody>
        <Form>
          <FormGroup label="Storage Location" isRequired>
            <FormSelect
              id="destination-location-select"
              aria-label="Select storage location"
              value={selectedLocation}
              onChange={(_event, value) => {
                setSelectedLocation(value as string);
                setCurrentPath('');
              }}
            >
              <FormSelectOption value="" label="Select location..." isDisabled />
              {locations.map((loc) => (
                <FormSelectOption
                  key={loc.id}
                  value={loc.id}
                  label={`${loc.name} (${loc.type.toUpperCase()})${!loc.available ? ' (unavailable)' : ''}`}
                  isDisabled={!loc.available}
                />
              ))}
            </FormSelect>
          </FormGroup>

          {selectedLocation && (
            <>
              <Breadcrumb>
                <BreadcrumbItem>
                  <Button
                    variant="link"
                    className="breadcrumb-button"
                    onClick={() => handleBreadcrumbClick('')}
                    aria-label="Root"
                  >
                    Root
                  </Button>
                </BreadcrumbItem>
                {(currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath)
                  .split('/')
                  .filter(Boolean)
                  .map((segment, i, segments) => (
                    <BreadcrumbItem key={i}>
                      <Button
                        variant="link"
                        className="breadcrumb-button"
                        onClick={() => handleBreadcrumbClick(segments.slice(0, i + 1).join('/') + '/')}
                        aria-label={segment}
                      >
                        {segment}
                      </Button>
                    </BreadcrumbItem>
                  ))}
              </Breadcrumb>

              <DataList aria-label="Directory list">
                {directories.map((dir) => (
                  <DataListItem key={dir.path}>
                    <DataListItemRow>
                      <DataListItemCells
                        dataListCells={[
                          <DataListCell key="name">
                            <Button
                              variant="link"
                              onClick={() => handleNavigateInto(dir)}
                              className="button-folder-link"
                            >
                              <FolderIcon /> {dir.name}
                            </Button>
                          </DataListCell>,
                        ]}
                      />
                    </DataListItemRow>
                  </DataListItem>
                ))}
              </DataList>

              <Button variant="secondary" onClick={handleCreateFolder} icon={<PlusIcon />}>
                Create Folder
              </Button>
            </>
          )}
        </Form>
      </ModalBody>

      <ModalFooter>
        <Button
          key="select"
          variant="primary"
          onClick={() => onSelect(selectedLocation, currentPath)}
          isDisabled={!selectedLocation}
        >
          Select Destination
        </Button>
        <Button key="cancel" variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>

    {/* Create Folder Modal */}
    <Modal
      className="standard-modal"
      isOpen={isCreateFolderModalOpen}
      onClose={handleCreateFolderCancel}
      variant="small"
    >
      <ModalHeader title="Create a new folder" />
      <ModalBody>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            if (newFolderName.length > 0 && !newFolderNameRulesVisibility) {
              handleCreateFolderConfirm();
            }
          }}
        >
          <FormGroup label="Folder name" isRequired fieldId="folder-name">
            <TextInput
              isRequired
              type="text"
              id="folder-name"
              name="folder-name"
              aria-describedby="folder-name-helper"
              placeholder="Enter at least 1 character"
              value={newFolderName}
              onChange={(_event, newFolderName) => setNewFolderName(newFolderName)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (newFolderName.length > 0 && !newFolderNameRulesVisibility) {
                    handleCreateFolderConfirm();
                  }
                }
              }}
            />
          </FormGroup>
        </Form>
        <Content hidden={!newFolderNameRulesVisibility}>
          <Content component={ContentVariants.small} className="bucket-name-rules">
            Folder names must:
            <ul>
              <li>be unique</li>
              {locations.find((loc) => loc.id === selectedLocation)?.type === 's3' ? (
                <li>
                  only contain letters (a-z, A-Z), numbers (0-9), and these special characters: ! . - _ * ' ( )
                  <br />
                  Spaces are not allowed
                </li>
              ) : (
                <li>
                  only contain letters (a-z, A-Z), numbers (0-9), dots (.), underscores (_), and hyphens (-)
                  <br />
                  Spaces and special characters are not allowed
                </li>
              )}
            </ul>
          </Content>
        </Content>
      </ModalBody>
      <ModalFooter>
        <Button
          key="create"
          variant="primary"
          onClick={handleCreateFolderConfirm}
          isDisabled={newFolderName.length < 1 || newFolderNameRulesVisibility}
        >
          Create
        </Button>
        <Button key="cancel" variant="link" onClick={handleCreateFolderCancel}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
};
