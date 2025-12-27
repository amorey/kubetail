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

import { PanelLeftClose as PanelLeftCloseIcon } from 'lucide-react';
import { useCallback, useContext, useMemo, useRef, useState } from 'react';

import AppLayout from '@/components/layouts/AppLayout';
import AuthRequired from '@/components/utils/AuthRequired';

import { Header } from './header';
import type { LogViewerHandle } from './log-viewer';
import { Main } from './main';
import { PageContext } from './shared';
import { Sidebar } from './sidebar';

/**
 * InnerLayout component
 */

type InnerLayoutProps = {
  sidebar: React.ReactElement;
  header: React.ReactElement;
  main: React.ReactElement;
};

const InnerLayout = ({ sidebar, header, main }: InnerLayoutProps) => {
  const { isSidebarOpen, setIsSidebarOpen } = useContext(PageContext);
  const [sidebarWidth, setSidebarWidth] = useState(300);

  const handleDrag = useCallback(() => {
    // change width when mouse moves
    const fn = (ev: MouseEvent) => {
      const newWidth = Math.max(ev.clientX, 180);
      setSidebarWidth(newWidth);
    };
    document.addEventListener('mousemove', fn);

    // show resize cursor
    const bodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'ew-resize';

    // disable text select
    const onSelectStart = document.body.onselectstart;
    document.body.onselectstart = () => false;

    // cleanup
    document.addEventListener('mouseup', function cleanup() {
      document.removeEventListener('mousemove', fn);
      document.body.style.cursor = bodyCursor;
      document.body.onselectstart = onSelectStart;
      document.removeEventListener('mouseup', cleanup);
    });
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, [setIsSidebarOpen]);

  return (
    <div className="relative h-full">
      {isSidebarOpen && (
        <>
          <div className="absolute h-full bg-chrome-100 overflow-x-hidden" style={{ width: `${sidebarWidth}px` }}>
            {sidebar}
            <button
              type="button"
              onClick={handleCloseSidebar}
              title="Collapse sidebar"
              className="absolute cursor-pointer right-1.75 top-7.5 transform -translate-y-1/2"
            >
              <PanelLeftCloseIcon size={20} strokeWidth={2} className="text-chrome-500" />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="absolute bg-chrome-divider w-1 h-full border-l-2 border-chrome-100 cursor-ew-resize"
            style={{ left: `${sidebarWidth}px` }}
            onMouseDown={handleDrag}
          />
        </>
      )}
      <main
        className="h-full flex flex-col overflow-hidden"
        style={{ marginLeft: `${isSidebarOpen ? sidebarWidth + 4 : 0}px` }}
      >
        <div className="bg-chrome-100 border-b border-chrome-divider">{header}</div>
        <div className="grow min-h-0">{main}</div>
      </main>
    </div>
  );
};

/**
 * Page component
 */

export default function Page() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const logViewerRef = useRef<LogViewerHandle>(null);

  const context = useMemo(
    () => ({
      isSidebarOpen,
      setIsSidebarOpen,
      logViewerRef,
    }),
    [isSidebarOpen],
  );

  return (
    <AuthRequired>
      <PageContext.Provider value={context}>
        <AppLayout>
          <InnerLayout sidebar={<Sidebar />} header={<Header />} main={<Main />} />
        </AppLayout>
      </PageContext.Provider>
    </AuthRequired>
  );
}
