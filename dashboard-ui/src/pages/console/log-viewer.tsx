// Copyright 2024-2025 Andres Morey
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { useVirtualizer } from '@tanstack/react-virtual';
import type { Virtualizer } from '@tanstack/react-virtual';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';

export type LogViewerInitialPosition =
  | { type: 'head'; timestamp?: never }
  | { type: 'tail'; timestamp?: never }
  | { type: 'time'; timestamp: number };

export type LogViewerVirtualizer = {
  getTotalSize: () => number;
};

export type LogViewerEventMap = {
  isReady: CustomEvent<boolean>;
};

/**
 * LogViewer - Component to render virtualized list of log records
 */

export type LogViewerHandle = {
  isReady: boolean;
  startFollowing: () => Promise<void>;
  stopFollowing: () => void;
  jumpToBeginning: () => Promise<void>;
  jumpToEnd: () => Promise<void>;
  jumpToTime: () => Promise<void>;
  addEventListener: <K extends keyof LogViewerEventMap>(
    type: K,
    listener: (event: LogViewerEventMap[K]) => void,
  ) => void;
  removeEventListener: <K extends keyof LogViewerEventMap>(
    type: K,
    listener: (event: LogViewerEventMap[K]) => void,
  ) => void;
};

export type LogViewerProps = {
  initialPosition?: LogViewerInitialPosition;
  defaultFollow?: boolean;
  children: (virtualizer: LogViewerVirtualizer) => React.ReactNode;
};

const LogViewerInner = ({ children, ...other }: LogViewerProps) => {
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const virtualizer = useMemo(
    () => ({
      getTotalSize: () => 100,
    }),
    [],
  );

  return <div ref={scrollElementRef}>{children(virtualizer)}</div>;
};

export const LogViewer = forwardRef<LogViewerHandle, LogViewerProps>(({ children, ...other }, ref) => {
  const [keyID, setKeyID] = useState(0);
  const eventTargetRef = useRef(new EventTarget());

  useImperativeHandle(
    ref,
    () => ({
      isReady: false,
      startFollowing: async () => {
        console.log('startFollowing');
      },
      stopFollowing: () => {
        console.log('stopFollowing');
      },
      jumpToBeginning: async () => {
        setKeyID((id) => id + 1);
      },
      jumpToEnd: async () => {
        setKeyID((id) => id + 1);
      },
      jumpToTime: async () => {
        setKeyID((id) => id + 1);
      },
      addEventListener: (type, listener) => eventTargetRef.current.addEventListener(type, listener as EventListener),
      removeEventListener: (type, listener) =>
        eventTargetRef.current.removeEventListener(type, listener as EventListener),
    }),
    [],
  );

  return (
    <LogViewerInner key={keyID} {...other}>
      {children}
    </LogViewerInner>
  );
});

LogViewer.displayName = 'LogViewer';
