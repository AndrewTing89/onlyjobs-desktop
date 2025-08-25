import React from 'react';
import { Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import { ModelComparison } from '../components/ModelComparison';

const ModelTestingPage: React.FC = () => {
  const location = useLocation();
  
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar Navigation */}
      <Sidebar currentPath={location.pathname} />
      
      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <ModelComparison />
      </Box>
    </Box>
  );
};

export default ModelTestingPage;