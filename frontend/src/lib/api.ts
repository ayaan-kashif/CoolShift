import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  timeout: 60000,
});

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const scenariosApi = {
  list: () => api.get('/api/v1/scenarios'),
  get: (id: string) => api.get(`/api/v1/scenarios/${id}`),
  create: (data: any) => api.post('/api/v1/scenarios', data),
  delete: (id: string) => api.delete(`/api/v1/scenarios/${id}`),
};

export const importApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/v1/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
};

export const enginesApi = {
  baseline: (scenarioId: string, body?: any) => api.post(`/api/v1/baseline/${scenarioId}`, body ?? {}),
  optimize: (scenarioId: string, weights: any, body?: any) =>
    api.post(`/api/v1/optimize/${scenarioId}`, { weights, ...body }),
};

export const runsApi = {
  list: () => api.get('/api/v1/runs'),
  schedule: (runId: string, params?: any) => api.get(`/api/v1/runs/${runId}/schedule`, { params }),
  summary: (runId: string) => api.get(`/api/v1/runs/${runId}/summary`),
  compare: (runId: string) => api.get(`/api/v1/runs/${runId}/compare`),
  delete: (runId: string) => api.delete(`/api/v1/runs/${runId}`),
};

export const exportApi = {
  csv: (runId: string) => `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/export/${runId}/csv`,
  xlsx: (runId: string) => `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/export/${runId}/xlsx`,
  summaryCsv: (runId: string) => `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/export/${runId}/summary-csv`,
};

export const healthApi = {
  check: () => api.get('/api/v1/health'),
};

export default api;
