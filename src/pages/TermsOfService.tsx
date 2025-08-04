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

export default function TermsOfService() {
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
            Terms of Service
          </Typography>
          
          <Typography variant="body2" sx={{ color: "#666", mb: 4 }}>
            Last updated: {new Date().toLocaleDateString()}
          </Typography>

          {/* Introduction */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            1. Introduction
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Welcome to OnlyJobs ("we," "our," or "us"). These Terms of Service ("Terms") govern your use of our job application tracking service, including our website and mobile applications (the "Service").
          </Typography>

          {/* Acceptance */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            2. Acceptance of Terms
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, then you may not access the Service.
          </Typography>

          {/* Account Registration */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            3. Account Registration
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            To use certain features of our Service, you must register for an account. You agree to:
            <br />• Provide accurate, current, and complete information
            <br />• Maintain and update your information
            <br />• Keep your account credentials secure
            <br />• Accept responsibility for all activities under your account
          </Typography>

          {/* Use of Service */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            4. Use of Service
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            You may use our Service only for lawful purposes and in accordance with these Terms. You agree not to:
            <br />• Violate any applicable laws or regulations
            <br />• Transmit any harmful, offensive, or inappropriate content
            <br />• Attempt to gain unauthorized access to our systems
            <br />• Use automated systems to access the Service without permission
          </Typography>

          {/* Gmail Integration */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            5. Gmail Integration
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Our Service integrates with Gmail to help track job applications. By connecting your Gmail account, you grant us permission to:
            <br />• Read your email messages to identify job-related communications
            <br />• Extract relevant information for tracking purposes
            <br />• Store this information securely in our systems
            <br />You can revoke this access at any time through your account settings.
          </Typography>

          {/* Data and Privacy */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            6. Data and Privacy
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference.
          </Typography>

          {/* Intellectual Property */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            7. Intellectual Property
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            The Service and its original content, features, and functionality are owned by OnlyJobs and are protected by international copyright, trademark, and other intellectual property laws.
          </Typography>

          {/* Limitation of Liability */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            8. Limitation of Liability
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            In no event shall OnlyJobs be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or other intangible losses.
          </Typography>

          {/* Termination */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            9. Termination
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We may terminate or suspend your account and access to the Service immediately, without prior notice, if you breach these Terms.
          </Typography>

          {/* Changes to Terms */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            10. Changes to Terms
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 3, lineHeight: 1.6 }}>
            We reserve the right to modify these Terms at any time. We will notify users of material changes by updating the "Last updated" date at the top of this page.
          </Typography>

          {/* Contact Information */}
          <Typography variant="h6" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            11. Contact Information
          </Typography>
          <Typography variant="body1" sx={{ color: textColor, mb: 4, lineHeight: 1.6 }}>
            If you have any questions about these Terms, please contact us at legal@onlyjobs.com
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