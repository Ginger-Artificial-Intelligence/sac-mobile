import axios from 'axios';
import { storage } from '../store/mmkv';
import { BASE_URL } from '../constants/api';
import { mmkvKeys } from '../constants/storage';

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

API.interceptors.request.use(
  async (config) => {
    try {
      let token = storage.getString(mmkvKeys.USER_TOKEN);
      if (!token) {
        try {
          const { useSyncStore } = require('../store/syncStore');
          token = useSyncStore.getState().userToken;
        } catch (_) {}
      }
      const tenantId = storage.getString(mmkvKeys.TENANT_ID);

      if (token && !config.url?.endsWith('/login') && !config.url?.endsWith('/send-otp')) {
        config.headers.Authorization = config.headers.Authorization || `Bearer ${token}`;
      }

      if (tenantId) {
        config.headers['X-Tenant-ID'] = tenantId;
        config.headers['x-tenant-id'] = tenantId;
      }
    } catch (error) {
      console.error('Failed to attach auth headers:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = String(error.config?.url || '');
      if (!url.endsWith('/login') && !url.endsWith('/send-otp')) {
        // Dynamic import to break require cycle dependency at boot time
        try {
          const { useSyncStore } = require('../store/syncStore');
          useSyncStore.getState().logout();
        } catch (e) {
          console.error("Failed to trigger session logout:", e);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default API;
