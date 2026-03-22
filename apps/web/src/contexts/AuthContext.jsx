import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { checkSession, exchangeAuth } from '../services/api';
import { eventLogService } from '../services/eventLogService';

const AuthContext = createContext(null);

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const isAdmin = user?.email === ADMIN_EMAIL;

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
                // Log login event to event_logs table
                if (event === 'SIGNED_IN' && session?.user?.email) {
                    await eventLogService.logLogin(session.user.email);
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
    };

    const getUsername = (email) => {
        if (!email) return '';
        if (email.endsWith('@student.local')) {
            return email.split('@')[0];
        }
        return email; // Return full email for others (like admin)
    };

    const userDisplay = getUsername(user?.email);

    return (
        <AuthContext.Provider value={{ user, userDisplay, logout, loading, isAdmin }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
