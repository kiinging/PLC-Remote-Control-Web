import { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Badge } from 'react-bootstrap';
import { getUsers, deleteUser } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function Admin() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // Basic protection (ideally role-based on backend too, which we have)
        // if (user !== 'admin') {
        //  navigate('/dashboard');
        //  return;
        // }
        fetchUsers();
    }, [user]);

    const fetchUsers = async () => {
        try {
            const data = await getUsers();
            setUsers(data.users || []);
        } catch (err) {
            setError("Failed to fetch users");
        }
    };

    const handleDelete = async (username) => {
        if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;
        try {
            await deleteUser(username);
            setSuccess(`User ${username} deleted.`);
            fetchUsers();
        } catch (err) {
            setError("Failed to delete user");
        }
    };

    return (
        <Container className="mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2>Admin Dashboard</h2>
                <div className="d-flex gap-2">
                    <ThemeToggle />
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
                </div>
            </div>

            {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
            {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

            <Card>
                <Card.Header as="h5">User Management</Card.Header>
                <Card.Body>
                    <Table striped bordered hover responsive>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Username</th>
                                <th>Role</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u, idx) => (
                                <tr key={u}>
                                    <td>{idx + 1}</td>
                                    <td>{u}</td>
                                    <td>
                                        {u === 'admin' ? <Badge bg="danger">Admin</Badge> : <Badge bg="primary">Student</Badge>}
                                    </td>
                                    <td>
                                        {u !== 'admin' && u !== user && (
                                            <Button variant="danger" size="sm" onClick={() => handleDelete(u)}>Delete</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </Container>
    );
}
