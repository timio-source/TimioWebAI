import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Get API base URL from environment or use proxy in development
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Fix: Proper URL construction to avoid double slashes
  let fullUrl;
  if (API_BASE_URL) {
    // Remove trailing slash from base URL and leading slash from url
    const baseUrl = API_BASE_URL.replace(/\/$/, '');
    const endpoint = url.startsWith('/') ? url.slice(1) : url;
    fullUrl = `${baseUrl}/${endpoint}`;
  } else {
    fullUrl = url;
  }
  
  console.log('Making API request to:', fullUrl); // Debug log
  
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "omit",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    // Fix: Same URL construction logic for queries
    let fullUrl;
    if (API_BASE_URL) {
      const baseUrl = API_BASE_URL.replace(/\/$/, '');
      const endpoint = url.startsWith('/') ? url.slice(1) : url;
      fullUrl = `${baseUrl}/${endpoint}`;
    } else {
      fullUrl = url;
    }
    
    console.log('Making query request to:', fullUrl); // Debug log
    
    const res = await fetch(fullUrl, {
      credentials: "omit",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});