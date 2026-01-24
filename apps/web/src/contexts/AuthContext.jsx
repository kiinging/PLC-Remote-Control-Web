import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { checkSession } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Check initial Supabase session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 2. Listen for auth changes (Login, Logout, Auto-refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Supabase Auth Event:", event, session?.user?.email);
            setUser(session?.user ?? null);
            setLoading(false);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                // Should sync with backend if needed, but for now we trust the frontend state
                // Ideally, we POST session.access_token to /api/auth/exchange here
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

