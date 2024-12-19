import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, createRoutesFromElements, RouterProvider } from 'react-router-dom';

import { getBasename } from '@/lib/util';
import { routes } from './routes';

const router = createBrowserRouter(createRoutesFromElements(routes), { basename: getBasename() });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
