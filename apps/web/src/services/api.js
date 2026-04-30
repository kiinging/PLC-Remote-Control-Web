import axios from 'axios';
import { supabase } from './supabase';

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
// Supabase-based user deletion (used by new Admin.jsx)
export const deleteSupabaseUser = async (email) => (await api.post('/api/admin/delete-user', { email })).data;

// --- Control API wrappers ---
export const getRelayStatus = async () => (await api.get('/api/relay_status')).data;
export const setRelay = async (state) => (await api.post('/api/relay', { relay: state })).data;

// Gateway Heartbeat
export const getGatewayHeartbeat = async () => (await api.get('/api/heartbeat')).data;
export const getCameraHealth = async () => (await api.get('/api/camera_health')).data;

export const getControlStatus = async () => (await api.get('/api/control_status')).data;
export const getTemp = async () => (await api.get('/api/temp')).data;

export const setMode = async (mode) => (await api.post(`/api/mode/${mode}`)).data; // manual, auto, tune

export const startProcess = async (type) => (await api.post(`/api/${type}/on`)).data; // light, web, plc
export const stopProcess = async (type) => (await api.post(`/api/${type}/off`)).data;
export const getWebAck = async () => (await api.get('/api/web_ack')).data;

// PID & Setpoints
export const getPidParams = async () => (await api.get('/api/pid_params')).data;
export const setPidParams = async (params) => (await api.post('/api/pid', params)).data;
export const getPidAck = async () => (await api.get('/api/pid_ack')).data;

export const setSetpoint = async (val) => (await api.post('/api/setpoint', { setpoint: val })).data;
export const getSetpointAck = async () => (await api.get('/api/setpoint_ack')).data;

export const setManualMV = async (val) => (await api.post('/api/mv_manual', { mv_manual: val })).data;
export const getManualMVAck = async () => (await api.get('/api/mv_manual_ack')).data;

// Tune
export const startTune = async () => (await api.post('/api/tune_start')).data;
export const stopTune = async () => (await api.post('/api/tune_stop')).data;
export const getTuneStatus = async () => (await api.get('/api/tune_status')).data;

// Reviews API — uses Supabase directly (no worker handler needed)
export const submitReview = async (data) => {
    const { error } = await supabase.from('reviews').insert([{
        name: data.name,
        rating: data.rating,
        conn_rating: data.conn_rating,
        resp_rating: data.resp_rating,
        comment: data.comment,
    }]);
    if (error) throw error;
    return { ok: true };
};

export const getReviews = async (limit = 15) => {
    const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};

export const deleteReview = async (id) => {
    const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', id);
    if (error) throw error;
    return { ok: true };
};

export default api;
