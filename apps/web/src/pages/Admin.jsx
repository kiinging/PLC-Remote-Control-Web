import { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Badge, Spinner, Navbar, Nav } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { eventLogService } from '../services/eventLogService';

const ADMIN_EMAILS = ['admin@student.local', 'wongkiinging@gmail.com'];
export default function Admin() {
    const [users, setUsers] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Announcement States
    const [announcementMsg, setAnnouncementMsg] = useState('');
    const [announcementType, setAnnouncementType] = useState('info');
    const [isAnnouncementActive, setIsAnnouncementActive] = useState(false);

    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAdmin) {
            navigate('/dashboard', { replace: true });
            return;
        }
        fetchUsers();
        fetchSubmissions();
        fetchCurrentAnnouncement();
    }, [user, isAdmin, navigate]);

    const fetchCurrentAnnouncement = async () => {
        try {
            const { data } = await supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (data) {
                setAnnouncementMsg(data.content);
                setAnnouncementType(data.type);
                setIsAnnouncementActive(data.active);
            }
        } catch (e) {
            console.error("Failed to fetch current announcement:", e);
        }
    };

    const handlePublishAnnouncement = async () => {
        if (!announcementMsg.trim()) return;
        try {
            setLoading(true);
            // Deactivate old ones first
            await supabase.from('announcements').update({ active: false }).eq('active', true);

            const { error } = await supabase.from('announcements').insert([{
                content: announcementMsg,
                type: announcementType,
                active: true
            }]);
            if (error) throw error;
            setIsAnnouncementActive(true);
            setSuccess("Announcement published live!");
        } catch (err) {
            setError("Failed to publish: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClearAnnouncement = async () => {
        try {
            setLoading(true);
            const { error } = await supabase.from('announcements').update({ active: false }).eq('active', true);
            if (error) throw error;
            setIsAnnouncementActive(false);
            setSuccess("Announcement cleared.");
        } catch (err) {
            setError("Failed to clear: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch Supabase Event History
            const [loginLogs, bookingLogs] = await Promise.all([
                eventLogService.getEventLogs('login', 1000),
                eventLogService.getEventLogs('booking', 1000)
            ]);

            // Aggregation logic
            const map = {};

            // Process Logins
            for (const row of loginLogs) {
                const email = row.user_email;
                if (!email) continue;
                if (!map[email]) {
                    map[email] = {
                        email,
                        lastLogin: row.created_at,
                        loginCount: 0,
                        bookingCount: 0,
                        lastBooking: null
                    };
                }
                map[email].loginCount += 1;
            }

            // Process Bookings
            for (const row of bookingLogs) {
                const email = row.user_email;
                if (!email) continue;
                if (!map[email]) {
                    map[email] = {
                        email,
                        lastLogin: null,
                        loginCount: 0,
                        bookingCount: 0,
                        lastBooking: row.details?.start
                    };
                }
                map[email].bookingCount += 1;
                // Track most recent booking start time
                if (!map[email].lastBooking || new Date(row.details?.start) > new Date(map[email].lastBooking)) {
                    map[email].lastBooking = row.details?.start;
                }
            }

            const list = Object.values(map).sort((a, b) => {
                if (ADMIN_EMAILS.includes(a.email)) return -1;
                if (ADMIN_EMAILS.includes(b.email)) return 1;
                const dateA = a.lastLogin ? new Date(a.lastLogin) : new Date(0);
                const dateB = b.lastLogin ? new Date(b.lastLogin) : new Date(0);
                return dateB - dateA;
            });

            setUsers(list);
        } catch (err) {
            console.error("Admin fetch error:", err);
            setError('Failed to fetch users. Ensure the event_logs table exists (check supabase_schema.sql). ' + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    const fetchSubmissions = async () => {
        setLoadingSubmissions(true);
        try {
            const { data, error } = await supabase
                .from('lab_submissions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSubmissions(data || []);
        } catch (err) {
            console.error("Submissions fetch error:", err);
        } finally {
            setLoadingSubmissions(false);
        }
    };

    const deleteSubmission = async (id) => {
        if (!window.confirm("Delete this submission permanently?")) return;
        try {
            const { error } = await supabase.from('lab_submissions').delete().eq('id', id);
            if (error) throw error;
            setSubmissions(submissions.filter(s => s.id !== id));
            setSuccess("Submission deleted.");
        } catch (err) {
            setError("Failed to delete submission: " + err.message);
        }
    };

    const handleDelete = async (email) => {
        if (ADMIN_EMAILS.includes(email)) return;
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

                {/* System Announcement Manager */}
                <Card className="shadow-sm mb-5 border-warning">
                    <Card.Header className="bg-warning bg-opacity-10 fw-bold d-flex justify-content-between align-items-center">
                        <span>📢 Live System Announcement</span>
                        {isAnnouncementActive && <Badge bg="success">LIVE NOW</Badge>}
                    </Card.Header>
                    <Card.Body>
                        <div className="mb-3">
                            <label className="form-label small fw-bold">Message Content</label>
                            <textarea
                                className="form-control"
                                rows="2"
                                placeholder="Enter urgent message for all users..."
                                value={announcementMsg}
                                onChange={(e) => setAnnouncementMsg(e.target.value)}
                            ></textarea>
                        </div>
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                            <div className="d-flex align-items-center gap-2">
                                <label className="small fw-bold mb-0">Type:</label>
                                <select
                                    className="form-select form-select-sm w-auto"
                                    value={announcementType}
                                    onChange={(e) => setAnnouncementType(e.target.value)}
                                >
                                    <option value="info">Info (Blue)</option>
                                    <option value="warning">Warning (Yellow)</option>
                                    <option value="danger">Urgent/Down (Red)</option>
                                    <option value="success">Fixed/Up (Green)</option>
                                </select>
                            </div>
                            <div className="d-flex gap-2">
                                <Button
                                    variant="warning"
                                    size="sm"
                                    onClick={handlePublishAnnouncement}
                                    disabled={loading || !announcementMsg.trim()}
                                >
                                    🚀 Publish Live
                                </Button>
                                <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    onClick={handleClearAnnouncement}
                                    disabled={loading || !isAnnouncementActive}
                                >
                                    🛑 Clear Message
                                </Button>
                            </div>
                        </div>
                    </Card.Body>
                </Card>

                <Card className="shadow-sm">
                    <Card.Header className="d-flex justify-content-between align-items-center bg-body-tertiary">
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
                                        <th>Bookings</th>
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
                                                {ADMIN_EMAILS.includes(u.email)
                                                    ? <Badge bg="danger">Admin</Badge>
                                                    : <Badge bg="primary">Student</Badge>
                                                }
                                            </td>
                                            <td>
                                                <Badge bg="secondary">{u.loginCount}</Badge>
                                            </td>
                                            <td>
                                                {u.bookingCount > 0 ? (
                                                    <div className="d-flex flex-column">
                                                        <Badge bg="info" className="w-fit">{u.bookingCount}</Badge>
                                                        <small className="text-muted mt-1" style={{ fontSize: '0.75em' }}>
                                                            Next/Last: {new Date(u.lastBooking).toLocaleDateString()}
                                                        </small>
                                                    </div>
                                                ) : (
                                                    <small className="text-muted">None</small>
                                                )}
                                            </td>
                                            <td>
                                                <small className="text-muted">{formatDate(u.lastLogin)}</small>
                                            </td>
                                            <td>
                                                {!ADMIN_EMAILS.includes(u.email) && u.email !== user?.email && (
                                                    <Button
                                                        variant="outline-danger"
                                                        size="sm"
                                                        onClick={() => handleDelete(u.email)}
                                                    >
                                                        Delete
                                                    </Button>
                                                )}
                                                {ADMIN_EMAILS.includes(u.email) && (
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

                <hr className="my-5" />

                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h3 className="mb-0 fw-bold">📝 Lab 4 Submissions</h3>
                        <small className="text-muted">Student results submitted from the login page</small>
                    </div>
                    <Button variant="outline-primary" size="sm" onClick={fetchSubmissions} disabled={loadingSubmissions}>
                        {loadingSubmissions ? <Spinner animation="border" size="sm" /> : '↻ Refresh Submissions'}
                    </Button>
                </div>

                <Card className="shadow-sm border-primary">
                    <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                        <span className="mb-0 fw-bold">Recent Submissions</span>
                        <Badge bg="light" text="dark">{submissions.length} reports</Badge>
                    </Card.Header>
                    <Card.Body className="p-0">
                        {loadingSubmissions && submissions.length === 0 ? (
                            <div className="text-center py-5">
                                <Spinner animation="border" variant="primary" />
                                <p className="mt-2 text-muted">Loading submissions...</p>
                            </div>
                        ) : submissions.length === 0 ? (
                            <div className="text-center py-5 text-muted">
                                <p className="mb-0">No submissions found yet.</p>
                            </div>
                        ) : (
                            <Table striped bordered hover responsive className="mb-0 align-middle small">
                                <thead className="table-light">
                                    <tr>
                                        <th>Date</th>
                                        <th>Student</th>
                                        <th>ID</th>
                                        <th>Report</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {submissions.map((s) => (
                                        <tr key={s.id}>
                                            <td>{new Date(s.created_at).toLocaleDateString()}</td>
                                            <td className="fw-bold">{s.student_name}</td>
                                            <td>{s.student_id}</td>
                                            <td>
                                                {s.file_url ? (
                                                    <Button
                                                        variant="outline-success"
                                                        size="sm"
                                                        href={s.file_url}
                                                        target="_blank"
                                                        className="py-0 px-2"
                                                        style={{ fontSize: '0.75rem' }}
                                                    >
                                                        📄 View
                                                    </Button>
                                                ) : (
                                                    <small className="text-muted">None</small>
                                                )}
                                            </td>
                                            <td>
                                                <Button
                                                    variant="link"
                                                    className="text-danger p-0"
                                                    onClick={() => deleteSubmission(s.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        )}
                    </Card.Body>
                </Card>
            </Container>
        </>
    );
}
