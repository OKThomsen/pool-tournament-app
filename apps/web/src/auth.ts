import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export interface Admin {
  username: string;
}

const sessionKey = ['session'];

/** The logged-in admin, or null for the public. `undefined` while it's still loading. */
export function useSession(): Admin | null | undefined {
  const { data } = useQuery({
    queryKey: sessionKey,
    queryFn: async () => {
      try {
        return await api<Admin>('/auth/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
  return data;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api<Admin>('/auth/login', { method: 'POST', body: credentials }),
    onSuccess: (admin) => queryClient.setQueryData(sessionKey, admin),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueryData(sessionKey, null);
      // Drop anything loaded while logged in.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    },
  });
}
