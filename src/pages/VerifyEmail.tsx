import React, { useState, useEffect } from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  Alert,
  CircularProgress
} from "@mui/material";
import { Email, CheckCircle, Refresh } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth, getAuthErrorMessage } from "../contexts/AuthContext";
import { AuthError } from "firebase/auth";

const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { currentUser, logout, sendVerificationEmail, isEmailVerified } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Auto-redirect if email is verified
  useEffect(() => {
    if (isEmailVerified) {
      navigate("/dashboard");
    }
  }, [isEmailVerified, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    try {
      setError("");
      setMessage("");
      setLoading(true);
      await sendVerificationEmail();
      setMessage("Verification email sent! Please check your inbox and spam folder.");
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <Box sx={{ minHeight: "100vh", background: white, display: "flex", alignItems: "center" }}>
      <CssBaseline />
      
      <Container maxWidth="sm">
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 2 }}>
            <span role="img" aria-label="briefcase" style={{ fontSize: 32 }}>💼</span>
            <Typography variant="h4" sx={{ color: accent, fontWeight: 700 }}>
              OnlyJobs
            </Typography>
          </Box>
        </Box>

        {/* Verification Card */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 3, overflow: "visible" }}>
          <CardContent sx={{ p: 4, textAlign: "center" }}>
            {/* Email Icon */}
            <Box sx={{ mb: 3 }}>
              <Email sx={{ fontSize: 64, color: accent }} />
            </Box>

            <Typography variant="h5" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
              Verify Your Email
            </Typography>
            
            <Typography variant="body1" sx={{ color: "#666", mb: 3, lineHeight: 1.6 }}>
              We've sent a verification email to{" "}
              <strong>{currentUser?.email}</strong>
              <br />
              Please check your inbox and click the verification link to complete your account setup.
            </Typography>

            {message && (
              <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
                {message}
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {/* Action Buttons */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleRefresh}
                startIcon={<CheckCircle />}
                sx={{
                  background: accent,
                  borderRadius: 2,
                  py: 1.5,
                  fontSize: 16,
                  textTransform: "none",
                  boxShadow: "none",
                  "&:hover": {
                    background: accent,
                    boxShadow: "none",
                  },
                }}
              >
                I've Verified My Email
              </Button>

              <Button
                fullWidth
                variant="outlined"
                size="large"
                onClick={handleResendEmail}
                disabled={loading || resendCooldown > 0}
                startIcon={loading ? <CircularProgress size={20} /> : <Refresh />}
                sx={{
                  borderColor: accent,
                  color: accent,
                  borderRadius: 2,
                  py: 1.5,
                  fontSize: 16,
                  textTransform: "none",
                  "&:hover": {
                    borderColor: accent,
                    background: `${accent}05`,
                  },
                }}
              >
                {resendCooldown > 0 
                  ? `Resend Email (${resendCooldown}s)`
                  : loading 
                    ? "Sending..."
                    : "Resend Verification Email"
                }
              </Button>
            </Box>

            {/* Help Text */}
            <Typography variant="body2" sx={{ color: "#666", mb: 3 }}>
              Can't find the email? Check your spam folder or try a different email address.
            </Typography>

            {/* Logout Option */}
            <Typography variant="body2" sx={{ color: "#666" }}>
              Wrong email address?{" "}
              <Button
                variant="text"
                onClick={handleLogout}
                sx={{
                  color: accent,
                  textTransform: "none",
                  minWidth: "auto",
                  p: 0,
                  fontSize: "inherit",
                  "&:hover": {
                    background: "transparent",
                    textDecoration: "underline",
                  },
                }}
              >
                Sign out and try again
              </Button>
            </Typography>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Box sx={{ mt: 3, p: 3, bgcolor: "#f8f9fa", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ color: "#666", textAlign: "center" }}>
            <strong>Next steps:</strong>
            <br />
            1. Check your email inbox (and spam folder)
            <br />
            2. Click the verification link in the email
            <br />
            3. Return here and click "I've Verified My Email"
          </Typography>
        </Box>
      </Container>
    </Box>
  );
} 