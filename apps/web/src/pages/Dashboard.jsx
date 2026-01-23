import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Container, Row, Col, Card, Button, Form, Badge, Alert, InputGroup, Navbar, Nav } from 'react-bootstrap';
import TrendChart from '../components/TrendChart';
import * as api from '../services/api';

export default function Dashboard() {
    const { user, logout } = useAuth();

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

    // Tune States
    const [tuneStatus, setTuneStatus] = useState({ tuning_active: false, tune_completed: false });
    const [tuneSetpoint, setTuneSetpoint] = useState(70);
    const [tuneResults, setTuneResults] = useState({ pb: 0, ti: 0, td: 0 });

    // Chart Data
    const [chartData, setChartData] = useState([]);

    // Video
    const [videoSrc, setVideoSrc] = useState('/video_feed');
    const [countdown, setCountdown] = useState(0);

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
                const newData = [...prev, newItem];
                if (newData.length > 60) newData.shift();
                return newData;
            });
        }
    };

    const refreshRelay = async () => {
        const r = await api.getRelayStatus();
        if (r.alive) {
            setRelayStatus('alive');
            setRelay(true);
            if (!videoSrc) setVideoSrc('/video_feed');
        } else if (r.booting) {
            setRelayStatus('booting');
            setRelay(true);
        } else {
            setRelayStatus('offline');
            setRelay(false);
        }

        // Always try to load video
        if (!videoSrc) setVideoSrc('/video_feed');
    };

    const handleRelayToggle = async (state) => {
        await api.setRelay(state);
        refreshRelay();
        if (state) {
            // Start countdown
            setCountdown(60);
            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    };

    // Generic Control Handlers
    const toggleProcess = async (type, action) => {
        if (action === 'start') await api.startProcess(type);
        else await api.stopProcess(type);
        // State will update on next poll
    };

    const changeMode = async (mode) => {
        await api.setMode(mode);
    };

    const sendPid = async () => {
        await api.setPidParams(pidParams);
        // Legacy had ack check loop, here we trust or add alert
    };

    const sendSetpoint = async () => {
        await api.setSetpoint(setpoint);
    };

    const sendManualMV = async () => {
        await api.setManualMV(manualMV);
    };

    const handleStartTune = async () => {
        await api.startTune();
    };

    const handleStopTune = async () => {
        await api.stopTune();
    };

    // Helpers for UI
    const getModeName = (m) => ['Manual', 'Auto', 'Tune'][m] || 'Unknown';
    const getModeColor = (m) => ['danger', 'success', 'warning'][m] || 'secondary';

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand>PLC Web Control</Navbar.Brand>
                    <Navbar.Collapse className="justify-content-end">
                        <Navbar.Text className="me-3">
                            Signed in as: <a href="#login">{user?.username}</a>
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
                <Row className="g-4">
                    {/* Controls Column */}
                    <Col lg={6}>
                        <Card className="mb-3">
                            <Card.Header>Control Panel</Card.Header>
                            <Card.Body>
                                {/* System Status Indicators */}
                                <div className="mb-3 pb-3 border-bottom">
                                    <strong>System Status</strong>
                                    <div className="d-flex gap-3 mt-2">
                                        <div>
                                            <Badge bg={gatewayStatus === 'alive' ? 'success' : 'danger'}>
                                                Gateway: {gatewayStatus.toUpperCase()}
                                            </Badge>
                                            {gatewayTimestamp && gatewayTimestamp !== '--' && (
                                                <small className="text-muted ms-2">Last: {gatewayTimestamp}</small>
                                            )}
                                        </div>
                                        <div>
                                            <Badge bg={cameraStatus === 'alive' ? 'success' : cameraStatus === 'degraded' ? 'warning' : 'danger'}>
                                                Camera: {cameraStatus.toUpperCase()}
                                            </Badge>
                                            {cameraTimestamp && cameraTimestamp !== '--' && (
                                                <small className="text-muted ms-2">Last: {cameraTimestamp}</small>
                                            )}
                                        </div>
                                    </div>

                                    {/* Process Power Control */}
                                    <div className="mt-3">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <strong>Process Power (Relay)</strong>
                                            <div className="d-flex align-items-center gap-2">
                                                <Badge bg={relayStatus === 'alive' ? 'success' : relayStatus === 'booting' ? 'warning' : 'danger'}>
                                                    {relayStatus.toUpperCase()}
                                                </Badge>
                                                <Button variant="success" size="sm" onClick={() => handleRelayToggle(true)} disabled={relay}>ON</Button>
                                                <Button variant="danger" size="sm" onClick={() => handleRelayToggle(false)} disabled={!relay}>OFF</Button>
                                                {countdown > 0 && <span className="text-muted small ms-2">Booting: {countdown}s</span>}
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
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('light', 'start')}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('light', 'stop')}>Stop</Button>
                                    </div>
                                </div>

                                {/* Web */}
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <strong>Web Control</strong>
                                    <div>
                                        <Badge bg={controlStatus.web ? 'success' : 'secondary'} className="me-2">
                                            {controlStatus.web ? 'ON' : 'OFF'}
                                        </Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('web', 'start')}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('web', 'stop')}>Stop</Button>
                                    </div>
                                </div>

                                {/* PLC */}
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <strong>PLC Control</strong>
                                    <div>
                                        <Badge bg={controlStatus.plc ? 'success' : 'secondary'} className="me-2">
                                            {controlStatus.plc ? 'ON' : 'OFF'}
                                        </Badge>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => toggleProcess('plc', 'start')}>Start</Button>
                                        <Button variant="danger" size="sm" onClick={() => toggleProcess('plc', 'stop')}>Stop</Button>
                                    </div>
                                </div>

                                <hr />

                                {/* Mode Selection */}
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <strong>Mode: <Badge bg={getModeColor(controlStatus.mode)}>{getModeName(controlStatus.mode)}</Badge></strong>
                                    <div>
                                        <Button variant="danger" size="sm" className="me-1" onClick={() => changeMode('manual')}>Manual</Button>
                                        <Button variant="success" size="sm" className="me-1" onClick={() => changeMode('auto')}>Auto</Button>
                                        <Button variant="warning" size="sm" onClick={() => changeMode('tune')}>Tune</Button>
                                    </div>
                                </div>

                                {/* Dynamic Controls based on Mode */}
                                {controlStatus.mode === 1 && ( // Auto
                                    <div className="border p-2 rounded bg-light">
                                        <h6>PID Settings</h6>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>Setpoint</InputGroup.Text>
                                            <Form.Control type="number" value={setpoint} onChange={e => setSetpoint(e.target.value)} />
                                            <Button onClick={sendSetpoint}>Send</Button>
                                        </InputGroup>
                                        <InputGroup size="sm">
                                            <InputGroup.Text>PB</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.pb} onChange={e => setPidParams({ ...pidParams, pb: e.target.value })} />
                                            <InputGroup.Text>Ti</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.ti} onChange={e => setPidParams({ ...pidParams, ti: e.target.value })} />
                                            <InputGroup.Text>Td</InputGroup.Text>
                                            <Form.Control type="number" value={pidParams.td} onChange={e => setPidParams({ ...pidParams, td: e.target.value })} />
                                            <Button onClick={sendPid}>Send</Button>
                                        </InputGroup>
                                    </div>
                                )}

                                {controlStatus.mode === 0 && ( // Manual
                                    <div className="border p-2 rounded bg-light">
                                        <h6>Manual Settings</h6>
                                        <InputGroup size="sm">
                                            <InputGroup.Text>MV (%)</InputGroup.Text>
                                            <Form.Control type="number" value={manualMV} onChange={e => setManualMV(e.target.value)} />
                                            <Button onClick={sendManualMV}>Send</Button>
                                        </InputGroup>
                                    </div>
                                )}

                                {controlStatus.mode === 2 && ( // Tune
                                    <div className="border p-2 rounded bg-light">
                                        <h6>Auto Tune</h6>
                                        <Alert variant="info" className="py-1 small">
                                            Cycling output to find PID values.
                                        </Alert>
                                        <div className="mb-2">
                                            <Button variant="warning" size="sm" className="me-2" onClick={handleStartTune} disabled={tuneStatus.tuning_active}>Start Tune</Button>
                                            <Button variant="secondary" size="sm" onClick={handleStopTune}>Stop Tune</Button>
                                        </div>
                                        <InputGroup size="sm" className="mb-2">
                                            <InputGroup.Text>Tune SP</InputGroup.Text>
                                            <Form.Control type="number" value={tuneSetpoint} onChange={e => setTuneSetpoint(e.target.value)} />
                                            <Button onClick={async () => await api.setTuneSetpoint(tuneSetpoint)}>Send</Button>
                                        </InputGroup>
                                        <div className="small">
                                            <strong>Results: </strong>
                                            PB: {tuneStatus.tune_completed ? tuneResults.pb : '--'},
                                            Ti: {tuneStatus.tune_completed ? tuneResults.ti : '--'},
                                            Td: {tuneStatus.tune_completed ? tuneResults.td : '--'}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-3">
                                    <h6>Process Data</h6>
                                    <div>Temp: <span className="text-primary fw-bold">{Number(temp).toFixed(2)} °C</span></div>
                                    <div className="text-muted small">Last Update: {lastUpdate}</div>

                                    <div className="mt-2">
                                        <Badge bg={gatewayStatus === 'alive' ? 'success' : 'danger'} className="me-2">
                                            Gateway: {gatewayStatus.toUpperCase()}
                                        </Badge>
                                        {gatewayStatus === 'alive' && gatewayTimestamp !== '--' && (
                                            <span className="text-muted small">Last: {gatewayTimestamp}</span>
                                        )}
                                    </div>
                                </div>

                            </Card.Body>
                        </Card>
                    </Col>

                    {/* Video Column */}
                    <Col lg={6}>
                        <Card className="text-center">
                            <Card.Header>Live Video</Card.Header>
                            <Card.Body className="p-0 bg-black" style={{ minHeight: '360px', position: 'relative' }}>
                                {videoSrc && (
                                    <img src={videoSrc} alt="Live Feed" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {/* Full-width Chart Row */}
                <Row className="mt-4">
                    <Col lg={12}>
                        <Card>
                            <Card.Header>MV & PV Trends</Card.Header>
                            <Card.Body style={{ height: '450px' }}>
                                <TrendChart dataPoints={chartData} />
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </>
    );
}
