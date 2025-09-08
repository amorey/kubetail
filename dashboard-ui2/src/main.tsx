import { render } from 'solid-js/web';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import App from './App';
import 'solid-devtools';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // keep cache small/stable in dev
      gcTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ),
  document.getElementById('root') as HTMLElement,
);
