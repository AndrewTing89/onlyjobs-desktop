import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
} from "@mui/material";
import { onlyJobsTheme } from '../theme';

// Import existing components - same as main Dashboard
import JobsList from "./JobsList";

// Import analytics components
import QuickStats from "./analytics/QuickStats";
import analyticsService, { JobStats } from "../services/analytics.service";

interface ModelDashboardProps {
  modelId: string;
  modelName: string;
}

export default function ModelDashboard({ modelId, modelName }: ModelDashboardProps) {
  const isElectron = !!window.electronAPI;
  
  // Analytics state - same as Dashboard
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobStats, setJobStats] = useState<JobStats>({
    totalApplications: 0,
    appliedCount: 0,
    interviewedCount: 0,
    offerCount: 0,
    declinedCount: 0,
    responseRate: 0,
    interviewRate: 0,
    offerRate: 0,
  });
  const [weeklyTrend, setWeeklyTrend] = useState({ change: 0, isIncrease: false });

  // Load jobs for this specific model
  useEffect(() => {
    const loadJobs = async () => {
      if (isElectron && window.electronAPI) {
        try {
          // Use model-specific handler instead of generic getJobs
          const jobsData = await window.electronAPI.getJobsForModel(modelId);
          setJobs(jobsData);
          
          // Transform and calculate stats - same as Dashboard
          const transformedJobs = jobsData.map((job: any) => ({
            id: job.id?.toString() || Math.random().toString(),
            userId: job.userId || 'electron-user',
            company: job.company || 'Unknown Company',
            jobTitle: job.position || job.jobTitle || 'Unknown Position',
            location: job.location || 'Unknown Location',
            status: job.status || 'Applied',
            appliedDate: new Date(job.applied_date || job.appliedDate || job.tested_at || Date.now()),
            lastUpdated: new Date(job.updated_at || job.tested_at || Date.now()),
            source: 'gmail',
            emailId: job.gmail_message_id || job.emailId,
          }));
          
          const stats = analyticsService.calculateJobStats(transformedJobs);
          setJobStats(stats);
          
          const trend = analyticsService.getWeeklyTrend(transformedJobs);
          setWeeklyTrend(trend);
        } catch (error) {
          console.error('Failed to load jobs for model:', error);
        }
      }
    };
    
    loadJobs();
  }, [isElectron, modelId]);

  // Removed event listeners - ModelDashboard should not listen to global events
  // It gets refreshed when the parent component changes the key prop after clearing

  return (
    <>
      {/* Model Info Header */}
      <Box sx={{ mb: 3 }}>
        <Typography 
          variant="h4" 
          sx={{ 
            fontWeight: 600,
            color: onlyJobsTheme.palette.text.primary,
            mb: 1
          }}
        >
          {modelName} Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Showing job applications classified by {modelName}
        </Typography>
      </Box>

      {/* Analytics Overview - exact copy from Dashboard */}
      {jobStats.totalApplications > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography 
            variant="h2" 
            sx={{ 
              mb: 3, 
              fontWeight: 600,
              color: onlyJobsTheme.palette.text.primary 
            }}
          >
            Overview
          </Typography>
          <QuickStats stats={jobStats} weeklyTrend={weeklyTrend} />
        </Box>
      )}
      
      {/* Jobs List - exact copy from Dashboard */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography 
            variant="h3" 
            sx={{ 
              mb: 2, 
              fontWeight: 600,
              color: onlyJobsTheme.palette.text.primary 
            }}
          >
            Job Applications
          </Typography>
          <JobsList key={`${modelId}-${jobs.length}`} jobs={jobs} modelId={modelId} />
        </CardContent>
      </Card>
    </>
  );
}