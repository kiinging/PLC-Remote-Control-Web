import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { bookingService } from '../services/bookingService';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

export default function AutoLogout({ children }) {
    const { logout, user, isAdmin } = useAuth();
    const lastActivityTime = useRef(Date.now());

    useEffect(() => {
        // Do not apply auto-logout if no user is logged in or if user is an admin
        if (!user || isAdmin) return;

        const handleActivity = () => {
            lastActivityTime.current = Date.now();
        };

        // Listen for activity events to reset the timer
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

        // Check inactivity every minute
        const intervalId = setInterval(async () => {
            const timeSinceLastActivity = Date.now() - lastActivityTime.current;
            
            if (timeSinceLastActivity >= TIMEOUT_MS) {
                try {
                    const hasActive = await bookingService.hasActiveBooking();
                    if (!hasActive) {
                        console.log('User inactive for 30 minutes with no active booking. Logging out.');
                        alert('Your session has expired due to 30 minutes of inactivity. Please log in again.');
                        logout();
                    } else {
                        console.log('User inactive, but has active booking. Skipping auto-logout.');
                        // If they are inactive but have a booking, we don't log them out.
                        // The interval will keep checking. When the booking ends, if they are still inactive,
                        // they will be logged out on the next check.
                    }
                } catch (error) {
                    console.error("Error checking booking status for auto-logout", error);
                }
            }
        }, CHECK_INTERVAL_MS);

        return () => {
            events.forEach(event => window.removeEventListener(event, handleActivity));
            clearInterval(intervalId);
        };
    }, [user, isAdmin, logout]);

    return children;
}
