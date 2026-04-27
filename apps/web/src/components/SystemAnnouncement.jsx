import { useState, useEffect } from 'react';
import { Alert, Container } from 'react-bootstrap';
import { supabase } from '../services/supabase';

export default function SystemAnnouncement({ page = 'login' }) {
    const [announcement, setAnnouncement] = useState(null);

    useEffect(() => {
        fetchAnnouncement();
        // Subscribe to real-time changes
        const channel = supabase
            .channel('announcements')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
                fetchAnnouncement();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchAnnouncement = async () => {
        try {
            const { data, error } = await supabase
                .from('announcements')
                .select('*')
                .eq('active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            setAnnouncement(data);
        } catch (e) {
            console.error("Failed to fetch announcement:", e);
        }
    };

    if (!announcement || !announcement.content) return null;

    const type = announcement.type || 'info';
    
    // Logic: 
    // - Info (info) and Fixed/Up (success) appear on login page only.
    // - Warning (warning) and Urgent (danger) appear on both.
    if (page === 'dashboard') {
        if (type !== 'warning' && type !== 'danger') {
            return null;
        }
    }

    const getIcon = (type) => {
        switch (type) {
            case 'danger': return '🚨';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            default: return '📢';
        }
    };

    return (
        <Container className="mt-3">
            <Alert variant={type} className="shadow-sm border-0 d-flex align-items-center">
                <span className="fs-3 me-3">{getIcon(type)}</span>
                <div>
                    <strong className="d-block">System Announcement</strong>
                    {announcement.content}
                </div>
            </Alert>
        </Container>
    );
}
