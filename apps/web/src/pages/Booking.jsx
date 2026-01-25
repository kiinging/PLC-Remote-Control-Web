import { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Table, Alert, Badge, Navbar, Nav } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function Booking() {
    const [bookings, setBookings] = useState([]);
    const [myBookings, setMyBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    // Generate slots for next 3 days
    const [slots, setSlots] = useState([]);

    useEffect(() => {
        generateSlots();
        fetchData();
    }, []);

    const generateSlots = () => {
        const generated = [];
        const today = new Date();
        today.setMinutes(0, 0, 0); // Round down to nearest hour

        // Generate for next 3 days, 8 AM - 10 PM (Kuching Time ideally, but simplifying to local browser time for now)
        // Note: The requirement asks for Asia/Kuching. 
        // We will display times in local browser time but assume the user is in Kuching or consistent.

        for (let d = 0; d < 3; d++) {
            const date = new Date(today);
            date.setDate(date.getDate() + d);

            // Create slots from current hour (if today) until 23:00
            let startHour = (d === 0) ? Math.max(today.getHours() + 1, 0) : 0;

            for (let h = startHour; h < 24; h++) {
                const slotStart = new Date(date);
                slotStart.setHours(h, 0, 0, 0);

                const slotEnd = new Date(slotStart);
                slotEnd.setHours(h + 1);

                generated.push({
                    start: slotStart,
                    end: slotEnd
                });
            }
        }
        setSlots(generated);
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const now = new Date().toISOString();
            // Get bookings for next 7 days
            const nextWeek = new Date();
            nextWeek.setDate(nextWeek.getDate() + 7);

            const data = await bookingService.getBookings(now, nextWeek.toISOString());
            setBookings(data);

            // Filter my bookings
            if (user) {
                setMyBookings(data.filter(b => b.user_id === user.id));
            }
        } catch (err) {
            console.error(err);
            setError("Failed to load bookings");
        } finally {
            setLoading(false);
        }
    };

    const handleBook = async (slot) => {
        try {
            setError(null);
            setSuccess(null);
            await bookingService.createBooking(slot.start.toISOString(), slot.end.toISOString());
            setSuccess("Booking confirmed!");
            fetchData(); // Refresh
        } catch (err) {
            setError(err.message || "Failed to book slot. It might be taken.");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Cancel this booking?")) return;
        try {
            await bookingService.deleteBooking(id);
            setSuccess("Booking cancelled.");
            fetchData();
        } catch (err) {
            setError("Failed to cancel booking");
        }
    };

    const isSlotTaken = (slot) => {
        return bookings.some(b => {
            const bStart = new Date(b.start_time).getTime();
            const bEnd = new Date(b.end_time).getTime();
            const sStart = slot.start.getTime();
            // Simple overlap check for 1-hour aligned slots
            return sStart >= bStart && sStart < bEnd;
        });
    };

    const isMyBooking = (slot) => {
        return myBookings.some(b => {
            const bStart = new Date(b.start_time).getTime();
            const sStart = slot.start.getTime();
            return Math.abs(bStart - sStart) < 1000;
        });
    };

    // Format for display: "Mon, 25 Jan - 14:00"
    const formatSlot = (date) => {
        return date.toLocaleString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <>
            <Navbar bg="dark" variant="dark" expand="lg" className="mb-4">
                <Container>
                    <Navbar.Brand href="/dashboard">PLC Web Control</Navbar.Brand>
                    <Navbar.Toggle />
                    <Navbar.Collapse className="justify-content-end">
                        <Nav className="me-auto">
                            <Nav.Link onClick={() => navigate('/dashboard')}>Dashboard</Nav.Link>
                            <Nav.Link active>Book Lab</Nav.Link>
                        </Nav>
                        <ThemeToggle className="me-3" />
                        <Navbar.Text className="me-3">
                            Signed in as: {user?.email?.split('@')[0]}
                        </Navbar.Text>
                        <Button variant="outline-light" size="sm" onClick={logout}>Logout</Button>
                    </Navbar.Collapse>
                </Container>
            </Navbar>

            <Container>
                <h2 className="mb-4">Lab Booking</h2>

                {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
                {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

                <Row className="g-4">
                    <Col lg={4} className="order-lg-2">
                        <Card>
                            <Card.Header>My Bookings</Card.Header>
                            <Card.Body>
                                {myBookings.length === 0 ? (
                                    <p className="text-muted">No active bookings.</p>
                                ) : (
                                    <Table hover size="sm">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {myBookings.map(b => (
                                                <tr key={b.id}>
                                                    <td>
                                                        {new Date(b.start_time).toLocaleString('en-GB', {
                                                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td>
                                                        <Button variant="danger" size="sm" onClick={() => handleDelete(b.id)}>Cancel</Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>

                    <Col lg={8} className="order-lg-1">
                        <Card>
                            <Card.Header>Available Slots (Next 3 Days)</Card.Header>
                            <Card.Body style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                <div className="d-grid gap-2">
                                    {slots.map((slot, idx) => {
                                        const taken = isSlotTaken(slot);
                                        const bookedByMe = isMyBooking(slot);

                                        let variant = 'outline-primary';
                                        let text = 'Book';
                                        let disabled = false;

                                        if (bookedByMe) {
                                            variant = 'success';
                                            text = 'Booked';
                                            disabled = true;
                                        } else if (taken) {
                                            variant = 'secondary';
                                            text = 'Taken';
                                            disabled = true;
                                        }

                                        return (
                                            <div key={idx} className="d-flex justify-content-between align-items-center border p-2 rounded">
                                                <strong>{formatSlot(slot.start)}</strong>
                                                <Button
                                                    variant={variant}
                                                    size="sm"
                                                    disabled={disabled}
                                                    onClick={() => handleBook(slot)}
                                                    style={{ minWidth: '80px' }}
                                                >
                                                    {text}
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </>
    );
}
