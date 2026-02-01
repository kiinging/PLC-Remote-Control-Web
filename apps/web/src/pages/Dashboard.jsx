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

    const [mvPending, setMvPending] = useState(false);

    const [webPending, setWebPending] = useState(false);

    // Tune States
    const [tuneStatus, setTuneStatus] = useState({ tuning_active: false, tune_completed: false });
    const [tuneSetpoint, setTuneSetpoint] = useState(70);
    const [tuneResults, setTuneResults] = useState({ pb: 0, ti: 0, td: 0 });

    // Chart Data
    // We keep up to 1 hour of data (3600 points) in state, but may render less
    const [chartData, setChartData] = useState([]);
    const [chartWindow, setChartWindow] = useState(30); // Minutes to display

    // Video
    const [videoSrc, setVideoSrc] = useState('/video_feed');

    // Auto-reload video when camera comes online
    useEffect(() => {
        if (cameraStatus === 'alive') {
            setVideoSrc(`/video_feed?t=${Date.now()}`);
        }
    }, [cameraStatus]);


    // Load Initial Data
    useEffect(() => {
        fetchInitialData();
        const interval = setInterval(optionsPoll, 1000); // 1s polling
        return () => clearInterval(interval);
    }, []);

    const fetchInitialData = async () => {
        // Try each API call independently so one failure doesn't block others
        try {
            const cStatus = await api.getControlStatus();
            setControlStatus(cStatus);
        } catch (e) {
            console.warn("Control status unavailable", e);
        }

        try {
            const pid = await api.getPidParams();
            setPidParams(pid);
            setTuneResults(pid);
        } catch (e) {
            console.warn("PID params unavailable", e);
        }

        try {
            const sp = await api.api.get('/setpoint_status').then(r => r.data);
            setSetpoint(sp.setpoint);
        } catch (e) {
            console.warn("Setpoint unavailable", e);
        }

        try {
            const mv = await api.api.get('/mv_manual_status').then(r => r.data);
            setManualMV(mv.mv_manual);
        } catch (e) {
            console.warn("Manual MV unavailable", e);
        }

        try {
            refreshRelay();
        } catch (e) {
            console.warn("Relay status unavailable", e);
        }

        // Fetch Trend History (last hour = 3600 points)
        try {
            const history = await api.api.get('/trend?limit=3600').then(r => r.data);
            if (Array.isArray(history)) {
                setChartData(history);
            }
        } catch (e) {
            console.warn("Trend history unavailable", e);
        }
    };

    const pollGatewayHeartbeat = async () => {
        try {
            const heartbeat = await api.getGatewayHeartbeat();
            lastGatewaySeenRef.current = Date.now();
            setGatewayStatus('alive');
            if (heartbeat.timestamp) {
                setGatewayTimestamp(heartbeat.timestamp);
            }
        } catch (e) {
            // Keep last seen timestamp, will check timeout below
        }

        // Check if gateway is offline (no successful heartbeat for 10 seconds)
        if (lastGatewaySeenRef.current !== 0 && Date.now() - lastGatewaySeenRef.current > 10000) {
            setGatewayStatus('offline');
        }
    };

    const pollCameraHealth = async () => {
        try {
            const health = await api.getCameraHealth();
            lastCameraSeenRef.current = Date.now();

            // Check frame age to determine if camera is degraded
            if (health.frame_age_sec != null && health.frame_age_sec > 5) {
                setCameraStatus('degraded');
            } else {
                setCameraStatus('alive');
            }

            if (health.timestamp) {
                setCameraTimestamp(health.timestamp);
            }
        } catch (e) {
            // Keep last seen timestamp, will check timeout below
        }

        // Check if camera is offline (no successful health check for 10 seconds)
        if (lastCameraSeenRef.current !== 0 && Date.now() - lastCameraSeenRef.current > 10000) {
            setCameraStatus('offline');
        }
    };

    const optionsPoll = async () => {
        let tData = null;
        let cStatus = null;

        // Poll Gateway Heartbeat
        try {
            await pollGatewayHeartbeat();
        } catch (e) {
            // Gateway polling error handled in pollGatewayHeartbeat
        }

        // Poll Camera Health
        try {
            await pollCameraHealth();
        } catch (e) {
            // Camera polling error handled in pollCameraHealth
        }

        try {
            refreshRelay();
        } catch (e) {
            // Keep last known relay status
        }

        // Try each API call independently
        try {
            tData = await api.getTemp();
            setTemp(tData.rtd_temp);
            setLastUpdate(tData.last_update);
        } catch (e) {
            // Orange Pi offline - keep showing last known temp
        }

        try {
            cStatus = await api.getControlStatus();
            setControlStatus(cStatus);
        } catch (e) {
            // Keep last known control status
        }

        try {
            if (cStatus && cStatus.mode === 2) {
                const tStatus = await api.getTuneStatus();
                setTuneStatus(tStatus);
            }
        } catch (e) {
            // Tuning status unavailable
        }

        // Update chart only if we have temp data
        if (tData) {
            const now = new Date().toLocaleTimeString();
            setChartData(prev => {
                const newItem = {
                    time: now,
                    pv: tData.rtd_temp,
                    sp: (cStatus?.mode === 2 ? tuneSetpoint : setpoint),
                    mv: manualMV
                };
                // Append new item, keep last 3600 points (1 hour)
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
            // New API returns: { alive: bool, relay: bool|null, last_seen_s: number, desired: bool }

            setEsp32Alive(r.alive);
            setEsp32LastSeen(r.last_seen_s);

            if (r.alive) {
                setRelayStatus('alive');
                setRelay(r.relay === true); // Explicitly check true, as it might be null
                if (!videoSrc) setVideoSrc('/video_feed');
            } else {
                setRelayStatus('offline');
                setRelay(false); // Default to off in UI if unknown, or maybe keep last known?
                // r.desired could be used to show "pending" state if needed
            }

            // Always try to load video (add timestamp to bust cache)
            if (!videoSrc) setVideoSrc(`/video_feed?t=${Date.now()}`);
        } catch (e) {
            console.warn("Relay status check failed", e);
            setEsp32Alive(false);
            setRelayStatus('offline');
        }
    };

    const handleRelayToggle = async (state) => {
        // Optimistic update
        setRelay(state);

        try {
            await api.setRelay(state);
            // Don't refresh immediately - let the next poll (1s interval) update the real state
            // This prevents race conditions where the UI gets reverted before the backend processes it
            console.log("Relay command sent, awaiting backend confirmation...");
        } catch (e) {
            console.error("Failed to toggle relay", e);
            // Revert state if failed (next poll would fix it too)
            refreshRelay();
        }


    };

    // Generic Control Handlers
    const toggleProcess = async (type, action) => {
        if (type === 'web') {
            // Special handling for Web Control with Spinner
            setWebPending(true);
            try {
                if (action === 'start') await api.startProcess(type);
                else await api.stopProcess(type);

                // Start polling for Ack (handled by main poll loop or specific effect)
                // We leave webPending = true until the next poll confirms the change
            } catch (e) {
                console.error("Failed to toggle web process", e);
                setWebPending(false); // Stop spinner if gateway call failed
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
        // Legacy had ack check loop, here we trust or add alert
    };

    const sendSetpoint = async () => {
        if (isReadOnly) return;
        await api.setSetpoint(setpoint);
    };

    const sendManualMV = async () => {
        if (isReadOnly) return;
        setMvPending(true); // Start spinner
        await api.setManualMV(manualMV);
        // We rely on the generic poll to clear this when ack is received
    };

    const handleStartTune = async () => {
        if (isReadOnly) return;
        await api.startTune();
    };

    const handleStopTune = async () => {
        if (isReadOnly) return;
        await api.stopTune();
    };

    // --- Web Ack Logic (Integrated into Main Poll) ---
    // We remove the separate useEffect and rely on optionsPoll updating controlStatus
    // We use loose equality (== true) or just truthy check to handle 1 vs true
    useEffect(() => {
        if (webPending && controlStatus.web_ack) {
            setWebPending(false);
        }
        // Also check MV Ack
        if (mvPending && controlStatus.mv_ack) {
            setMvPending(false);
        }
    }, [controlStatus, webPending, mvPending]);

    // --- Chart Controls ---
    const handleExpand = () => {
        setChartWindow(prev => Math.min(prev + 10, 60)); // Max 60 mins
    };

    const handleContract = () => {
        setChartWindow(prev => Math.max(prev - 10, 10)); // Min 10 mins
    };

    const handleClearChart = () => {
        if (window.confirm("Are you sure you want to clear the chart history?")) {
            setChartData([]);
        }
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

    // Get visible data based on window
    const getVisibleData = () => {
        const pointsToShow = chartWindow * 60; // 1 point per second ideally
        return chartData.slice(-pointsToShow);
    };


    // Helpers for UI
    const getModeName = (m) => ['Manual', 'Auto', 'Tune'][m] || 'Unknown';
    const getModeColor = (m) => ['danger', 'success', 'warning'][m] || 'secondary';

    // Access Control Logic
    const [isReadOnly, setIsReadOnly] = useState(true);
    const [bookingChecked, setBookingChecked] = useState(false);

    const checkAccess = async () => {
        // Admin always has access
        if (user?.username === 'admin') {
            setIsReadOnly(false);
            setBookingChecked(true);
            return;
        }

        try {
            const hasBooking = await bookingService.hasActiveBooking();
            setIsReadOnly(!hasBooking);
        } catch (e) {
            console.error("Failed to check booking", e);
            setIsReadOnly(true); // Fail safe
        } finally {
            setBookingChecked(true);
        }
    };

    useEffect(() => {
        checkAccess();
        const interval = setInterval(checkAccess, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [user]);

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand>PLC Web Control</Navbar.Brand>
                    <Navbar.Collapse className="justify-content-end">
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
                {/* Read Only Alert */}
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
                    {/* Controls Column */}
                    <Col lg={6}>
                        <Card className="mb-3">
                            <Card.Header>Control Panel</Card.Header>
                            <Card.Body>
                                {/* System Status Indicators */}
                                <div className="mb-3 pb-3 border-bottom">
                                    <div className="d-flex align-items-center flex-wrap gap-2">
                                        <strong className="me-2">System Status</strong>
                                        <Badge bg={gatewayStatus === 'alive' ? 'success' : 'danger'}>
                                            Gateway: {gatewayStatus.toUpperCase()}
                                        </Badge>
                                        <Badge bg={cameraStatus === 'alive' ? 'success' : cameraStatus === 'degraded' ? 'warning' : 'danger'}>
                                            Camera: {cameraStatus.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <div className="d-flex gap-3 align-items-center mt-1">
                                        {/* Timestamps in a small row below if needed, or keeping it clean */}
                                        {gatewayTimestamp && gatewayTimestamp !== '--' && (
                                            <small className="text-muted" style={{ fontSize: '0.7em' }}>GW Last: {gatewayTimestamp}</small>
                                        )}
                                        {cameraTimestamp && cameraTimestamp !== '--' && (
                                            <small className="text-muted" style={{ fontSize: '0.7em' }}>Cam Last: {cameraTimestamp}</small>
                                        )}
                                    </div>

                                    {/* Process Power Control */}
                                    <div className="mt-3 mb-2">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div className="d-flex align-items-center">
                                                <strong className="me-2">Process Power (Relay)</strong>
                                                <Badge bg={esp32Alive ? 'success' : 'secondary'}>
                                                    {esp32Alive ? 'ESP32: ALIVE' : 'ESP32: OFFLINE'}
                                                </Badge>
                                            </div>

                                            <div className="d-flex align-items-center">
                                                <Badge bg={relay ? 'success' : 'secondary'} className="me-2">
                                                    {relay ? 'ON' : 'OFF'}
                                                </Badge>
                                                <Button variant="success" size="sm" className="me-1" onClick={() => handleRelayToggle(true)} disabled={relay || !esp32Alive || isReadOnly}>Start</Button>
                                                <Button variant="danger" size="sm" onClick={() => handleRelayToggle(false)} disabled={!relay || !esp32Alive || isReadOnly}>Stop</Button>

                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Light */}
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <strong>Light Control</strong>
                                    <div>
                                        <Badge bg={controlStatus.light ? 'success' : 'secondary'} className="me-2">
                                            {controlStatus.light ? 'ON' : 'OFF'}
                                        </Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('light', 'start')} disabled={!!controlStatus.light || isReadOnly}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('light', 'stop')} disabled={!controlStatus.light || isReadOnly}>Stop</Button>
                                    </div>
                                </div>

                                {/* Web Control Remained Here */}
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <strong>Web Control
                                        {webPending && <span className="ms-2 spinner-border spinner-border-sm text-primary" role="status" />}
                                    </strong>
                                    <div>
                                        <Badge bg={controlStatus.web ? 'success' : 'secondary'} className="me-2">
                                            {controlStatus.web ? 'ON' : 'OFF'}
                                        </Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('web', 'start')} disabled={!!controlStatus.web || isReadOnly || webPending}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('web', 'stop')} disabled={!controlStatus.web || isReadOnly || webPending}>Stop</Button>
                                    </div>
                                </div>

                                <hr />

                                {/* Mode Selection */}
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <strong>Mode: <Badge bg={getModeColor(controlStatus.mode)}>{getModeName(controlStatus.mode)}</Badge></strong>
                                    <div>
                                        <Button variant="danger" size="sm" className="me-1" onClick={() => changeMode('manual')} disabled={isReadOnly}>Manual</Button>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => changeMode('auto')} disabled={isReadOnly}>Auto</Button>
                                        <Button variant="warning" size="sm" onClick={() => changeMode('tune')} disabled={isReadOnly}>Tune</Button>
                                    </div>
                                </div>

                                {/* Dynamic Controls based on Mode */}
                                {controlStatus.mode === 1 && ( // Auto
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>PID Settings</h6>
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
                                    </div>
                                )}

                                {controlStatus.mode === 0 && ( // Manual
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>Manual Settings</h6>
                                        <InputGroup size="sm">
                                            <InputGroup.Text>MV (%)</InputGroup.Text>
                                            <Form.Control type="number" value={manualMV} onChange={e => setManualMV(e.target.value)} disabled={isReadOnly || mvPending} />
                                            <Button onClick={sendManualMV} disabled={isReadOnly || mvPending}>
                                                {mvPending ? <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" /> : 'Send'}
                                            </Button>
                                        </InputGroup>
                                    </div>
                                )}

                                {controlStatus.mode === 2 && ( // Tune
                                    <div className="border p-2 rounded bg-body-secondary">
                                        <h6>Auto Tune</h6>
                                        <Alert variant="info" className="py-1 small">
                                            Cycling output to find PID values.
                                        </Alert>
                                        <div className="mb-2">
                                            <Button variant="warning" size="sm" className="me-2" onClick={handleStartTune} disabled={tuneStatus.tuning_active || isReadOnly}>Start Tune</Button>
                                            <Button variant="secondary" size="sm" onClick={handleStopTune} disabled={isReadOnly}>Stop Tune</Button>
                                        </div>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>Tune SP</InputGroup.Text>
                                            <Form.Control type="number" value={tuneSetpoint} onChange={e => setTuneSetpoint(e.target.value)} disabled={isReadOnly} />
                                            <Button onClick={async () => await api.setTuneSetpoint(tuneSetpoint)} disabled={isReadOnly}>Send</Button>
                                        </InputGroup>
                                        <div className="small">
                                            <strong>Results: </strong>
                                            PB: {tuneStatus.tune_completed ? tuneResults.pb : '--'},
                                            Ti: {tuneStatus.tune_completed ? tuneResults.ti : '--'},
                                            Td: {tuneStatus.tune_completed ? tuneResults.td : '--'}
                                        </div>
                                    </div>
                                )}

                                {/* PLC Control (Moved Here) */}
                                <div className="d-flex justify-content-between align-items-center mb-3 mt-4 pt-3 border-top">
                                    <strong>Heater Control</strong>
                                    <div>
                                        <Badge bg={controlStatus.plc ? 'success' : 'secondary'} className="me-2">
                                            {controlStatus.plc ? 'ON' : 'OFF'}
                                        </Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('plc', 'start')} disabled={!!controlStatus.plc || isReadOnly}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('plc', 'stop')} disabled={!controlStatus.plc || isReadOnly}>Stop</Button>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <span>Process Value (Temp)</span>
                                        <span className="text-primary fw-bold">{Number(temp).toFixed(2)} °C</span>
                                    </div>
                                    <div className="text-muted small text-end">Last Update: {lastUpdate}</div>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>

                    {/* Video Column */}
                    <Col lg={6}>
                        <Card className="text-center">
                            <Card.Header>Live Video</Card.Header>
                            <Card.Body className="p-0 bg-black" style={{ minHeight: '360px', position: 'relative' }}>
                                {cameraStatus === 'alive' && videoSrc && (
                                    <img
                                        src={videoSrc}
                                        alt="Live Feed"
                                        style={{ width: '100%', height: 'auto', display: 'block' }}
                                        onError={() => {
                                            console.log("Video stream failed, retrying in 1s...");
                                            setTimeout(() => setVideoSrc(`/video_feed?t=${Date.now()}`), 1000);
                                        }}
                                    />
                                )}
                                {cameraStatus !== 'alive' && (
                                    <div className="d-flex align-items-center justify-content-center text-white" style={{ height: '360px' }}>
                                        <div className="text-center">
                                            <h5 className="mb-0">OFFLINE</h5>
                                            <small className="text-muted">Video feed unavailable</small>
                                        </div>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {/* Full-width Chart Row */}
                <Row className="mt-4">
                    <Col lg={12}>
                        <Card>
                            <Card.Header className="d-flex justify-content-between align-items-center">
                                <span>MV & PV Trends</span>
                                <div>
                                    <span className="me-2 text-muted small">Window: {chartWindow} min</span>
                                    <Button variant="outline-primary" size="sm" className="me-1" onClick={handleExpand} disabled={chartWindow >= 60}>Wait +</Button>
                                    <Button variant="outline-primary" size="sm" className="me-2" onClick={handleContract} disabled={chartWindow <= 10}>Wait -</Button>
                                    <Button variant="outline-secondary" size="sm" className="me-2" onClick={handleDownloadCSV}>CSV</Button>
                                    <Button variant="outline-danger" size="sm" onClick={handleClearChart}>Clear</Button>
                                </div>
                            </Card.Header>
                            <Card.Body style={{ height: '450px' }}>
                                <TrendChart dataPoints={getVisibleData()} />
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container >
        </>
    );
}
