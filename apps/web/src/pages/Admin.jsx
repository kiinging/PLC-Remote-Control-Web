import { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Badge, Spinner, Navbar, Nav } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { eventLogService } from '../services/eventLogService';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

export default function Admin() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { user, logout, isAdmin } = useAuth();
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
        try {
            // Fetch Supabase Login History
            const loginLogs = await eventLogService.getEventLogs('login', 500);
            
            // Aggregation logic (only Supabase)
            const map = {};
            for (const row of loginLogs) {
                const email = row.user_email;
                if (!email) continue;
                if (!map[email]) {
                    map[email] = { 
                        email, 
                        lastLogin: row.created_at, 
                        loginCount: 0 
                    };
                }
                map[email].loginCount += 1;
            }

            const list = Object.values(map).sort((a, b) => {
                if (a.email === ADMIN_EMAIL) return -1;
                if (b.email === ADMIN_EMAIL) return 1;
                return new Date(b.lastLogin) - new Date(a.lastLogin);
            });

            setUsers(list);
        } catch (err) {
            console.error("Admin fetch error:", err);
            setError('Failed to fetch users. Ensure the event_logs table exists (check supabase_schema.sql). ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (email) => {
        if (email === ADMIN_EMAIL) return;
        if (!window.confirm(`Delete user "${email}" from Supabase? This will remove their login history.`)) return;

        try {
            setLoading(true);
            await api.deleteSupabaseUser(email);
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
        <>
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                        PLC Web Control
                    </Navbar.Brand>
                    <Navbar.Toggle aria-controls="admin-navbar-nav" />
                    <Navbar.Collapse id="admin-navbar-nav" className="justify-content-end">
                        <Nav className="me-auto">
                            <Nav.Link onClick={() => navigate('/dashboard')}>Dashboard</Nav.Link>
                            <Nav.Link onClick={() => navigate('/event-log')}>Event Log</Nav.Link>
                            <Nav.Link active>Admin Panel</Nav.Link>
                        </Nav>
                        <ThemeToggle className="me-3" />
                        <Navbar.Text className="me-3">
                            Signed in as: <strong>{user?.email?.split('@')[0]}</strong>{' '}
                            <Badge bg="danger" style={{ fontSize: '0.65em' }}>Admin</Badge>
                        </Navbar.Text>
                        <Button variant="outline-light" size="sm" onClick={logout}>Logout</Button>
                    </Navbar.Collapse>
                </Container>
            </Navbar>

            <Container className="pb-5">
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h3 className="mb-0 fw-bold">🛠️ Admin Dashboard</h3>
                        <small className="text-muted">User session history and management (Supabase)</small>
                    </div>
                    <Button variant="outline-secondary" size="sm" onClick={fetchUsers} disabled={loading}>
                        {loading ? <Spinner animation="border" size="sm" /> : '↻ Refresh Data'}
                    </Button>
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
                                <p className="mt-2 text-muted">Refreshing user activity...</p>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="text-center py-5 text-muted">
                                <i className="bi bi-people fs-1 d-block mb-3"></i>
                                <p className="mb-1">No active users discovered yet.</p>
                                <small>Users will appear here after they log in to the system at least once.</small>
                            </div>
                        ) : (
                            <Table striped bordered hover responsive className="mb-0 align-middle">
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
                    <strong>Note:</strong> This dashboard shows users who have logged in via the Supabase Auth system. 
                    Deleting a user here removes their account from Supabase and clears their session history.
                </Alert>
            </Container>
        </>
    );
}
