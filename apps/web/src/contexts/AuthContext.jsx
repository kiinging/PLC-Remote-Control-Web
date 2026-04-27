import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { checkSession, exchangeAuth, logout as apiLogout } from '../services/api';
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
                console.log("Auth: Initial session found, syncing with backend...");
                try {
                    // Timeout sync after 5 seconds so app isn't stuck on white screen
                    await Promise.race([
                        exchangeAuth(session.access_token, session.user.email),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 5000))
                    ]);
                    console.log("Auth: Initial session synced");
                } catch (e) {
                    console.warn("Auth: Initial session sync failed or timed out:", e.message);
                }
            }
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 2. Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log("Supabase Auth Event:", event, session?.user?.email);
            
            // Immediately update user to keep UI responsive
            setUser(session?.user ?? null);
            setLoading(false);

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session?.access_token && session?.user?.email) {
                    // RUN IN BACKGROUND: Don't await here to keep the listener fast
                    exchangeAuth(session.access_token, session.user.email)
                        .then(() => console.log("Auth: Background session synced for", session.user.email))
                        .catch(e => console.error("Auth: Background sync failed", e.message));

                    // Log login event (also in background)
                    if (event === 'SIGNED_IN') {
                        eventLogService.logLogin(session.user.email);
                    }
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        console.log("Auth: Initiating logout...");
        try {
            // 0. Log logout event
            if (user?.email) {
                // Await logging, but with a timeout so we don't get stuck if Supabase is slow
                await Promise.race([
                    eventLogService.logLogout(user.email),
                    new Promise(resolve => setTimeout(resolve, 2000))
                ]).catch(() => {});
            }

            // 1. Fire and forget backend logout
            apiLogout().catch(e => console.warn("Auth: Backend logout skipped/failed", e.message));

            // 2. Clear Supabase Session (with a timeout to prevent hanging)
            await Promise.race([
                supabase.auth.signOut(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Signout timeout')), 3000))
            ]).catch(e => console.warn("Auth: Supabase signout warning", e.message));

        } catch (e) {
            console.error("Auth: Logout process error", e.message);
        } finally {
            // 3. Clear local state and hard redirect to login
            setUser(null);
            console.log("Auth: Redirecting to login");
            window.location.href = '/login';
        }
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
