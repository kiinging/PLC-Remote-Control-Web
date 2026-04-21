import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Alert } from 'react-bootstrap';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useEffect, useState } from 'react';

const Login = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [identifier, setIdentifier] = useState(''); // Email or Username
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [isSignUp, setIsSignUp] = useState(false);

    useEffect(() => {
        if (user) {
            navigate('/dashboard');
        }
    }, [user, navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Map identifier (username) to email if it's not already an email
        const email = identifier.includes('@') ? identifier : `${identifier}@student.local`;

        try {
            if (isSignUp) {
                if (password !== confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                if (password.length < 4) {
                    throw new Error("Password must be at least 4 characters");
                }
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setError("Account created! Logging you in...");
                
                // If "Confirm Email" is OFF in dashboard, this will log them in immediately.
                // If it's ON, they will see a success message but need to verify.
                setIsSignUp(false);
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            }
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
            });
            if (error) throw error;
        } catch (error) {
            setError(error.message);
        }
    };

    const { theme } = useTheme();

    return (
        <Container className="min-vh-100 d-flex align-items-center justify-content-center py-5">
            <Row className="w-100 justify-content-center">
                <Col md={6} lg={4}>
                    <Card className="shadow-lg border-0 rounded-4">
                        <Card.Body className="p-4">
                            <div className="text-center mb-3">
                                <h3 className="fw-bold mb-1">{isSignUp ? 'Sign Up' : 'Sign In'}</h3>
                                <p className="text-muted small mb-0">
                                    {isSignUp ? 'Create your student account' : 'Welcome back to the PID lab'}
                                </p>
                            </div>

                            {error && <Alert variant={error.includes("Account created") ? "success" : "danger"}>{error}</Alert>}

                            <Form onSubmit={handleLogin}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Username or Email</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={identifier}
                                        onChange={(e) => setIdentifier(e.target.value)}
                                        required
                                        placeholder="Enter username or email"
                                    />
                                </Form.Group>

                                <Form.Group className="mb-4">
                                    <Form.Label>Password</Form.Label>
                                    <Form.Control
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        placeholder="Enter your password"
                                    />
                                </Form.Group>

                                {isSignUp && (
                                    <Form.Group className="mb-4">
                                        <Form.Label>Confirm Password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            placeholder="Confirm your password"
                                        />
                                    </Form.Group>
                                )}

                                <Button
                                    variant="primary"
                                    type="submit"
                                    className="w-100 py-2 fw-semibold mb-3"
                                    disabled={loading}
                                >
                                    {loading ? (isSignUp ? 'Creating Account...' : 'Signing in...') : (isSignUp ? 'Sign Up' : 'Sign In')}
                                </Button>
                            </Form>

                            <div className="text-center mb-3">
                                <small>
                                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                                    <span
                                        onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                                        style={{ cursor: 'pointer', color: '#0d6efd', fontWeight: 'bold' }}
                                    >
                                        {isSignUp ? 'Sign In' : 'Sign Up'}
                                    </span>
                                </small>
                            </div>

                            <div className="text-center mb-3">
                                <span className="text-muted">or</span>
                            </div>

                            <Button
                                variant={theme === 'dark' ? 'outline-light' : 'outline-dark'}
                                className="w-100 py-2 fw-semibold d-flex align-items-center justify-content-center gap-2"
                                onClick={handleGoogleLogin}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                                Sign in with Google
                            </Button>
                        </Card.Body>
                    </Card>
                    <div className="mt-4 text-center">
                        <Card className="border shadow-none rounded-4 bg-body-tertiary">
                            <Card.Body className="p-3">
                                <h6 className="fw-bold mb-2">Pre-Lab Resources</h6>
                                <div className="d-flex flex-column gap-2">
                                    <Button 
                                        variant="outline-primary" 
                                        size="sm" 
                                        onClick={() => navigate('/lab-sheet?lab=4', { state: { from: '/login' } })}
                                    >
                                        📖 Read Lab 4 Procedure (Web)
                                    </Button>
                                    <Button 
                                        variant="outline-secondary" 
                                        size="sm"
                                        onClick={() => window.open('https://pidlab2026.shop/docs/Lab_4.md', '_blank')}
                                    >
                                        📄 View Raw Lab 4 Markdown
                                    </Button>
                                </div>
                                <p className="mt-2 mb-0 x-small text-muted" style={{ fontSize: '0.7rem' }}>
                                    Recommended: Read the procedure before your session.
                                </p>
                            </Card.Body>
                        </Card>
                    </div>
                    <div className="text-center mt-3">
                        <small className="text-muted">Protected by Supabase Auth</small>
                    </div>
                </Col>
            </Row>
        </Container>
    );
};

export default Login;
