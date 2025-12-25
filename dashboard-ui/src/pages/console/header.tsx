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
  const [isReady, setIsReady] = useState(false);

  const handleClickPlay = useCallback(async () => {
    await logViewerRef.current?.startFollowing();
  }, [logViewerRef]);

  const handleClickPause = useCallback(() => {
    logViewerRef.current?.stopFollowing();
  }, [logViewerRef]);

  const handleJumpToBeginning = useCallback(async () => {
    await logViewerRef.current?.jumpToBeginning();
  }, []);

  useEffect(() => {
    const logViewer = logViewerRef.current;
    if (!logViewer) return console.error('LogViewer not available');

    return logViewer.onIsReadyChange(setIsReady);
  }, []);

  return (
    <div>
      <ul>
        <li>isReady: {logViewerRef.current?.isReady.toString()}</li>
        <li>isPaused:</li>
      </ul>
      <button type="button" onClick={handleJumpToBeginning}>
        Beginning
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
