import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { checkSession, exchangeAuth } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Check initial Supabase session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.access_token && session?.user?.email) {
                try {
                    // Force sync on reload to ensure cookie is present before app renders
                    await exchangeAuth(session.access_token, session.user.email);
                    console.log("Initial session synced");
                } catch (e) {
                    console.error("Initial session sync failed", e);
                }
            }
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 2. Listen for auth changes (Login, Logout, Auto-refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Supabase Auth Event:", event, session?.user?.email);
            setUser(session?.user ?? null);
            setLoading(false);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                // Sync Supabase session with Backend Worker (sets HTTP-only cookie)
                if (session?.access_token && session?.user?.email) {
                    try {
                        await exchangeAuth(session.access_token, session.user.email);
                        console.log("Backend session synced for", session.user.email);
                    } catch (e) {
                        console.error("Failed to sync backend session", e);
                    }
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

