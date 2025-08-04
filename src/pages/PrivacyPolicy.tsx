import React from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Container,
  Paper,
  Button
} from "@mui/material";
import { ArrowBack } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const accent = "#FF7043";
const textColor = "#202020";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", background: "#f8f9fa", py: 4 }}>
      <CssBaseline />
      
      <Container maxWidth="md">
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", mb: 4 }}>
          <Button
            onClick={() => navigate(-1)}
            startIcon={<ArrowBack />}
            sx={{
              color: accent,
              textTransform: "none",
              mr: 2,
              "&:hover": { background: "transparent" }
            }}
          >
            Back
          </Button>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <span role="img" aria-label="briefcase" style={{ fontSize: 24 }}>💼</span>
            <Typography variant="h5" sx={{ color: accent, fontWeight: 700 }}>
              OnlyJobs
            </Typography>
          </Box>
        </Box>

        {/* Content */}
        <Paper sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h4" sx={{ color: textColor, fontWeight: 700, mb: 3 }}>
            Privacy Policy
          </Typography>
          
          <Typography variant="body2" sx={{ color: "#666", mb: 4 }}>
            Last updated: {new Date().toLocaleDateString()}
          </Typography>

          {/* Introduction */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            1. Introduction
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            OnlyJobs ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our job application tracking service.
          </Typography>

          {/* Information We Collect */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            2. Information We Collect
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 2, lineHeight: 1.6 }}>
            <strong>Personal Information:</strong>
            <br />• Name and email address
            <br />• Account credentials
            <br />• Profile information you provide
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 2, lineHeight: 1.6 }}>
            <strong>Email Data (with your permission):</strong>
            <br />• Job application emails from your Gmail account
            <br />• Company names and job titles
            <br />• Application dates and status information
            <br />• Email metadata (sender, subject, date)
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            <strong>Usage Information:</strong>
            <br />• How you interact with our service
            <br />• Device information and IP address
            <br />• Browser type and version
          </Typography>

          {/* How We Use Information */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            3. How We Use Your Information
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We use your information to:
            <br />• Provide and maintain our job tracking service
            <br />• Analyze your emails to extract job application data
            <br />• Generate insights and analytics about your job search
            <br />• Communicate with you about your account
            <br />• Improve our service and develop new features
            <br />• Comply with legal obligations
          </Typography>

          {/* Gmail Integration */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            4. Gmail Integration & AI Processing
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            When you connect your Gmail account:
            <br />• We only access emails related to job applications
            <br />• We use Google Vertex AI to automatically classify and extract job-related information
            <br />• Processed data is stored securely in Google Cloud Platform
            <br />• You can disconnect Gmail access at any time
            <br />• We do not read personal or non-job-related emails
          </Typography>

          {/* Data Storage and Security */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            5. Data Storage and Security
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Your data is stored securely using:
            <br />• Google Cloud Platform infrastructure
            <br />• Encryption in transit and at rest
            <br />• Firebase Authentication for secure access
            <br />• Regular security audits and monitoring
            <br />• Access controls and data minimization practices
          </Typography>

          {/* Data Sharing */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            6. Data Sharing and Disclosure
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We do not sell, trade, or rent your personal information to third parties. We may share your information only:
            <br />• With your explicit consent
            <br />• To comply with legal requirements
            <br />• To protect our rights and safety
            <br />• With service providers who help us operate our platform (under strict confidentiality agreements)
          </Typography>

          {/* Your Rights */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            7. Your Rights and Choices
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            You have the right to:
            <br />• Access and review your personal information
            <br />• Correct inaccurate or incomplete data
            <br />• Delete your account and associated data
            <br />• Disconnect Gmail integration
            <br />• Opt out of non-essential communications
            <br />• Export your data in a portable format
          </Typography>

          {/* Data Retention */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            8. Data Retention
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We retain your information only as long as necessary to provide our services or as required by law. When you delete your account, we will delete your personal information within 30 days, except where retention is required for legal compliance.
          </Typography>

          {/* Cookies */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            9. Cookies and Tracking
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We use cookies and similar technologies to:
            <br />• Maintain your login session
            <br />• Remember your preferences
            <br />• Analyze usage patterns
            <br />• Improve our service performance
            <br />You can control cookies through your browser settings.
          </Typography>

          {/* Children's Privacy */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            10. Children's Privacy
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Our service is not intended for children under 18. We do not knowingly collect personal information from children under 18. If we become aware of such collection, we will delete the information immediately.
          </Typography>

          {/* International Users */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            11. International Data Transfers
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
          </Typography>

          {/* Changes to Policy */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            12. Changes to This Privacy Policy
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by updating the "Last updated" date and posting the new policy on our website.
          </Typography>

          {/* Contact Information */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            13. Contact Us
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 4, lineHeight: 1.6 }}>
            If you have any questions about this Privacy Policy or our data practices, please contact us at:
            <br />• Email: privacy@onlyjobs.com
            <br />• Address: [Company Address]
          </Typography>

          {/* Footer */}
          <Box sx={{ borderTop: "1px solid #eee", pt: 3, mt: 4 }}>
            <Typography variant="body2" sx={{ color: "#666", textAlign: "center" }}>
              © {new Date().getFullYear()} OnlyJobs. All rights reserved.
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}