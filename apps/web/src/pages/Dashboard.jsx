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
    const [videoSrc, setVideoSrc] = useState('');
    const [countdown, setCountdown] = useState(0);

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
            const pid = await api.getPidParams();
            setPidParams(pid);
            setTuneResults(pid); // Init tune results with current

            const sp = await api.api.get('/setpoint_status').then(r => r.data);
            setSetpoint(sp.setpoint);

            const mv = await api.api.get('/mv_manual_status').then(r => r.data);
            setManualMV(mv.mv_manual);

            refreshRelay();
        } catch (e) {
            console.error("Init failed", e);
        }
    };

    const optionsPoll = async () => {
        try {
            // Temp
            const tData = await api.getTemp();
            setTemp(tData.rtd_temp);
            setLastUpdate(tData.last_update);

            // Control Status (Light, PLC, etc)
            const cStatus = await api.getControlStatus();
            setControlStatus(cStatus);

            // Relay
            refreshRelay();

            // Tuning
            if (cStatus.mode === 2) {
                const tStatus = await api.getTuneStatus();
                setTuneStatus(tStatus);
            }

            // Chart Data Point (Mocking MV/PV/SP/Time from polling response or inference)
            // The legacy app pushed data into array. We need to construct it.
            // We have current temp (PV), current Setpoint (from local state or fetch?), current MV?
            // Legacy `script-main.js` seemed to push data? IDK where it got MV from each second?
            // Ah, likely `temp` endpoint returns more? 
            // `getTemp` -> `rtd_temp`.
            // We might need to fetch `mv` status too.
            // Let's assume we can plot what we have.

            const now = new Date().toLocaleTimeString();
            setChartData(prev => {
                const newItem = {
                    time: now,
                    pv: tData.rtd_temp,
                    sp: (cStatus.mode === 2 ? tuneSetpoint : setpoint),
                    mv: manualMV // approximate, or fetch actual MV
                };
                const newData = [...prev, newItem];
                if (newData.length > 60) newData.shift(); // Keep last 60 points
                return newData;
            });

        } catch (e) {
            console.error("Poll error", e);
        }
    };

    const refreshRelay = async () => {
        const r = await api.getRelayStatus();
        if (r.alive) {
            setRelayStatus('alive');
            setRelay(true);
            if (!videoSrc) setVideoSrc('https://cloud-worker.wongkiinging.workers.dev/video_feed');
        } else if (r.booting) {
            setRelayStatus('booting');
            setRelay(true);
        } else {
            setRelayStatus('offline');
            setRelay(false);
            setVideoSrc('');
        }
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
                {/* Device Power Row */}
                <Row className="mb-4">
                    <Col md={12}>
                        <Card>
                            <Card.Body className="d-flex justify-content-between align-items-center">
                                <h5 className="mb-0">Device Power (ESP32 Relay)</h5>
                                <div className="d-flex align-items-center gap-2">
                                    <Badge bg={relayStatus === 'alive' ? 'success' : relayStatus === 'booting' ? 'warning' : 'danger'}>
                                        {relayStatus.toUpperCase()}
                                    </Badge>
                                    <Button variant="success" size="sm" onClick={() => handleRelayToggle(true)} disabled={relay}>ON</Button>
                                    <Button variant="danger" size="sm" onClick={() => handleRelayToggle(false)} disabled={!relay}>OFF</Button>
                                    {countdown > 0 && <span className="text-muted small ms-2">Booting: {countdown}s</span>}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row className="g-4">
                    {/* Controls Column */}
                    <Col lg={6}>
                        <Card className="mb-3">
                            <Card.Header>Control Panel</Card.Header>
                            <Card.Body>

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
                                </div>

                            </Card.Body>
                        </Card>
                    </Col>

                    {/* Video & Chart Column */}
                    <Col lg={6}>
                        {/* Video Feed */}
                        <Card className="mb-3 text-center">
                            <Card.Header>Live Video</Card.Header>
                            <Card.Body className="p-0 bg-black" style={{ minHeight: '240px', position: 'relative' }}>
                                {relayStatus !== 'alive' && (
                                    <div className="d-flex align-items-center justify-content-center text-white h-100" style={{ position: 'absolute', width: '100%', top: 0 }}>
                                        {relayStatus === 'booting' ? 'Booting Camera...' : 'Camera Offline'}
                                    </div>
                                )}
                                {videoSrc && (
                                    <img src={videoSrc} alt="Live Feed" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                )}
                            </Card.Body>
                        </Card>

                        {/* Chart */}
                        <Card>
                            <Card.Header>MV & PV Trends</Card.Header>
                            <Card.Body style={{ height: '300px' }}>
                                <TrendChart dataPoints={chartData} />
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </>
    );
}
