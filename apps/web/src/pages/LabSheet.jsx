import React from 'react';
import MarkdownView from '../components/MarkdownView';
import { useLocation } from 'react-router-dom';

const LabSheet = () => {
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const labNumber = query.get('lab') || '4';
    
    // Determine path based on which lab is requested
    const docPath = `/docs/Lab_${labNumber}.md`;
    const backPath = location.state?.from || '/dashboard';

    return (
        <MarkdownView 
            docPath={docPath} 
            title={`Lab ${labNumber} Procedure`} 
            backPath={backPath}
        />
    );
};

export default LabSheet;
