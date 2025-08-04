import React, { useState } from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  TextField,
  Alert,
  CircularProgress,
  Link
} from "@mui/material";
import { LockReset } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth, getAuthErrorMessage } from "../contexts/AuthContext";
import { AuthError } from "firebase/auth";

const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    try {
      setError("");
      setMessage("");
      setLoading(true);
      await resetPassword(email);
      setMessage("Password reset email sent! Check your inbox for instructions.");
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
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
          <Typography variant="h5" sx={{ color: textColor, fontWeight: 600, mb: 1 }}>
            Reset Your Password
          </Typography>
          <Typography variant="body1" sx={{ color: "#666" }}>
            Enter your email address and we'll send you a link to reset your password
          </Typography>
        </Box>

        {/* Reset Card */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 3, overflow: "visible" }}>
          <CardContent sx={{ p: 4 }}>
            {/* Lock Icon */}
            <Box sx={{ textAlign: "center", mb: 3 }}>
              <LockReset sx={{ fontSize: 48, color: accent }} />
            </Box>

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

            {/* Reset Form */}
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: accent,
                    },
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: accent,
                  },
                }}
              />

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
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
                {loading ? <CircularProgress size={24} color="inherit" /> : "Send Reset Email"}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Navigation Links */}
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Typography variant="body2" sx={{ color: "#666" }}>
            Remember your password?{" "}
            <Link
              component="button"
              type="button"
              onClick={() => navigate("/login")}
              sx={{
                color: accent,
                textDecoration: "none",
                fontWeight: 600,
                "&:hover": { textDecoration: "underline" }
              }}
            >
              Sign in here
            </Link>
          </Typography>
        </Box>

        <Box sx={{ textAlign: "center", mt: 2 }}>
          <Link
            component="button"
            type="button"
            onClick={() => navigate("/")}
            sx={{
              color: "#666",
              textDecoration: "none",
              fontSize: 14,
              "&:hover": { textDecoration: "underline" }
            }}
          >
            ← Back to Home
          </Link>
        </Box>
      </Container>
    </Box>
  );
} 