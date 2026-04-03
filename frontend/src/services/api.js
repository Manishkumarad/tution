import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
});

const authApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'
});

let refreshInFlight = null;

function clearSessionAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userRole');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token');
  }

  const { data } = await authApi.post('/auth/refresh', { refreshToken });
  const nextAccessToken = data?.tokens?.accessToken;
  if (!nextAccessToken) {
    throw new Error('Refresh failed');
  }

  localStorage.setItem('accessToken', nextAccessToken);
  return nextAccessToken;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const message = error.response?.data?.message;
    const isAuthError = status === 401 && (message === 'Invalid or expired token' || message === 'Unauthorized');

    if (!originalRequest || originalRequest._retry || !isAuthError) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }

      const newToken = await refreshInFlight;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api.request(originalRequest);
    } catch (refreshErr) {
      clearSessionAndRedirect();
      return Promise.reject(refreshErr);
    }
  }
);

export async function login(payload) {
  const { data } = await api.post('/auth/login', payload);
  return data;
}

export async function coachingSignup(payload) {
  const { data } = await api.post('/auth/coaching-signup', payload);
  return data;
}

export async function requestLoginOtp(payload) {
  const { data } = await api.post('/auth/recovery/request-login-otp', payload);
  return data;
}

export async function loginWithOtp(payload) {
  const { data } = await api.post('/auth/recovery/login-with-otp', payload);
  return data;
}

export async function requestResetOtp(payload) {
  const { data } = await api.post('/auth/recovery/request-reset-otp', payload);
  return data;
}

export async function resetPasswordWithOtp(payload) {
  const { data } = await api.post('/auth/recovery/reset-password', payload);
  return data;
}

export async function fetchRecoveryAudit(params) {
  const { data } = await api.get('/auth/recovery/audit', { params });
  return data;
}

export async function fetchMyProfile() {
  const { data } = await api.get('/auth/me');
  return data;
}

export async function fetchMembershipPlans() {
  const { data } = await api.get('/auth/membership/plans');
  return data;
}

export async function createMembershipOrder(payload) {
  const { data } = await api.post('/auth/membership/create-order', payload);
  return data;
}

export async function verifyMembershipOrder(payload) {
  const { data } = await api.post('/auth/membership/verify-order', payload);
  return data;
}

export async function fetchSummary() {
  const { data } = await api.get('/dashboard/summary');
  return data;
}

export async function fetchRevenue() {
  const { data } = await api.get('/dashboard/revenue');
  return data;
}

export async function fetchStudents(params) {
  const { data } = await api.get('/students', { params });
  return data;
}

export async function fetchStudentById(studentId) {
  const { data } = await api.get(`/students/${studentId}`);
  return data;
}

export async function createStudent(payload) {
  const { data } = await api.post('/students', payload);
  return data;
}

export async function recordManualPayment(payload) {
  const { data } = await api.post('/payments/manual', payload);
  return data;
}

export async function triggerDueReminders() {
  const { data } = await api.post('/notifications/trigger-due');
  return data;
}

export async function triggerAllPendingReminders() {
  const { data } = await api.post('/notifications/trigger-all-pending');
  return data;
}

export async function fetchFeePlans() {
  const { data } = await api.get('/fees/plans');
  return data;
}

export async function createFeePlan(payload) {
  const { data } = await api.post('/fees/plans', payload);
  return data;
}

export async function updateFeePlan(planId, payload) {
  const { data } = await api.patch(`/fees/plans/${planId}`, payload);
  return data;
}

export async function bootstrapFeePlans() {
  const { data } = await api.post('/fees/plans/bootstrap');
  return data;
}

export async function scanQr(qr_token) {
  const { data } = await api.post('/attendance/scan', { qr_token });
  return data;
}

export async function fetchStudentPass(studentId) {
  const { data } = await api.get(`/students/public/pass/${studentId}`);
  return data;
}

export async function fetchStudentPassByToken(qrToken) {
  const { data } = await api.get(`/students/public/pass-token/${qrToken}`);
  return data;
}

export async function fetchParentFeeStatus(studentId) {
  const { data } = await api.get(`/parents/students/${studentId}/fee-status`);
  return data;
}

export async function fetchParentAttendance(studentId, params) {
  const { data } = await api.get(`/parents/students/${studentId}/attendance`, { params });
  return data;
}

export default api;
