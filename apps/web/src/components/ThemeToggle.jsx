import { Button } from 'react-bootstrap';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle({ className = '' }) {
    const { theme, toggleTheme } = useTheme();

    return (
        <Button
            variant={theme === 'light' ? 'outline-dark' : 'outline-light'}
            onClick={toggleTheme}
            className={`d-flex align-items-center justify-content-center p-2 rounded-circle ${className}`}
            style={{ width: '38px', height: '38px' }}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
            {theme === 'light' ? '🌙' : '☀️'}
        </Button>
    );
}
