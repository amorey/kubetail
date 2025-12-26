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

import { useCallback, useContext, useEffect, useState } from 'react';

import { PageContext } from './shared';

/**
 * Header component
 */

export function Header() {
  const { logViewerRef } = useContext(PageContext);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBefore, setIsLoadingBefore] = useState(false);
  const [isLoadingAfter, setIsLoadingAfter] = useState(false);

  const handleClickPlay = useCallback(async () => {
    await logViewerRef.current?.startFollowing();
  }, [logViewerRef]);

  const handleClickPause = useCallback(() => {
    logViewerRef.current?.stopFollowing();
  }, [logViewerRef]);

  const handleJumpToBeginning = useCallback(async () => {
    await logViewerRef.current?.jumpToBeginning();
  }, []);

  const handleJumpToEnd = useCallback(async () => {
    await logViewerRef.current?.jumpToEnd();
  }, []);

  // Init
  useEffect(() => {
    const logViewer = logViewerRef.current;
    if (!logViewer) return console.error('LogViewer not available');

    const c1 = logViewer.onChange('isLoading', setIsLoading);
    const c2 = logViewer.onChange('isLoadingBefore', setIsLoadingBefore);
    const c3 = logViewer.onChange('isLoadingAfter', setIsLoadingAfter);

    setIsLoading(logViewer.isLoading);
    setIsLoadingBefore(logViewer.isLoadingBefore);
    setIsLoadingAfter(logViewer.isLoadingAfter);

    // Return cancel function
    return () => {
      c1();
      c2();
      c3();
    };
  }, []);

  return (
    <div>
      <ul>
        <li>isLoading: {isLoading.toString()}</li>
        <li>{isLoading && 'Loading...'}</li>
        <li>isLoadingBefore: {isLoadingBefore.toString()}</li>
        <li>isLoadingAfter: {isLoadingAfter.toString()}</li>
      </ul>
      <button type="button" onClick={handleJumpToBeginning}>
        Beginning
      </button>
      <button type="button" onClick={handleJumpToEnd}>
        End
      </button>
      <button type="button" onClick={handleClickPlay}>
        Play
      </button>
      <button type="button" onClick={handleClickPause}>
        Pause
      </button>
    </div>
  );
}
