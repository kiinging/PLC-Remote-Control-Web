import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { Container, Spinner, Alert, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const MarkdownView = ({ docPath, title, backPath = "/dashboard" }) => {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDoc = async () => {
            try {
                const response = await fetch(docPath);
                if (!response.ok) throw new Error('Document not found');
                let text = await response.text();
                
                // Smart Path Resolution: 
                // Converts local relative paths (./images/) to web absolute paths (/docs/images/)
                // This ensures images work in BOTH local previews and the web dashboard.
                const processed = text.replace(/src=["']\.\/images\//g, (match) => match.replace('./images/', '/docs/images/'))
                                      .replace(/\(\.\/images\//g, '(/docs/images/');
                
                setContent(processed);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDoc();
    }, [docPath]);

    if (loading) {
        return (
            <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
                <Spinner animation="border" variant="primary" />
            </Container>
        );
    }

    if (error) {
        return (
            <Container className="py-5">
                <Alert variant="danger">
                    Error loading document: {error}
                </Alert>
                <Button variant="outline-primary" onClick={() => navigate(backPath)}>Go Back</Button>
            </Container>
        );
    }

    return (
        <Container className="py-5" style={{ maxWidth: '850px' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <Button variant="outline-secondary" size="sm" onClick={() => navigate(backPath)}>
                    ← Back
                </Button>
                {/* PDF Link - Dynamically generated based on docPath */}
                <Button 
                    variant="outline-danger" 
                    size="sm" 
                    onClick={() => {
                        const labMatch = docPath.match(/Lab_(\d+)/);
                        const labNum = labMatch ? labMatch[1] : '4';
                        window.open(`https://hdngzewkkqzzrxxlunfo.supabase.co/storage/v1/object/public/lab-sheet/Lab_${labNum}.pdf`, "_blank");
                    }}
                >
                    Download PDF
                </Button>
            </div>
            
            <div className="bg-body p-4 p-md-5 rounded shadow-sm markdown-body border">
                <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                >
                    {content}
                </ReactMarkdown>
            </div>
            
            <div className="mt-5 text-center text-muted small">
                <p>&copy; 2026 Industrial Automated Systems. Remote PID Lab.</p>
            </div>

            {/* Custom styles for markdown-body if needed */}
            <style>{`
                .markdown-body img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 1.5rem 0;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                }
                .markdown-body table {
                    width: 100%;
                    margin-bottom: 1rem;
                    border-collapse: collapse;
                }
                .markdown-body th, .markdown-body td {
                    border: 1px solid #dee2e6;
                    padding: 0.75rem;
                }
                .markdown-body th {
                    background-color: rgba(0,0,0,0.05);
                }
                .markdown-body blockquote {
                    border-left: 4px solid #0d6efd;
                    padding-left: 1rem;
                    color: #6c757d;
                }
            `}</style>
        </Container>
    );
};

export default MarkdownView;
