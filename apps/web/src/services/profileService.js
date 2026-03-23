import { supabase } from './supabase';

export const profileService = {
    async getProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.warn("Profile fetch error:", error.message);
            return null;
        }
        return data;
    },

    async markWelcomeSeen() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('profiles')
            .update({ has_seen_welcome: true })
            .eq('id', user.id);

        if (error) {
            console.error("Error updating profile:", error.message);
        }
    },

    /**
     * Mark the second (start guide) onboarding as seen.
     */
    async markStartGuideSeen() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('profiles')
            .update({ has_seen_start_guide: true, updated_at: new Date().toISOString() })
            .eq('id', user.id);

        if (error) throw error;
    }
};
