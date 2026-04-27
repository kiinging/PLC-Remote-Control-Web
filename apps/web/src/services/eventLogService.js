import { supabase } from './supabase';

export const eventLogService = {
    /**
     * Log a user login event.
     * @param {string} email - User email address
     */
    async logLogin(email) {
        try {
            await supabase.from('event_logs').insert([{
                event_type: 'login',
                user_email: email,
                details: {}
            }]);
        } catch (e) {
            console.warn('Failed to log login event:', e);
        }
    },

    /**
     * Log a user logout event.
     * @param {string} email - User email address
     */
    async logLogout(email) {
        if (!email) return;
        try {
            await supabase.from('event_logs').insert([{
                event_type: 'logout',
                user_email: email,
                details: {}
            }]);
        } catch (e) {
            console.warn('Failed to log logout event:', e);
        }
    },

    /**
     * Log a booking event.
     * @param {string} email - User email
     * @param {string} start - ISO start time
     * @param {string} end - ISO end time
     */
    async logBooking(email, start, end) {
        try {
            await supabase.from('event_logs').insert([{
                event_type: 'booking',
                user_email: email,
                details: { start, end }
            }]);
        } catch (e) {
            console.warn('Failed to log booking event:', e);
        }
    },

    /**
     * Log a temperature alert (temperature exceeded 100°C).
     * @param {string} email - User email currently logged in
     * @param {number} temperature - The temperature value that triggered the alert
     */
    async logTempAlert(email, temperature) {
        try {
            await supabase.from('event_logs').insert([{
                event_type: 'temp_alert',
                user_email: email,
                details: { temperature: Number(temperature).toFixed(2) }
            }]);
        } catch (e) {
            console.warn('Failed to log temp alert:', e);
        }
    },

    /**
     * Fetch event logs, optionally filtered by type.
     * @param {string|null} eventType - 'login', 'temp_alert', or null for all
     * @param {number} limit - Max rows to return
     */
    async getEventLogs(eventType = null, limit = 200) {
        let query = supabase
            .from('event_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (eventType) {
            if (Array.isArray(eventType)) {
                query = query.in('event_type', eventType);
            } else {
                query = query.eq('event_type', eventType);
            }
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }
};
