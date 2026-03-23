import { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Badge, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { eventLogService } from '../services/eventLogService';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function Admin() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { user, isAdmin } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAdmin) {
            navigate('/dashboard', { replace: true });
            return;
        }
        fetchUsers();
    }, [user, isAdmin, navigate]);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        console.log("Admin: Fetching users from multiple sources...");
        try {
            // Source 1: Supabase Login History (from event_logs)
            const loginLogs = await eventLogService.getEventLogs('login', 500);
            
            // Source 2: Legacy KV Users (from Backend Worker)
            let legacyUsers = [];
            try {
                const legacyData = await api.getUsers();
                legacyUsers = legacyData.users || [];
            } catch (err) {
                console.warn("Could not fetch legacy users:", err);
            }

            // --- Process Supabase Logs ---
            const supabaseMap = {};
            for (const row of loginLogs) {
                const email = row.user_email;
                if (!email) continue;
                if (!supabaseMap[email]) {
                    supabaseMap[email] = { 
                        email, 
                        lastLogin: row.created_at, 
                        loginCount: 0,
                        source: 'Supabase'
                    };
                }
                supabaseMap[email].loginCount += 1;
            }

            // --- Process Legacy Users ---
            const legacyMap = {};
            for (const username of legacyUsers) {
                const email = `${username}@student.local`;
                if (!supabaseMap[email]) {
                    legacyMap[email] = {
                        email,
                        lastLogin: null,
                        loginCount: 0,
                        source: 'Legacy KV (Not yet logged in via Supabase)'
                    };
                } else {
                    supabaseMap[email].source = 'Supabase + Legacy KV';
                }
            }

            // Combine
            const combined = [...Object.values(supabaseMap), ...Object.values(legacyMap)];

            // Sort: admin first, then by last login desc
            combined.sort((a, b) => {
                if (a.email === ADMIN_EMAIL) return -1;
                if (b.email === ADMIN_EMAIL) return 1;
                if (!a.lastLogin && b.lastLogin) return 1;
                if (a.lastLogin && !b.lastLogin) return -1;
                return new Date(b.lastLogin) - new Date(a.lastLogin);
            });

            console.log(`Admin: Found ${combined.length} total unique users`);
            setUsers(combined);
        } catch (err) {
            console.error("Admin fetch error:", err);
            setError('Failed to fetch users: ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (email) => {
        if (email === ADMIN_EMAIL) return;
        const isLegacy = email.endsWith('@student.local');
        const username = isLegacy ? email.split('@')[0] : email;

        if (!window.confirm(`Delete user "${email}"? This will remove them from Supabase (if exists) and the Legacy KV store.`)) return;

        try {
            setLoading(true);
            // 1. Always attempt Supabase delete via backend
            try {
                await api.deleteSupabaseUser(email);
            } catch (err) {
                console.warn("Supabase delete skipped or failed:", err.message);
            }

            // 2. If it's a legacy style email, also delete from KV
            if (isLegacy) {
                try {
                    await api.deleteUser(username);
                } catch (err) {
                    console.warn("Legacy KV delete failed:", err.message);
                }
            }

            setSuccess(`User ${email} and associated records removed.`);
            fetchUsers(); // Refresh list
        } catch (err) {
            setError('Failed to delete user: ' + (err.response?.data || err.message));
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (iso) => {
        if (!iso) return 'NEVER';
        return new Date(iso).toLocaleString();
    };

    const formatEmail = (email) => {
        if (email.endsWith('@student.local')) return email.split('@')[0];
        return email;
    };

    return (
        <Container className="mt-4 pb-5">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="mb-0">Admin Dashboard</h2>
                    <small className="text-muted">User Management (Supabase Auth + Legacy KV Store)</small>
                </div>
                <div className="d-flex gap-2">
                    <ThemeToggle />
                    <Button variant="outline-secondary" size="sm" onClick={fetchUsers} disabled={loading}>
                        {loading ? <Spinner animation="border" size="sm" /> : '↻ Refresh'}
                    </Button>
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
                </div>
            </div>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

            <Card className="shadow-sm">
                <Card.Header className="d-flex justify-content-between align-items-center bg-light">
                    <span as="h5" className="mb-0 fw-bold">Active User Base</span>
                    <Badge bg="dark">{users.length} users</Badge>
                </Card.Header>
                <Card.Body className="p-0">
                    {loading && users.length === 0 ? (
                        <div className="text-center py-5">
                            <Spinner animation="grow" variant="primary" />
                            <p className="mt-2 text-muted">Synchronizing user data...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-5 text-muted">
                            <p>No registered users found.</p>
                        </div>
                    ) : (
                        <Table striped bordered hover responsive className="mb-0 align-middle">
                            <thead className="table-dark">
                                <tr>
                                    <th>#</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Source</th>
                                    <th>Login Count</th>
                                    <th>Last Seen</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u, idx) => (
                                    <tr key={u.email}>
                                        <td>{idx + 1}</td>
                                        <td>
                                            <span className="fw-semibold">{formatEmail(u.email)}</span>
                                        </td>
                                        <td>
                                            {u.email === ADMIN_EMAIL
                                                ? <Badge bg="danger">Admin</Badge>
                                                : <Badge bg="primary">Student</Badge>
                                            }
                                        </td>
                                        <td>
                                            <small className="text-muted" style={{ fontSize: '0.8em' }}>{u.source || 'Supabase'}</small>
                                        </td>
                                        <td>
                                            <Badge bg="secondary">{u.loginCount}</Badge>
                                        </td>
                                        <td>
                                            <small className="text-muted">{formatDate(u.lastLogin)}</small>
                                        </td>
                                        <td>
                                            {u.email !== ADMIN_EMAIL && u.email !== user?.email && (
                                                <Button
                                                    variant="outline-danger"
                                                    size="sm"
                                                    onClick={() => handleDelete(u.email)}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                            {u.email === ADMIN_EMAIL && (
                                                <small className="text-muted">Protected</small>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    )}
                </Card.Body>
            </Card>

            <Alert variant="info" className="mt-3 small">
                <strong>Management Note:</strong> This dashboard synchronizes users from both the legacy KV store and Supabase login history.
                Deleting a user removes them from ALL identity providers. This action is permanent.
            </Alert>
        </Container>
    );
}
