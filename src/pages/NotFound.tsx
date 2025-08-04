import React from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Container
} from "@mui/material";
import { SearchOff, Home, Dashboard } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

export default function NotFound() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh", background: white, display: "flex", alignItems: "center" }}>
      <CssBaseline />
      
      <Container maxWidth="sm">
        <Box sx={{ textAlign: "center" }}>
          {/* Header */}
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 4 }}>
            <span role="img" aria-label="briefcase" style={{ fontSize: 32 }}>💼</span>
            <Typography variant="h4" sx={{ color: accent, fontWeight: 700 }}>
              OnlyJobs
            </Typography>
          </Box>

          {/* 404 Icon */}
          <Box sx={{ mb: 3 }}>
            <SearchOff sx={{ fontSize: 80, color: "#ccc" }} />
          </Box>

          {/* Error Message */}
          <Typography variant="h1" sx={{ color: textColor, fontWeight: 700, mb: 2, fontSize: "4rem" }}>
            404
          </Typography>
          
          <Typography variant="h5" sx={{ color: textColor, fontWeight: 600, mb: 2 }}>
            Page Not Found
          </Typography>
          
          <Typography variant="body1" sx={{ color: "#666", mb: 4, maxWidth: 400, mx: "auto" }}>
            Sorry, the page you're looking for doesn't exist. It might have been moved, deleted, or you entered the wrong URL.
          </Typography>

          {/* Action Buttons */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 300, mx: "auto" }}>
            {currentUser ? (
              <Button
                variant="contained"
                size="large"
                onClick={() => navigate("/dashboard")}
                startIcon={<Dashboard />}
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
                Go to Dashboard
              </Button>
            ) : null}

            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate("/")}
              startIcon={<Home />}
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
              Back to Home
            </Button>
          </Box>

          {/* Help Text */}
          <Box sx={{ mt: 4, p: 3, bgcolor: "#f8f9fa", borderRadius: 2 }}>
            <Typography variant="body2" sx={{ color: "#666" }}>
              <strong>Need help?</strong>
              <br />
              If you think this is a mistake, try refreshing the page or checking the URL for typos.
            </Typography>
          </Box>
        </Box>
      </Container>
    </Box>
  );
} 