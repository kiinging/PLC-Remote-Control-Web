import { supabase } from '../services/supabase';

export default function Signup() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (username.includes(' ')) {
            return setError("Username cannot contain spaces");
        }
        if (password !== confirmPassword) {
            return setError("Passwords do not match");
        }
        if (password.length < 4) {
            return setError("Password should be at least 4 characters");
        }

        try {
            setError('');
            setLoading(true);
            
            // Map username to dummy email for Supabase
            const email = `${username}@student.local`;
            
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) throw error;

            setSuccess("Account created! Redirecting to login...");
            setTimeout(() => navigate('/login'), 2000);
        } catch (err) {
            setError(err.message || 'Failed to create account');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container className="d-flex align-items-center justify-content-center vh-100 bg-light">
            <Card className="shadow p-4" style={{ maxWidth: '400px', width: '100%' }}>
                <Card.Body>
                    <h3 className="text-center mb-4">Create Account</h3>

                    {error && <Alert variant="danger">{error}</Alert>}
                    {success && <Alert variant="success">{success}</Alert>}

                    <Form onSubmit={handleSubmit}>
                        <Form.Group className="mb-3">
                            <Form.Label>Username</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Choose username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                placeholder="Create password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Form.Group className="mb-4">
                            <Form.Label>Confirm Password</Form.Label>
                            <Form.Control
                                type="password"
                                placeholder="Repeat password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </Form.Group>

                        <Button variant="success" type="submit" className="w-100" disabled={loading}>
                            {loading ? 'Creating...' : 'Sign Up'}
                        </Button>
                    </Form>

                    <div className="text-center mt-3 small">
                        Already have an account? <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>Login</a>
                    </div>
                </Card.Body>
            </Card>
        </Container>
    );
}
