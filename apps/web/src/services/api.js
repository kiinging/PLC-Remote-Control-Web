import axios from 'axios';

// Use the LIVE backend URL as requested by the user
// Use relative path so requests go through Vite Proxy
const API_URL = '';

// Create an axios instance with credentials (cookies) support for session management
export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true, // Important: Sends cookies with requests
    headers: {
        'Content-Type': 'application/json',
    }
});

export const login = async (username, password) => {
    const response = await api.post('/api/login', { username, password });
    return response.data;
};

export const register = async (username, password) => {
    const response = await api.post('/api/signup', { username, password });
    return response.data;
};

export const logout = async () => {
    const response = await api.post('/api/logout');
    return response.data;
};

export const checkSession = async () => {
    const response = await api.get('/api/session');
    return response.data;
};

export const exchangeAuth = async (access_token, user_email) => {
    const response = await api.post('/api/auth/exchange', { access_token, user_email });
    return response.data;
};

// --- Admin API ---
export const getUsers = async () => (await api.get('/api/users')).data;
export const deleteUser = async (username) => (await api.post('/api/user/delete', { username })).data;

// --- Control API wrappers ---
export const getRelayStatus = async () => (await api.get('/relay')).data;
export const setRelay = async (state) => (await api.post('/relay', { relay: state })).data;

// Gateway Heartbeat
export const getGatewayHeartbeat = async () => (await api.get('/heartbeat')).data;
export const getCameraHealth = async () => (await api.get('/camera_health')).data;

export const getControlStatus = async () => (await api.get('/control_status')).data;
export const getTemp = async () => (await api.get('/temp')).data;

export const setMode = async (mode) => (await api.post(`/${mode}_mode`)).data; // manual, auto, tune

export const startProcess = async (type) => (await api.post(`/start_${type}`)).data; // light, web, plc
export const stopProcess = async (type) => (await api.post(`/stop_${type}`)).data;
export const getWebAck = async () => (await api.get('/web_ack')).data;

// PID & Setpoints
export const getPidParams = async () => (await api.get('/pid_params')).data;
export const setPidParams = async (params) => (await api.post('/pid', params)).data;
export const getPidAck = async () => (await api.get('/pid_ack')).data;

export const setSetpoint = async (val) => (await api.post('/setpoint', { setpoint: val })).data;
export const getSetpointAck = async () => (await api.get('/setpoint_ack')).data;

export const setManualMV = async (val) => (await api.post('/mv_manual', { mv_manual: val })).data;
export const getManualMVAck = async () => (await api.get('/mv_manual_ack')).data;

// Tune
export const startTune = async () => (await api.post('/tune_start')).data;
export const stopTune = async () => (await api.post('/tune_stop')).data;
export const getTuneStatus = async () => (await api.get('/tune_status')).data;
export const setTuneSetpoint = async (val) => (await api.post('/tune_setpoint', { setpoint: val })).data;
export const getTuneSetpointAck = async () => (await api.get('/tune_setpoint_ack')).data;

export default api;
