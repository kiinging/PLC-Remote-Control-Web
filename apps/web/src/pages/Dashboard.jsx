import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Form, Badge, Alert, InputGroup, Navbar, Nav } from 'react-bootstrap';
import TrendChart from '../components/TrendChart';
import ThemeToggle from '../components/ThemeToggle';
import { bookingService } from '../services/bookingService';
import * as api from '../services/api';

export default function Dashboard() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // Status States
    const [relay, setRelay] = useState(false);
    const [relayStatus, setRelayStatus] = useState('offline'); // offline, booting, alive
    const [temp, setTemp] = useState('--');
    const [lastUpdate, setLastUpdate] = useState('--');

    // Gateway Status
    const [gatewayStatus, setGatewayStatus] = useState('offline'); // offline | alive
    const [gatewayTimestamp, setGatewayTimestamp] = useState('--');
    const lastGatewaySeenRef = useRef(0);

    // Camera Status
    const [cameraStatus, setCameraStatus] = useState('offline'); // offline | degraded | alive
    const [cameraTimestamp, setCameraTimestamp] = useState('--');
    const lastCameraSeenRef = useRef(0);

    // Control States
    const [controlStatus, setControlStatus] = useState({ light: 0, web: 0, plc: 0, mode: -1 });
    const [pidParams, setPidParams] = useState({ pb: 0, ti: 0, td: 0 });
    const [setpoint, setSetpoint] = useState(0);
    const [manualMV, setManualMV] = useState(0);
    const [realMV, setRealMV] = useState(0); // ✅ Real MV from PLC
    const [setpointOut, setSetpointOut] = useState(0); // ✅ PLC confirmed setpoint (HR111-112)

    const [mvPending, setMvPending] = useState(false);
    const [webPending, setWebPending] = useState(false);
    const [plcPending, setPlcPending] = useState(false); // ✅ PLC Pending State

    // Tune States
    const [tuneStatus, setTuneStatus] = useState({ tuning_active: false, tune_completed: false });
    const [tuneResults, setTuneResults] = useState({ pb: 0, ti: 0, td: 0 });

    // Chart Data
    const [chartData, setChartData] = useState([]);
    const [chartWindow, setChartWindow] = useState(30); // Minutes to display

    // Review States
    const [review, setReview] = useState("");
    const [rating, setRating] = useState(5);
    const [recentReviews, setRecentReviews] = useState([]);
    const [reviewMsg, setReviewMsg] = useState({ type: '', text: '' });

    // Video
    const [videoSrc, setVideoSrc] = useState('/api/video_feed');

    // Auto-reload video when camera comes online
    useEffect(() => {
        if (cameraStatus === 'alive') {
            setVideoSrc(`/api/video_feed?t=${Date.now()}`);
        }
    }, [cameraStatus]);

    // Load Initial Data
    useEffect(() => {
        fetchInitialData();
        const interval = setInterval(optionsPoll, 1000); // 1s polling
        return () => clearInterval(interval);
    }, []);

    const fetchInitialData = async () => {
        try {
            const cStatus = await api.getControlStatus();
            setControlStatus(cStatus);
        } catch (e) {
            console.warn("Control status unavailable", e);
        }

        try {
            const mv = await api.api.get('/api/mv_manual_status').then(r => r.data);
            setManualMV(mv.mv_manual);
        } catch (e) {
            console.warn("Manual MV unavailable", e);
        }

        try {
            refreshRelay();
        } catch (e) {
            console.warn("Relay status unavailable", e);
        }

        try {
            const history = await api.api.get('/api/trend?limit=3600').then(r => r.data);
            if (Array.isArray(history)) {
                setChartData(history);
            }
        } catch (e) {
            console.warn("Trend history unavailable", e);
        }

        try {
            const reviews = await api.getReviews();
            setRecentReviews(reviews);
        } catch (e) {
            console.warn("Reviews unavailable", e);
        }
    };

    const pollGatewayHeartbeat = async () => {
        try {
            const heartbeat = await api.getGatewayHeartbeat();
            lastGatewaySeenRef.current = Date.now();
            if (gatewayStatus !== 'alive') {
                setGatewayStatus('alive');
            }
            if (heartbeat.timestamp) {
                setGatewayTimestamp(heartbeat.timestamp);
            }
        } catch (e) {}

        if (lastGatewaySeenRef.current !== 0 && Date.now() - lastGatewaySeenRef.current > 5000) {
            setGatewayStatus('offline');
        }
    };

    const pollCameraHealth = async () => {
        try {
            const health = await api.getCameraHealth();
            if (health.status !== 'alive') {
                setCameraStatus('offline');
                return;
            }
            lastCameraSeenRef.current = Date.now();
            if (!health.has_frame || (health.frame_age_sec != null && health.frame_age_sec > 5)) {
                setCameraStatus('degraded');
            } else {
                setCameraStatus('alive');
            }
            if (health.ts) {
                setCameraTimestamp(health.ts);
            }
        } catch (e) {}

        if (lastCameraSeenRef.current !== 0 && Date.now() - lastCameraSeenRef.current > 5000) {
            setCameraStatus('offline');
        }
    };

    const optionsPoll = async () => {
        let tData = null;
        let cStatus = null;

        try { await pollGatewayHeartbeat(); } catch (e) {}
        try { await pollCameraHealth(); } catch (e) {}
        try { refreshRelay(); } catch (e) {}

        try {
            tData = await api.getTemp();
            setTemp(tData.rtd_temp);
            setLastUpdate(tData.last_update);
        } catch (e) {}

        try {
            cStatus = await api.getControlStatus();
            setControlStatus(cStatus);
            if (cStatus.mv !== undefined) setRealMV(cStatus.mv);
            if (cStatus.setpoint_out !== undefined) setSetpointOut(cStatus.setpoint_out);
        } catch (e) {}

        try {
            if (cStatus && cStatus.mode === 2) {
                const tStatus = await api.getTuneStatus();
                setTuneStatus(tStatus);
            }
        } catch (e) {}

        if (tData) {
            const now = new Date().toLocaleTimeString();
            setChartData(prev => {
                const newItem = {
                    time: now,
                    pv: tData.rtd_temp,
                    sp: cStatus?.setpoint_out ?? setpointOut,
                    mv: cStatus?.mv ?? manualMV
                };
                const newData = [...prev, newItem];
                if (newData.length > 3600) newData.shift();
                return newData;
            });
        }
    };

    const [esp32Alive, setEsp32Alive] = useState(false);
    const [esp32LastSeen, setEsp32LastSeen] = useState('--');

    const refreshRelay = async () => {
        try {
            const r = await api.getRelayStatus();
            setEsp32Alive(r.alive);
            setEsp32LastSeen(r.last_seen_s);
            if (r.alive) {
                setRelayStatus('alive');
                setRelay(r.relay === true);
            } else {
                setRelayStatus('offline');
                setRelay(false);
            }
            if (!videoSrc) setVideoSrc(`/api/video_feed?t=${Date.now()}`);
        } catch (e) {
            setEsp32Alive(false);
            setRelayStatus('offline');
        }
    };

    const handleRelayToggle = async (state) => {
        setRelay(state);
        try {
            await api.setRelay(state);
        } catch (e) {
            refreshRelay();
        }
    };

    const toggleProcess = async (type, action) => {
        if (type === 'web') {
            setWebPending(true);
            try {
                if (action === 'start') await api.startProcess(type);
                else await api.stopProcess(type);
            } catch (e) {
                setWebPending(false);
            }
        } else if (type === 'plc') {
            setPlcPending(true);
            try {
                if (action === 'start') await api.startProcess(type);
                else await api.stopProcess(type);
            } catch (e) {
                setPlcPending(false);
            }
        } else {
            if (action === 'start') await api.startProcess(type);
            else await api.stopProcess(type);
        }
    };

    const changeMode = async (mode) => {
        await api.setMode(mode);
    };

    const sendPid = async () => {
        await api.setPidParams(pidParams);
    };

    const sendSetpoint = async () => {
        if (isReadOnly) return;
        await api.setSetpoint(setpoint);
    };

    const sendManualMV = async () => {
        if (isReadOnly) return;
        setMvPending(true);
        await api.setManualMV(manualMV);
    };

    const handleStartTune = async () => {
        if (isReadOnly) return;
        await api.startTune();
    };

    const handleStopTune = async () => {
        if (isReadOnly) return;
        await api.stopTune();
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!review.trim()) return;
        setReviewMsg({ type: 'info', text: 'Submitting...' });
        try {
            await api.submitReview({
                name: user?.username || user?.email?.split('@')[0] || 'User',
                rating: rating,
                comment: review
            });
            setReviewMsg({ type: 'success', text: 'Review submitted successfully!' });
            setReview("");
            setRating(5);
            // Refresh list
            const updated = await api.getReviews();
            setRecentReviews(updated);
            setTimeout(() => setReviewMsg({ type: '', text: '' }), 5000);
        } catch (e) {
            setReviewMsg({ type: 'danger', text: 'Failed to submit review. Try again later.' });
        }
    };

    useEffect(() => {
        if (webPending && controlStatus.web_ack) setWebPending(false);
        if (plcPending && controlStatus.plc_ack) setPlcPending(false);
        if (mvPending && controlStatus.mv_ack) setMvPending(false);
    }, [controlStatus, webPending, mvPending, plcPending]);

    const handleExpand = () => setChartWindow(prev => Math.min(prev + 10, 60));
    const handleContract = () => setChartWindow(prev => Math.max(prev - 10, 10));
    const handleClearChart = () => {
        if (window.confirm("Are you sure you want to clear the chart history?")) setChartData([]);
    };

    const handleDownloadCSV = () => {
        if (chartData.length === 0) return;
        const headers = ["Time,PV(degC),SP(degC),MV(%)"];
        const rows = chartData.map(d => `${d.time},${d.pv},${d.sp},${d.mv}`);
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `trend_data_${new Date().toISOString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getVisibleData = () => {
        const pointsToShow = chartWindow * 60;
        return chartData.slice(-pointsToShow);
    };

    const getModeName = (m) => ['Manual', 'Auto', 'Tune'][m] || 'Unknown';
    const getModeColor = (m) => ['danger', 'success', 'warning'][m] || 'secondary';

    const [isReadOnly, setIsReadOnly] = useState(true);
    const [bookingChecked, setBookingChecked] = useState(false);

    const checkAccess = async () => {
        if (user?.username === 'admin') {
            setIsReadOnly(false);
            setBookingChecked(true);
            return;
        }
        try {
            const hasBooking = await bookingService.hasActiveBooking();
            setIsReadOnly(!hasBooking);
        } catch (e) {
            setIsReadOnly(true);
        } finally {
            setBookingChecked(true);
        }
    };

    useEffect(() => {
        checkAccess();
        const interval = setInterval(checkAccess, 60000);
        return () => clearInterval(interval);
    }, [user]);

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand>PLC Web Control</Navbar.Brand>
                    <Navbar.Toggle aria-controls="dashboard-navbar-nav" />
                    <Navbar.Collapse id="dashboard-navbar-nav" className="justify-content-end">
                        <Nav className="me-auto">
                            <Nav.Link onClick={() => navigate('/booking')}>Book Lab</Nav.Link>
                        </Nav>
                        <ThemeToggle className="me-3" />
                        <Navbar.Text className="me-3">
                            Signed in as: <a href="#login">{user?.username || user?.email?.split('@')[0] || 'User'}</a>
                        </Navbar.Text>
                        {user?.username === 'admin' && (
                            <Button variant="outline-warning" size="sm" className="me-2" onClick={() => navigate('/admin')}>
                                Admin Panel
                            </Button>
                        )}
                        <Button variant="outline-light" size="sm" onClick={logout}>Logout</Button>
                    </Navbar.Collapse>
                </Container>
            </Navbar>

            <Container>
                {bookingChecked && isReadOnly && (
                    <Alert variant="warning" className="d-flex justify-content-between align-items-center">
                        <div>
                            <strong>Read-Only Mode:</strong> You do not have an active booking for this time slot.
                            Controls are disabled.
                        </div>
                        <Button variant="outline-dark" size="sm" onClick={() => navigate('/booking')}>Book Now</Button>
                    </Alert>
                )}

                <Row className="g-4">
                    <Col lg={6}>
                        <Card className="mb-3">
                            <Card.Header>Control Panel</Card.Header>
                            <Card.Body>
                                <div className="mb-3 pb-3 border-bottom">
                                    <div className="d-flex align-items-center flex-wrap gap-2">
                                        <strong className="me-2">System Status</strong>
                                        <Badge bg={gatewayStatus === 'alive' ? 'success' : 'danger'}>Gateway: {gatewayStatus.toUpperCase()}</Badge>
                                        <Badge bg={cameraStatus === 'alive' ? 'success' : cameraStatus === 'degraded' ? 'warning' : 'danger'}>Camera: {cameraStatus.toUpperCase()}</Badge>
                                        <Badge bg={controlStatus.plc_alive ? 'success' : 'danger'}>PLC: {controlStatus.plc_alive ? 'ALIVE' : 'OFFLINE'}</Badge>
                                    </div>
                                    <div className="d-flex gap-3 align-items-center mt-1">
                                        {gatewayTimestamp && gatewayTimestamp !== '--' && <small className="text-muted" style={{ fontSize: '0.7em' }}>GW Last: {new Date(gatewayTimestamp * 1000).toLocaleTimeString()}</small>}
                                        {cameraTimestamp && cameraTimestamp !== '--' && <small className="text-muted" style={{ fontSize: '0.7em' }}>Cam Last: {new Date(cameraTimestamp * 1000).toLocaleTimeString()}</small>}
                                        {controlStatus.plc_last_seen && <small className="text-muted" style={{ fontSize: '0.7em' }}>PLC Last: {new Date(controlStatus.plc_last_seen * 1000).toLocaleTimeString()}</small>}
                                    </div>
                                    <div className="mt-3 mb-2">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div className="d-flex align-items-center">
                                                <strong className="me-2">Process Power</strong>
                                                <Badge bg={esp32Alive ? 'success' : 'secondary'}>{esp32Alive ? 'ESP32: ALIVE' : 'ESP32: OFFLINE'}</Badge>
                                            </div>
                                            <div className="d-flex align-items-center">
                                                <Badge bg={relay ? 'success' : 'secondary'} className="me-2">{relay ? 'ON' : 'OFF'}</Badge>
                                                <Button variant="success" size="sm" className="me-1" onClick={() => handleRelayToggle(true)} disabled={relay || !esp32Alive || isReadOnly}>Start</Button>
                                                <Button variant="danger" size="sm" onClick={() => handleRelayToggle(false)} disabled={!relay || !esp32Alive || isReadOnly}>Stop</Button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <strong>Light Control</strong>
                                    <div>
                                        <Badge bg={controlStatus.light ? 'success' : 'secondary'} className="me-2">{controlStatus.light ? 'ON' : 'OFF'}</Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('light', 'start')} disabled={!!controlStatus.light || isReadOnly}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('light', 'stop')} disabled={!controlStatus.light || isReadOnly}>Stop</Button>
                                    </div>
                                </div>

                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <strong>Web Control {webPending && <span className="ms-2 spinner-border spinner-border-sm text-primary" />}</strong>
                                    <div>
                                        <Badge bg={controlStatus.web ? 'success' : 'secondary'} className="me-2">{controlStatus.web ? 'ON' : 'OFF'}</Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('web', 'start')} disabled={!!controlStatus.web || isReadOnly || webPending}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('web', 'stop')} disabled={!controlStatus.web || isReadOnly || webPending}>Stop</Button>
                                    </div>
                                </div>

                                <hr />
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <strong>Mode: <Badge bg={getModeColor(controlStatus.mode)}>{getModeName(controlStatus.mode)}</Badge></strong>
                                    <div>
                                        <Button variant="danger" size="sm" className="me-1" onClick={() => changeMode('manual')} disabled={isReadOnly}>Manual</Button>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => changeMode('auto')} disabled={isReadOnly}>Auto</Button>
                                        <Button variant="warning" size="sm" onClick={() => changeMode('tune')} disabled={isReadOnly}>Tune</Button>
                                    </div>
                                </div>

                                {controlStatus.mode === 1 && (
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>PID Control</h6>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>Setpoint</InputGroup.Text>
                                            <Form.Control type="number" value={setpoint} onChange={e => setSetpoint(e.target.value)} disabled={isReadOnly} />
                                            <Button onClick={sendSetpoint} disabled={isReadOnly}>Send</Button>
                                        </InputGroup>
                                        <InputGroup size="sm">
                                            <InputGroup.Text>PB</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.pb} onChange={e => setPidParams({ ...pidParams, pb: e.target.value })} disabled={isReadOnly} />
                                            <InputGroup.Text>Ti</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.ti} onChange={e => setPidParams({ ...pidParams, ti: e.target.value })} disabled={isReadOnly} />
                                            <InputGroup.Text>Td</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.td} onChange={e => setPidParams({ ...pidParams, td: e.target.value })} disabled={isReadOnly} />
                                            <Button onClick={sendPid} disabled={isReadOnly}>Send</Button>
                                        </InputGroup>
                                        <hr className="my-2" />
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span>Auto Control {plcPending && <span className="spinner-border spinner-border-sm ms-2 text-primary" />}</span>
                                            <div>
                                                <Badge bg={controlStatus.plc ? 'success' : 'secondary'} className="me-2">{controlStatus.plc ? 'ON' : 'OFF'}</Badge>
                                                <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('plc', 'start')} disabled={!!controlStatus.plc || isReadOnly || plcPending}>Start</Button>
                                                <Button variant="danger" size="sm" onClick={() => toggleProcess('plc', 'stop')} disabled={!controlStatus.plc || isReadOnly || plcPending}>Stop</Button>
                                            </div>
                                        </div>
                                        <div className="small mt-2">
                                            <strong>Active:</strong> PB: {Number(controlStatus.pid_pb_out || 0).toFixed(1)}, Ti: {Number(controlStatus.pid_ti_out || 0).toFixed(1)}, Td: {Number(controlStatus.pid_td_out || 0).toFixed(1)}
                                        </div>
                                    </div>
                                )}

                                {controlStatus.mode === 0 && (
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>Manual Control</h6>
                                        <InputGroup size="sm">
                                            <InputGroup.Text>MV (%)</InputGroup.Text>
                                            <Form.Control type="number" value={manualMV} onChange={e => setManualMV(e.target.value)} disabled={isReadOnly || mvPending} />
                                            <Button onClick={sendManualMV} disabled={isReadOnly || mvPending}>{mvPending ? <span className="spinner-border spinner-border-sm" /> : 'Send'}</Button>
                                        </InputGroup>
                                        <hr className="my-2" />
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span>Manual Control {plcPending && <span className="spinner-border spinner-border-sm ms-2 text-primary" />}</span>
                                            <div>
                                                <Badge bg={controlStatus.plc ? 'success' : 'secondary'} className="me-2">{controlStatus.plc ? 'ON' : 'OFF'}</Badge>
                                                <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('plc', 'start')} disabled={!!controlStatus.plc || isReadOnly || plcPending}>Start</Button>
                                                <Button variant="danger" size="sm" onClick={() => toggleProcess('plc', 'stop')} disabled={!controlStatus.plc || isReadOnly || plcPending}>Stop</Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {controlStatus.mode === 2 && (
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>PID Control</h6>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>Setpoint</InputGroup.Text>
                                            <Form.Control type="number" value={setpoint} onChange={e => setSetpoint(e.target.value)} disabled={isReadOnly} />
                                            <Button onClick={sendSetpoint} disabled={isReadOnly}>Send</Button>
                                        </InputGroup>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>PB</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.pb} onChange={e => setPidParams({ ...pidParams, pb: e.target.value })} disabled={isReadOnly} />
                                            <InputGroup.Text>Ti</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.ti} onChange={e => setPidParams({ ...pidParams, ti: e.target.value })} disabled={isReadOnly} />
                                            <InputGroup.Text>Td</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.td} onChange={e => setPidParams({ ...pidParams, td: e.target.value })} disabled={isReadOnly} />
                                            <Button onClick={sendPid} disabled={isReadOnly}>Send</Button>
                                        </InputGroup>
                                        <hr className="my-2" />
                                        <div className="d-flex justify-content-between align-items-center">
                                            <span>Auto Control {plcPending && <span className="spinner-border spinner-border-sm ms-2 text-primary" />}</span>
                                            <div>
                                                <Badge bg={controlStatus.plc ? 'success' : 'secondary'} className="me-2">{controlStatus.plc ? 'ON' : 'OFF'}</Badge>
                                                <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('plc', 'start')} disabled={!!controlStatus.plc || isReadOnly || plcPending}>Start</Button>
                                                <Button variant="danger" size="sm" onClick={() => toggleProcess('plc', 'stop')} disabled={!controlStatus.plc || isReadOnly || plcPending}>Stop</Button>
                                            </div>
                                        </div>
                                        <div className="d-flex gap-2 mt-2">
                                            <Button variant="warning" size="sm" onClick={handleStartTune} disabled={tuneStatus.tune_busy || isReadOnly}>Start Tune</Button>
                                            <Button variant="secondary" size="sm" onClick={handleStopTune} disabled={isReadOnly}>Stop Tune</Button>
                                        </div>
                                        <div className="mt-2">
                                            {tuneStatus.tune_busy && <Alert variant="warning" className="py-1 small mb-1">Autotuning...</Alert>}
                                            {tuneStatus.tune_completed && <Alert variant="success" className="py-1 small mb-1">Tune Complete</Alert>}
                                            {tuneStatus.tune_err && <Alert variant="danger" className="py-1 small mb-1">Tune Failed</Alert>}
                                        </div>
                                        <div className="small mt-2">
                                            <strong>Active:</strong> PB: {Number(controlStatus.pid_pb_out || 0).toFixed(1)}, Ti: {Number(controlStatus.pid_ti_out || 0).toFixed(1)}, Td: {Number(controlStatus.pid_td_out || 0).toFixed(1)}
                                        </div>
                                        <div className="small">
                                            <strong>Results:</strong> PB: {Number(controlStatus.pid_pb_at || 0).toFixed(1)}, Ti: {Number(controlStatus.pid_ti_at || 0).toFixed(1)}, Td: {Number(controlStatus.pid_td_at || 0).toFixed(1)}
                                        </div>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>

                    <Col lg={6}>
                        <Card className="text-center">
                            <Card.Header>Live Video</Card.Header>
                            <Card.Body className="p-0 bg-black" style={{ minHeight: '360px' }}>
                                {cameraStatus === 'alive' && videoSrc ? (
                                    <img src={videoSrc} alt="Live Feed" style={{ width: '100%', height: 'auto' }} onError={() => setTimeout(() => setVideoSrc(`/api/video_feed?t=${Date.now()}`), 1000)} />
                                ) : (
                                    <div className="d-flex align-items-center justify-content-center text-white" style={{ height: '360px' }}>
                                        <div className="text-center"><h5>OFFLINE</h5><small className="text-muted">Video feed unavailable</small></div>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row className="mt-4">
                    <Col lg={12}>
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center py-2">
                                <span className="fw-semibold">Process Variables</span>
                                <small className="text-muted">Last Update: {lastUpdate}</small>
                            </Card.Header>
                            <Card.Body className="py-3">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                                    <div className="d-flex flex-column p-2 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                        <small className="text-muted" style={{ fontSize: '0.72em' }}>MV (%)</small>
                                        <span className="fw-bold fs-5">{Number(realMV).toFixed(1)} %</span>
                                    </div>
                                    <div className="d-flex flex-column p-2 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                        <small className="text-muted" style={{ fontSize: '0.72em' }}>Current</small>
                                        <span className="fw-bold fs-5">{(1.2 * (realMV / 100)).toFixed(2)} A</span>
                                    </div>
                                    <div className="d-flex flex-column p-2 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                        <small className="text-muted" style={{ fontSize: '0.72em' }}>Power</small>
                                        <span className="fw-bold fs-5 text-warning">{(Math.pow(1.2 * (realMV / 100), 2) * 20).toFixed(2)} W</span>
                                    </div>
                                    {controlStatus.mode !== 0 && (
                                        <div className="d-flex flex-column p-2 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                            <small className="text-muted" style={{ fontSize: '0.72em' }}>Setpoint (°C)</small>
                                            <span className="fw-bold fs-5 text-info">{Number(setpointOut).toFixed(2)} °C</span>
                                        </div>
                                    )}
                                    <div className="d-flex flex-column p-2 rounded" style={{ background: 'rgba(0,0,0,0.06)' }}>
                                        <small className="text-muted" style={{ fontSize: '0.72em' }}>PV (°C)</small>
                                        <span className="fw-bold fs-5 text-primary">{Number(temp).toFixed(2)} °C</span>
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row className="mt-4">
                    <Col lg={12}>
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span>MV & PV Trends</span>
                                <div>
                                    <span className="me-2 text-muted small">Window: {chartWindow} min</span>
                                    <Button variant="outline-secondary" size="sm" className="me-1" onClick={handleContract}>-</Button>
                                    <Button variant="outline-secondary" size="sm" className="me-1" onClick={handleExpand}>+</Button>
                                    <Button variant="outline-danger" size="sm" className="me-1" onClick={handleClearChart}>Clear</Button>
                                    <Button variant="outline-success" size="sm" onClick={handleDownloadCSV}>CSV</Button>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <div style={{ height: '350px' }}><TrendChart dataPoints={getVisibleData()} /></div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row className="mt-4 mb-5">
                    <Col lg={12}>
                        <Card>
                            <Card.Header className="fw-bold fs-5 text-center text-uppercase">⭐ Experience Review Section</Card.Header>
                            <Card.Body>
                                <Row>
                                    <Col md={5} className="border-end">
                                        {reviewMsg.text && <Alert variant={reviewMsg.type} className="py-2 small">{reviewMsg.text}</Alert>}
                                        <Form onSubmit={handleReviewSubmit}>
                                            <div className="mb-3">
                                                <label className="fw-bold small d-block mb-1">Your Rating:</label>
                                                <div className="fs-3 text-warning cursor-pointer" style={{ letterSpacing: '2px' }}>
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <span 
                                                            key={s} 
                                                            onClick={() => setRating(s)}
                                                            style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                                                            onMouseEnter={(e) => e.target.style.transform = 'scale(1.2)'}
                                                            onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                                        >
                                                            {s <= rating ? '⭐' : '☆'}
                                                        </span>
                                                    ))}
                                                    <small className="text-muted fs-6 ms-2">(Click to rate 1-5)</small>
                                                </div>
                                            </div>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="small fw-bold">Your Review:</Form.Label>
                                                <Form.Control 
                                                    as="textarea" 
                                                    rows={3} 
                                                    placeholder="The PID response was..." 
                                                    value={review} 
                                                    onChange={e => setReview(e.target.value)} 
                                                    required 
                                                />
                                            </Form.Group>
                                            <div className="d-flex justify-content-between align-items-center">
                                                <span className="small text-muted">Posting as: <strong>{user?.username || user?.email?.split('@')[0] || 'User'}</strong></span>
                                                <Button variant="primary" type="submit" disabled={!review.trim() || reviewMsg.type === 'info'}>Submit Review</Button>
                                            </div>
                                        </Form>
                                    </Col>
                                    <Col md={7}>
                                        <div className="d-flex justify-content-between align-items-center mb-3">
                                            <h6 className="mb-0 text-uppercase">📝 Recent Student Reviews</h6>
                                            <Badge bg="secondary">Total Reviews: {recentReviews.length}</Badge>
                                        </div>
                                        <div className="review-list" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '10px' }}>
                                            {recentReviews.length > 0 ? (
                                                recentReviews.map((r, idx) => (
                                                    <div key={idx} className="mb-3 p-3 rounded bg-body-tertiary border-start border-4 border-primary shadow-sm">
                                                        <div className="d-flex justify-content-between align-items-start mb-1">
                                                            <div>
                                                                <span className="text-warning small me-2">{'⭐'.repeat(Math.max(0, Math.min(5, parseInt(r.rating) || 0)))}{'☆'.repeat(5 - Math.max(0, Math.min(5, parseInt(r.rating) || 0)))}</span>
                                                                <strong className="small">{r.name}</strong>
                                                            </div>
                                                            <small className="text-muted" style={{ fontSize: '0.75em' }}>
                                                                {new Date(r.ts * 1000).toLocaleString()}
                                                            </small>
                                                        </div>
                                                        <p className="mb-0 small" style={{ fontStyle: 'italic', color: 'var(--bs-emphasis-color)' }}>"{r.comment}"</p>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center text-muted py-5">
                                                    <p>No reviews yet. Be the first to share your experience!</p>
                                                </div>
                                            )}
                                        </div>
                                    </Col>
                                </Row>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </>
    );
}
