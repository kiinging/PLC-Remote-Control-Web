import { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Badge, Spinner } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../services/supabase';
import { api } from '../services/api';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function Admin() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        fetchUsers();
    }, [user]);

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        try {
            // Derive user list from event_logs: get distinct emails + last login + login count
            const { data, error } = await supabase
                .from('event_logs')
                .select('user_email, event_type, created_at')
                .eq('event_type', 'login')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Aggregate per email: last login, login count
            const map = {};
            for (const row of data || []) {
                const email = row.user_email;
                if (!email) continue;
                if (!map[email]) {
                    map[email] = { email, lastLogin: row.created_at, loginCount: 0 };
                }
                map[email].loginCount += 1;
                // Since sorted desc, first occurrence = most recent
                if (row.created_at > map[email].lastLogin) {
                    map[email].lastLogin = row.created_at;
                }
            }

            // Sort: admin first, then by last login desc
            const list = Object.values(map).sort((a, b) => {
                if (a.email === ADMIN_EMAIL) return -1;
                if (b.email === ADMIN_EMAIL) return 1;
                return new Date(b.lastLogin) - new Date(a.lastLogin);
            });

            setUsers(list);
        } catch (err) {
            setError('Failed to fetch users: ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (email) => {
        if (email === ADMIN_EMAIL) return;
        if (!window.confirm(`Delete user "${email}" from Supabase? This cannot be undone.`)) return;
        try {
            await api.post('/api/admin/delete-user', { email });
            setSuccess(`User ${email} deleted.`);
            setUsers(prev => prev.filter(u => u.email !== email));
        } catch (err) {
            setError('Failed to delete user: ' + (err.response?.data || err.message));
        }
    };

    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString();
    };

    const formatEmail = (email) => {
        if (email.endsWith('@student.local')) return email.split('@')[0];
        return email;
    };

    return (
        <Container className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="mb-0">Admin Dashboard</h2>
                    <small className="text-muted">Supabase registered users (via login history)</small>
                </div>
                <div className="d-flex gap-2">
                    <ThemeToggle />
                    <Button variant="outline-secondary" size="sm" onClick={fetchUsers} disabled={loading}>
                        {loading ? <Spinner size="sm" /> : '↻ Refresh'}
                    </Button>
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
                </div>
            </div>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

            <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                    <span as="h5" className="mb-0 fw-semibold">User Management</span>
                    <Badge bg="secondary">{users.length} users</Badge>
                </Card.Header>
                <Card.Body className="p-0">
                    {loading ? (
                        <div className="text-center py-5">
                            <Spinner animation="border" />
                            <p className="mt-2 text-muted">Loading users...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-5 text-muted">
                            <p>No users have logged in yet.</p>
                        </div>
                    ) : (
                        <Table striped bordered hover responsive className="mb-0">
                            <thead className="table-dark">
                                <tr>
                                    <th>#</th>
                                    <th>Email</th>
                                    <th>Role</th>
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
                <strong>Note:</strong> This list shows all users who have logged in at least once.
                Deleting a user removes them from Supabase authentication and their login history from this view.
            </Alert>
        </Container>
    );
}
