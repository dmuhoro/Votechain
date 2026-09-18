import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { safeStorage, AUTH_TOKEN_KEY } from './storage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type ApiErrorKind = 'offline' | 'timeout' | 'http' | 'network' | 'aborted';

/** Normalized API error. `original` keeps the raw axios error for call sites. */
export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  serverMessage?: string;
  original?: unknown;

  constructor(kind: ApiErrorKind, message: string, extra?: Partial<Pick<ApiError, 'status' | 'serverMessage' | 'original'>>) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    if (extra?.status !== undefined) this.status = extra.status;
    if (extra?.serverMessage !== undefined) this.serverMessage = extra.serverMessage;
    if (extra?.original !== undefined) this.original = extra.original;
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

/** Extract a human-safe message from any thrown value. */
export const toErrorMessage = (err: unknown, fallback: string): string => {
  if (isApiError(err)) {
    if (err.kind === 'offline') return 'You are offline. Reconnect to continue.';
    if (err.kind === 'timeout') return 'The request timed out. Check your connection and try again.';
    return err.serverMessage ?? err.message ?? fallback;
  }
  const message = (err as { message?: string } | null)?.message;
  if (typeof message === 'string' && message.length > 0) return message;
  return fallback;
};

const shouldRetry = (err: AxiosError): boolean => {
  const method = (err.config?.method ?? 'get').toLowerCase();
  const idempotent = method === 'get' || method === 'head' || method === 'options';
  const retriable = err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK';
  // Never retry when the browser already knows we are offline.
  const mayBeOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  return idempotent && retriable && mayBeOnline;
};

const classify = (err: AxiosError): ApiError => {
  const status = err.response?.status;
  const serverMessage =
    typeof (err.response?.data as { message?: unknown } | undefined)?.message === 'string'
      ? ((err.response?.data as { message: string }).message)
      : undefined;

  if (err.code === 'ECONNABORTED') {
    return new ApiError('timeout', 'Request timed out.', { status, serverMessage, original: err });
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ApiError('offline', 'You are offline.', { status, serverMessage, original: err });
  }
  if (err.code === 'ERR_NETWORK') {
    return new ApiError('network', 'Could not reach the VoteChain service.', { status, serverMessage, original: err });
  }
  if (status !== undefined) {
    return new ApiError('http', serverMessage ?? err.message, { status, serverMessage, original: err });
  }
  return new ApiError('network', err.message || 'Network error.', { status, serverMessage, original: err });
};

export const UNAUTHORIZED_EVENT = 'votechain:unauthorized';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = safeStorage.getString(AUTH_TOKEN_KEY) ?? useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { __votechainRetried?: boolean }) | undefined;

    if (originalRequest && shouldRetry(error) && !originalRequest.__votechainRetried) {
      originalRequest.__votechainRetried = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return api.request(originalRequest);
    }

    if (error.response?.status === 401) {
      useAuthStore.getState().setToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    }

    return Promise.reject(classify(error));
  },
);

export default api;