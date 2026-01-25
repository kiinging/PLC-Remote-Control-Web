import { supabase } from './supabase';

export const bookingService = {
    // Fetch bookings for a date range (ISO strings)
    async getBookings(start, end) {
        const { data, error } = await supabase
            .from('bookings')
            .select('*, profiles:user_id(email)') // Assuming you might have public profile, else just user_id
            .gte('end_time', start)
            .lte('start_time', end)
            .order('start_time', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Create a new booking
    async createBooking(startTime, endTime) {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('bookings')
            .insert([
                {
                    user_id: user.id,
                    start_time: startTime, // ISO string
                    end_time: endTime      // ISO string
                }
            ])
            .select();

        if (error) throw error;
        return data[0];
    },

    // Delete a booking
    async deleteBooking(bookingId) {
        const { error } = await supabase
            .from('bookings')
            .delete()
            .eq('id', bookingId);

        if (error) throw error;
    },

    // Check if the current user has an active booking RIGHT NOW
    async hasActiveBooking() {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return false;

        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('bookings')
            .select('id')
            .eq('user_id', user.id)
            .lte('start_time', now)
            .gte('end_time', now)
            .maybeSingle();

        if (error) {
            console.error("Error checking status:", error);
            return false;
        }

        return !!data;
    },

    // Get the active booking details if any
    async getActiveBooking() {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) return null;

        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('user_id', user.id)
            .lte('start_time', now)
            .gte('end_time', now)
            .maybeSingle();

        return data;
    }
};
