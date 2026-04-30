import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Navbar, Nav, Button, Card, Table, Badge, Tabs, Tab, Spinner, Alert, Dropdown, ButtonGroup } from 'react-bootstrap';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import { eventLogService } from '../services/eventLogService';

export default function EventLog() {
    const { user, logout, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [loginLogs, setLoginLogs] = useState([]);
    const [tempLogs, setTempLogs] = useState([]);
    const [bookingLogs, setBookingLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Guard: non-admins should not reach this page
    useEffect(() => {
        if (!isAdmin) {
            navigate('/dashboard', { replace: true });
        }
    }, [isAdmin, navigate]);

    const fetchLogs = async () => {
        try {
            setError(null);
            const [allLoginEvents, temps, bookings] = await Promise.all([
                eventLogService.getEventLogs(['login', 'logout'], 600),
                eventLogService.getEventLogs('temp_alert', 200),
                eventLogService.getEventLogs('booking', 200)
            ]);

            // Separate them for processSessions
            const logins = allLoginEvents.filter(e => e.event_type === 'login');
            const logouts = allLoginEvents.filter(e => e.event_type === 'logout');

            // Process sessions: pair login with logout
            const sessions = processSessions(logins, logouts);
            setLoginLogs(sessions);
            setTempLogs(temps);
            setBookingLogs(bookings);
        } catch (e) {
            console.error(e);
            setError('Failed to load event logs.');
        } finally {
            setLoading(false);
        }
    };

    const handleClearLogs = async (type) => {
        if (!window.confirm(`Are you sure you want to clear ${type === 'all' ? 'all event logs' : `the ${type} logs`}? This cannot be undone.`)) {
            return;
        }

        try {
            setLoading(true);
            if (type === 'all') {
                await eventLogService.clearLogs();
            } else if (type === 'sessions') {
                await eventLogService.clearLogs(['login', 'logout']);
            } else {
                await eventLogService.clearLogs(type);
            }
            await fetchLogs();
        } catch (e) {
            console.error('Failed to clear logs:', e);
            setError(`Failed to clear logs: ${e.message}`);
            setLoading(false);
        }
    };

    const processSessions = (logins, logouts) => {
        // Sort all chronologically
        const all = [...logins, ...logouts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const activeSessions = {}; // email -> login record
        const results = [];

        all.forEach(log => {
            if (log.event_type === 'login') {
                activeSessions[log.user_email] = log;
            } else if (log.event_type === 'logout') {
                const startLog = activeSessions[log.user_email];
                if (startLog) {
                    const durationMs = new Date(log.created_at) - new Date(startLog.created_at);
                    results.push({
                        ...startLog,
                        logout_at: log.created_at,
                        duration: formatDuration(durationMs)
                    });
                    delete activeSessions[log.user_email];
                }
            }
        });

        // Add remaining logins as "Active Now" or "Closed Tab/Expired"
        const NOW = new Date();
        Object.values(activeSessions).forEach(log => {
            const timeSinceLogin = NOW - new Date(log.created_at);
            const isStale = timeSinceLogin > 4 * 60 * 60 * 1000; // 4 hours

            results.push({
                ...log,
                logout_at: null,
                duration: isStale ? 'Closed Tab / Expired' : 'Still Active'
            });
        });

        // Sort descending by login time
        return results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    };

    const formatDuration = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;

        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
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
            day: '2-digit', month: 'short',
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
                            <Nav.Link onClick={() => navigate('/admin')}>Admin Panel</Nav.Link>
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
                    <div className="d-flex gap-2">
                        <Dropdown as={ButtonGroup}>
                            <Button variant="outline-danger" size="sm" onClick={() => handleClearLogs('all')} disabled={loading}>
                                🗑️ Clear All Logs
                            </Button>
                            <Dropdown.Toggle split variant="outline-danger" size="sm" id="dropdown-clear-logs" disabled={loading} />
                            <Dropdown.Menu>
                                <Dropdown.Item onClick={() => handleClearLogs('sessions')}>Clear Session Logs</Dropdown.Item>
                                <Dropdown.Item onClick={() => handleClearLogs('temp_alert')}>Clear Temp Alerts</Dropdown.Item>
                                <Dropdown.Item onClick={() => handleClearLogs('booking')}>Clear Bookings</Dropdown.Item>
                            </Dropdown.Menu>
                        </Dropdown>

                        <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => { setLoading(true); fetchLogs(); }}
                            disabled={loading}
                        >
                            {loading ? <Spinner size="sm" animation="border" /> : '↻ Refresh'}
                        </Button>
                    </div>
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
                                🔑 Session History{' '}
                                <Badge bg="secondary" pill>{loginLogs.length}</Badge>
                            </span>
                        }
                    >
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span className="fw-semibold">Student Session History</span>
                                <small className="text-muted">Paired Login/Logout Events</small>
                            </Card.Header>
                            <Card.Body className="p-0">
                                {loading ? (
                                    <div className="text-center py-5">
                                        <Spinner animation="border" variant="primary" />
                                        <p className="text-muted mt-3">Loading sessions...</p>
                                    </div>
                                ) : loginLogs.length === 0 ? (
                                    <div className="text-center py-5 text-muted">
                                        <p>No session events recorded yet.</p>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                        <Table striped hover responsive className="mb-0">
                                            <thead className="table-dark sticky-top">
                                                <tr>
                                                    <th>User Email</th>
                                                    <th>Login Time</th>
                                                    <th>Logout Time</th>
                                                    <th>Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loginLogs.map((log) => (
                                                    <tr key={log.id}>
                                                        <td>
                                                            <strong>{log.user_email || '—'}</strong>
                                                            {log.user_email === 'admin@student.local' &&
                                                                <Badge bg="danger" className="ms-2" style={{ fontSize: '0.6em' }}>Admin</Badge>
                                                            }
                                                        </td>
                                                        <td className="small">{formatTime(log.created_at)}</td>
                                                        <td className="small">{formatTime(log.logout_at)}</td>
                                                        <td>
                                                            <Badge bg={log.duration === 'Still Active' ? 'success' : (log.duration.includes('Expired') ? 'warning' : 'secondary')}>
                                                                {log.duration}
                                                            </Badge>
                                                        </td>
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

                    {/* ── Lab Booking Events Tab ── */}
                    <Tab
                        eventKey="booking"
                        title={
                            <span>
                                📅 Lab Bookings{' '}
                                <Badge bg="info" pill>{bookingLogs.length}</Badge>
                            </span>
                        }
                    >
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span className="fw-semibold">Student Booking History</span>
                                <small className="text-muted">Last {bookingLogs.length} events</small>
                            </Card.Header>
                            <Card.Body className="p-0">
                                {loading ? (
                                    <div className="text-center py-5">
                                        <Spinner animation="border" variant="info" />
                                        <p className="text-muted mt-3">Loading booking events...</p>
                                    </div>
                                ) : bookingLogs.length === 0 ? (
                                    <div className="text-center py-5 text-muted">
                                        <p>No lab bookings recorded yet.</p>
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                        <Table striped hover responsive className="mb-0">
                                            <thead className="table-dark sticky-top">
                                                <tr>
                                                    <th>#</th>
                                                    <th>User Email</th>
                                                    <th>Booked Time Slot</th>
                                                    <th>Logged At</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bookingLogs.map((log, idx) => {
                                                    const start = new Date(log.details?.start).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                                                    const end = new Date(log.details?.end).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                                    return (
                                                        <tr key={log.id}>
                                                            <td className="text-muted small">{idx + 1}</td>
                                                            <td>
                                                                <strong>{log.user_email || '—'}</strong>
                                                            </td>
                                                            <td>
                                                                <Badge bg="info" className="fw-normal">
                                                                    {start} - {end}
                                                                </Badge>
                                                            </td>
                                                            <td className="small text-muted">{formatTime(log.created_at)}</td>
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
