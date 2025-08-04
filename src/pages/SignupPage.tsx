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
  Divider,
  Alert,
  CircularProgress,
  Link,
  Checkbox,
  FormControlLabel
} from "@mui/material";
import { Google, Apple } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth, getAuthErrorMessage } from "../contexts/AuthContext";
import { AuthError } from "firebase/auth";

const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup, loginWithGoogle, loginWithApple } = useAuth();
  
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Check if running in Electron
  const isElectron = window.electronAPI !== undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.displayName || !formData.email || !formData.password || !formData.confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!acceptTerms) {
      setError("Please accept the Terms of Service and Privacy Policy");
      return;
    }

    try {
      setError("");
      setLoading(true);
      await signup(formData.email, formData.password, formData.displayName);
      navigate("/verify-email");
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (!acceptTerms) {
      setError("Please accept the Terms of Service and Privacy Policy");
      return;
    }

    try {
      setError("");
      setLoading(true);
      await loginWithGoogle();
      navigate("/dashboard");
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignup = async () => {
    if (!acceptTerms) {
      setError("Please accept the Terms of Service and Privacy Policy");
      return;
    }

    try {
      setError("");
      setLoading(true);
      await loginWithApple();
      navigate("/dashboard");
    } catch (err) {
      setError(getAuthErrorMessage(err as AuthError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", background: white, display: "flex", alignItems: "center", py: 4 }}>
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
            Create Your Account
          </Typography>
          <Typography variant="body1" sx={{ color: "#666" }}>
            Start tracking your job applications with AI-powered insights
          </Typography>
        </Box>

        {/* Signup Card */}
        <Card sx={{ bgcolor: white, borderRadius: 3, boxShadow: 3, overflow: "visible" }}>
          <CardContent sx={{ p: 4 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}
            
            {isElectron && (
              <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                <Typography variant="body2" fontWeight="bold" mb={1}>
                  🖥️ Desktop App Setup
                </Typography>
                <Typography variant="body2">
                  Create an account using the same email address you use with Google. This allows the desktop app to access your job data.
                </Typography>
              </Alert>
            )}

            {/* Social Signup Buttons */}
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={handleGoogleSignup}
              disabled={loading}
              startIcon={<Google />}
              sx={{
                borderColor: "#ddd",
                color: textColor,
                borderRadius: 2,
                py: 1.5,
                mb: 2,
                textTransform: "none",
                fontSize: 16,
                "&:hover": {
                  borderColor: accent,
                  background: `${accent}05`
                }
              }}
            >
              {loading ? <CircularProgress size={24} /> : "Continue with Google"}
            </Button>

            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={handleAppleSignup}
              disabled={loading}
              startIcon={<Apple />}
              sx={{
                borderColor: "#ddd",
                color: textColor,
                borderRadius: 2,
                py: 1.5,
                mb: 3,
                textTransform: "none",
                fontSize: 16,
                "&:hover": {
                  borderColor: accent,
                  background: `${accent}05`
                }
              }}
            >
              {loading ? <CircularProgress size={24} /> : "Continue with Apple"}
            </Button>

            <Divider sx={{ my: 3 }}>
              <Typography variant="body2" sx={{ color: "#666", px: 2 }}>
                or
              </Typography>
            </Divider>

            {/* Email Signup Form */}
            <Box component="form" onSubmit={handleEmailSignup}>
              <TextField
                fullWidth
                label="Full Name"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
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

              <TextField
                fullWidth
                label="Email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
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
              
              <TextField
                fullWidth
                label="Password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                helperText="Minimum 6 characters"
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

              <TextField
                fullWidth
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
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

              <FormControlLabel
                control={
                  <Checkbox
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    sx={{
                      color: accent,
                      "&.Mui-checked": {
                        color: accent,
                      },
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ color: "#666" }}>
                    I accept the{" "}
                    <Link 
                      component="button"
                      type="button"
                      onClick={() => navigate("/terms")}
                      sx={{ color: accent, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link 
                      component="button"
                      type="button"
                      onClick={() => navigate("/privacy")}
                      sx={{ color: accent, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                    >
                      Privacy Policy
                    </Link>
                  </Typography>
                }
                sx={{ mb: 3 }}
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
                {loading ? <CircularProgress size={24} color="inherit" /> : "Create Account"}
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Sign In Link */}
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Typography variant="body2" sx={{ color: "#666" }}>
            Already have an account?{" "}
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

        {/* Back to Home */}
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