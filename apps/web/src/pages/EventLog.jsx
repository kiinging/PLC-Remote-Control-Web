import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Navbar, Nav, Button, Card, Table, Badge, Tabs, Tab, Spinner, Alert } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { eventLogService } from '../services/eventLogService';

export default function EventLog() {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [loginLogs, setLoginLogs] = useState([]);
    const [tempLogs, setTempLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Guard: non-admins should not reach this page (AdminRoute in App.jsx handles it,
    // but double-check here for safety)
    useEffect(() => {
        if (!isAdmin) {
            navigate('/dashboard', { replace: true });
        }
    }, [isAdmin, navigate]);

    const fetchLogs = async () => {
        try {
            setError(null);
            const [logins, temps] = await Promise.all([
                eventLogService.getEventLogs('login', 200),
                eventLogService.getEventLogs('temp_alert', 200)
            ]);
            setLoginLogs(logins);
            setTempLogs(temps);
        } catch (e) {
            console.error(e);
            setError('Failed to load event logs. Make sure the event_logs table exists in Supabase (check supabase_schema.sql).');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchLogs();
            const interval = setInterval(fetchLogs, 30000);
            return () => clearInterval(interval);
        }
    }, [isAdmin]);

    const formatTime = (ts) => {
        if (!ts) return '--';
        return new Date(ts).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    return (
        <>
            {/* Navbar */}
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                        PLC Web Control
                    </Navbar.Brand>
                    <Navbar.Toggle aria-controls="eventlog-navbar-nav" />
                    <Navbar.Collapse id="eventlog-navbar-nav" className="justify-content-end">
                        <Nav className="me-auto">
                            <Nav.Link onClick={() => navigate('/dashboard')}>Dashboard</Nav.Link>
                            <Nav.Link active>Event Log</Nav.Link>
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
                        <h3 className="mb-0 fw-bold">📋 Event Log</h3>
                        <small className="text-muted">Auto-refreshes every 30 seconds</small>
                    </div>
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => { setLoading(true); fetchLogs(); }}
                        disabled={loading}
                    >
                        {loading ? <Spinner size="sm" animation="border" /> : '↻ Refresh'}
                    </Button>
                </div>

                {error && (
                    <Alert variant="danger" dismissible onClose={() => setError(null)}>
                        <strong>Error:</strong> {error}
                    </Alert>
                )}

                <Tabs defaultActiveKey="login" className="mb-3" fill>
                    {/* ── Login Events Tab ── */}
                    <Tab
                        eventKey="login"
                        title={
                            <span>
                                🔑 Login Events{' '}
                                <Badge bg="secondary" pill>{loginLogs.length}</Badge>
                            </span>
                        }
                    >
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span className="fw-semibold">Student Login History</span>
                                <small className="text-muted">Last {loginLogs.length} events</small>
                            </Card.Header>
                            <Card.Body className="p-0">
                                {loading ? (
                                    <div className="text-center py-5">
                                        <Spinner animation="border" variant="primary" />
                                        <p className="text-muted mt-3">Loading login events...</p>
                                    </div>
                                ) : loginLogs.length === 0 ? (
                                    <div className="text-center py-5 text-muted">
                                        <p>No login events recorded yet.</p>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                        <Table striped hover responsive className="mb-0">
                                            <thead className="table-dark sticky-top">
                                                <tr>
                                                    <th>#</th>
                                                    <th>User Email</th>
                                                    <th>Role</th>
                                                    <th>Login Time</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loginLogs.map((log, idx) => (
                                                    <tr key={log.id}>
                                                        <td className="text-muted small">{idx + 1}</td>
                                                        <td>
                                                            <strong>{log.user_email || '—'}</strong>
                                                        </td>
                                                        <td>
                                                            {log.user_email === import.meta.env.VITE_ADMIN_EMAIL
                                                                ? <Badge bg="danger">Admin</Badge>
                                                                : <Badge bg="primary">Student</Badge>
                                                            }
                                                        </td>
                                                        <td className="small">{formatTime(log.created_at)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Tab>

                    {/* ── Temperature Alert Tab ── */}
                    <Tab
                        eventKey="temp_alert"
                        title={
                            <span>
                                🌡️ Temperature Alerts{' '}
                                <Badge bg={tempLogs.length > 0 ? 'danger' : 'secondary'} pill>
                                    {tempLogs.length}
                                </Badge>
                            </span>
                        }
                    >
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span className="fw-semibold">Experiments Exceeding 100 °C</span>
                                <small className="text-muted">Last {tempLogs.length} alerts</small>
                            </Card.Header>
                            <Card.Body className="p-0">
                                {loading ? (
                                    <div className="text-center py-5">
                                        <Spinner animation="border" variant="danger" />
                                        <p className="text-muted mt-3">Loading temperature alerts...</p>
                                    </div>
                                ) : tempLogs.length === 0 ? (
                                    <div className="text-center py-5 text-muted">
                                        <p>✅ No temperature alerts. All experiments within safe range.</p>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                        <Table striped hover responsive className="mb-0">
                                            <thead className="table-dark sticky-top">
                                                <tr>
                                                    <th>#</th>
                                                    <th>User Email</th>
                                                    <th>Temperature (°C)</th>
                                                    <th>Alert Time</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tempLogs.map((log, idx) => {
                                                    const temp = parseFloat(log.details?.temperature || 0);
                                                    return (
                                                        <tr key={log.id} className="table-danger">
                                                            <td className="text-muted small">{idx + 1}</td>
                                                            <td>
                                                                <strong>{log.user_email || '—'}</strong>
                                                            </td>
                                                            <td>
                                                                <Badge bg="danger" className="fs-6">
                                                                    🌡️ {temp.toFixed(1)} °C
                                                                </Badge>
                                                            </td>
                                                            <td className="small">{formatTime(log.created_at)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Tab>
                </Tabs>
            </Container>
        </>
    );
}
