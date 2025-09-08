// Minimal types needed for the pods table

export type UID = string;

export type FileInfo = {
  size: number; // total bytes (absolute)
  lastModifiedAt: number; // epoch millis; 0 means unknown
};

export type Container = {
  id: string; // usually container runtime id
  name: string;
};

export type Pod = {
  uid: UID;
  namespace: string;
  name: string;
  containers: Container[];
};

export type LogMetadataEvent = {
  containerID: string;
  fileInfo: FileInfo;
};

export type PodDerived = {
  uid: UID;
  namespace: string;
  name: string;
  totalSize: number;
  lastEvent: number; // latest across containers
  containers: Container[];
};
