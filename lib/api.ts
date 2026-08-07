import axios, { AxiosRequestConfig } from 'axios';
import { env } from './env';
import { activeStorage, getStoredToken, getStoredRefreshToken, clearStoredSession, loginRedirectPath } from './session';

const BASE_URL = env.API_URL;

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  config: AxiosRequestConfig;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else {
      if (config.headers) config.headers['Authorization'] = `Bearer ${token!}`;
      resolve(api(config));
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = getStoredRefreshToken();

      if (!refreshToken) {
        clearStoredSession();
        window.location.href = `${loginRedirectPath()}?redirect=${encodeURIComponent(window.location.pathname)}`;
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject, config: originalRequest });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data;
        // Write the refreshed pair back into whichever storage this
        // session actually lives in (sessionStorage for a quick-view tab,
        // localStorage for everyone else) — never the other one.
        activeStorage().setItem('token', accessToken);
        activeStorage().setItem('refreshToken', newRefreshToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        processQueue(null, accessToken);
        if (originalRequest.headers)
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearStoredSession();
        window.location.href = `${loginRedirectPath()}?redirect=${encodeURIComponent(window.location.pathname)}`;
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export { api };

export const apiCall = async (method: string, path: string, data?: unknown) => {
  const res = await api({ method, url: path, data });
  return res.data;
};
