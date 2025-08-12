/**
 * Analytics Service - Data processing and statistics for job applications
 */

import { JobApplication } from '../types/api.types';

export interface JobStats {
  totalApplications: number;
  appliedCount: number;
  interviewedCount: number;
  offerCount: number;
  declinedCount: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
}

export interface TimeSeriesData {
  date: string;
  applications: number;
  interviews: number;
  offers: number;
  rejections: number;
}

export interface PipelineData {
  stage: string;
  count: number;
  percentage: number;
  color: string;
}

export interface CompanyStats {
  company: string;
  applications: number;
  interviews: number;
  offers: number;
  responseRate: number;
}

class AnalyticsService {
  /**
   * Calculate overall job application statistics
   */
  calculateJobStats(jobs: JobApplication[]): JobStats {
    const total = jobs.length;
    const appliedCount = jobs.filter(job => job.status === 'Applied').length;
    const interviewedCount = jobs.filter(job => job.status === 'Interviewed').length;
    const offerCount = jobs.filter(job => job.status === 'Offer').length;
    const declinedCount = jobs.filter(job => job.status === 'Declined').length;

    const responseRate = total > 0 ? ((interviewedCount + offerCount + declinedCount) / total) * 100 : 0;
    const interviewRate = total > 0 ? (interviewedCount / total) * 100 : 0;
    const offerRate = total > 0 ? (offerCount / total) * 100 : 0;

    return {
      totalApplications: total,
      appliedCount,
      interviewedCount,
      offerCount,
      declinedCount,
      responseRate: Math.round(responseRate * 10) / 10,
      interviewRate: Math.round(interviewRate * 10) / 10,
      offerRate: Math.round(offerRate * 10) / 10,
    };
  }

  /**
   * Generate time series data for application trends
   */
  generateTimeSeriesData(jobs: JobApplication[], days: number = 30): TimeSeriesData[] {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const dateMap = new Map<string, TimeSeriesData>();

    // Initialize all dates with zero values
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dateMap.set(dateStr, {
        date: dateStr,
        applications: 0,
        interviews: 0,
        offers: 0,
        rejections: 0,
      });
    }

    // Populate actual data
    jobs.forEach(job => {
      const appliedDate = new Date(job.appliedDate);
      if (appliedDate >= startDate && appliedDate <= endDate) {
        const dateStr = appliedDate.toISOString().split('T')[0];
        const data = dateMap.get(dateStr);
        if (data) {
          data.applications++;
          
          if (job.status === 'Interviewed') data.interviews++;
          if (job.status === 'Offer') data.offers++;
          if (job.status === 'Declined') data.rejections++;
        }
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Generate pipeline visualization data
   */
  generatePipelineData(jobs: JobApplication[]): PipelineData[] {
    const stats = this.calculateJobStats(jobs);
    const total = stats.totalApplications;

    if (total === 0) {
      return [
        { stage: 'Applied', count: 0, percentage: 0, color: '#2196F3' },
        { stage: 'Interviewed', count: 0, percentage: 0, color: '#FF9800' },
        { stage: 'Offer', count: 0, percentage: 0, color: '#9C27B0' },
        { stage: 'Declined', count: 0, percentage: 0, color: '#F44336' },
      ];
    }

    return [
      {
        stage: 'Applied',
        count: stats.appliedCount,
        percentage: Math.round((stats.appliedCount / total) * 100),
        color: '#2196F3'
      },
      {
        stage: 'Interviewed',
        count: stats.interviewedCount,
        percentage: Math.round((stats.interviewedCount / total) * 100),
        color: '#FF9800'
      },
      {
        stage: 'Offer',
        count: stats.offerCount,
        percentage: Math.round((stats.offerCount / total) * 100),
        color: '#9C27B0'
      },
      {
        stage: 'Declined',
        count: stats.declinedCount,
        percentage: Math.round((stats.declinedCount / total) * 100),
        color: '#F44336'
      },
    ];
  }

  /**
   * Generate company-wise statistics
   */
  generateCompanyStats(jobs: JobApplication[]): CompanyStats[] {
    const companyMap = new Map<string, { 
      applications: number; 
      interviews: number; 
      offers: number; 
    }>();

    jobs.forEach(job => {
      if (!companyMap.has(job.company)) {
        companyMap.set(job.company, { applications: 0, interviews: 0, offers: 0 });
      }
      
      const stats = companyMap.get(job.company)!;
      stats.applications++;
      
      if (job.status === 'Interviewed') stats.interviews++;
      if (job.status === 'Offer') stats.offers++;
    });

    const companyStats: CompanyStats[] = Array.from(companyMap.entries()).map(([company, stats]) => ({
      company,
      applications: stats.applications,
      interviews: stats.interviews,
      offers: stats.offers,
      responseRate: Math.round((stats.interviews / stats.applications) * 100),
    }));

    // Sort by applications count (descending)
    return companyStats.sort((a, b) => b.applications - a.applications);
  }

  /**
   * Get applications from the last N days
   */
  getRecentApplications(jobs: JobApplication[], days: number): JobApplication[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return jobs.filter(job => new Date(job.appliedDate) >= cutoffDate);
  }

  /**
   * Calculate weekly application trend
   */
  getWeeklyTrend(jobs: JobApplication[]): { change: number; isIncrease: boolean } {
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(now.getDate() - 14);

    const thisWeek = jobs.filter(job => 
      new Date(job.appliedDate) >= oneWeekAgo && new Date(job.appliedDate) <= now
    ).length;

    const lastWeek = jobs.filter(job => 
      new Date(job.appliedDate) >= twoWeeksAgo && new Date(job.appliedDate) < oneWeekAgo
    ).length;

    if (lastWeek === 0) {
      return { change: thisWeek > 0 ? 100 : 0, isIncrease: thisWeek > 0 };
    }

    const change = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    return { change: Math.abs(change), isIncrease: change >= 0 };
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;