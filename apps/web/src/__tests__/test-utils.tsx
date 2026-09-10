import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type * as React from "react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        gcTime: 0,
        retry: false,
        staleTime: 0,
      },
    },
  });
}

type TestProviderProps = {
  children: React.ReactNode;
  queryClient?: QueryClient;
};

function AllProviders({ children, queryClient }: TestProviderProps) {
  return (
    <QueryClientProvider client={queryClient ?? createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

type TestRenderOptions = Omit<RenderOptions, "wrapper"> & {
  queryClient?: QueryClient;
};

function customRender(ui: React.ReactElement, options?: TestRenderOptions) {
  const { queryClient, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: ({ children }: TestProviderProps) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    ),
    ...renderOptions,
  });
}

export * from "@testing-library/react";
export { customRender as render };
