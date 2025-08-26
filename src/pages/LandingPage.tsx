import React from "react";
import {
  Box,
  CssBaseline,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
  AppBar,
  Toolbar
} from "@mui/material";
import { Assignment, BarChart, Email, Speed } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

const sidebarColor = "#FFD7B5";
const accent = "#FF7043";
const white = "#fff";
const textColor = "#202020";

const features = [
  {
    icon: <Email sx={{ fontSize: 40, color: accent }} />,
    title: "Email Integration",
    description: "Automatically track job applications from your Gmail"
  },
  {
    icon: <Assignment sx={{ fontSize: 40, color: accent }} />,
    title: "Application Tracking",
    description: "Keep track of all your job applications in one place"
  },
  {
    icon: <BarChart sx={{ fontSize: 40, color: accent }} />,
    title: "Analytics & Insights",
    description: "Visualize your job search progress with charts and graphs"
  },
  {
    icon: <Speed sx={{ fontSize: 40, color: accent }} />,
    title: "Smart Automation",
    description: "Let AI organize and categorize your applications automatically"
  }
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", background: white }}>
      <CssBaseline />
      
      {/* Navigation Bar */}
      <AppBar elevation={0} position="static" sx={{ background: "transparent", boxShadow: "none" }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <span role="img" aria-label="briefcase" style={{ fontSize: 28 }}>💼</span>
            <Typography variant="h5" sx={{ color: accent, fontWeight: 700 }}>
              OnlyJobs
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={() => navigate("/login")}
              sx={{ 
                borderColor: accent, 
                color: accent, 
                borderRadius: 2, 
                textTransform: "none",
                "&:hover": { borderColor: accent, background: `${accent}10` }
              }}
            >
              Sign In
            </Button>
            <Button 
              variant="contained" 
              onClick={() => navigate("/signup")}
              sx={{ 
                background: accent, 
                borderRadius: 2, 
                boxShadow: "none", 
                textTransform: "none",
                "&:hover": { background: accent }
              }}
            >
              Get Started
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Box sx={{ textAlign: "center", mb: 8 }}>
          <Typography 
            variant="h2" 
            sx={{ 
              color: textColor, 
              fontWeight: 700, 
              mb: 3,
              fontSize: { xs: "2.5rem", md: "3.5rem" }
            }}
          >
            Streamline Your Job Search
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: "#666", 
              mb: 4, 
              maxWidth: 600, 
              mx: "auto",
              fontSize: { xs: "1.2rem", md: "1.5rem" }
            }}
          >
            Track applications, analyze progress, and never miss an opportunity with our intelligent job search assistant
          </Typography>
          <Button 
            variant="contained" 
            size="large"
            onClick={() => navigate("/signup")}
            sx={{ 
              background: accent, 
              borderRadius: 3, 
              px: 4, 
              py: 2, 
              fontSize: 18,
              boxShadow: "none", 
              textTransform: "none",
              "&:hover": { background: accent }
            }}
          >
            Start Tracking Applications
          </Button>
        </Box>

        {/* Features Grid */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mb: 8 }}>
          {features.map((feature, index) => (
            <Card 
              key={index}
              sx={{ 
                bgcolor: "#FFF7F1", 
                borderRadius: 3, 
                boxShadow: "none", 
                flex: "1 1 250px",
                minWidth: 250,
                textAlign: "center",
                p: 2
              }}
            >
              <CardContent>
                <Box sx={{ mb: 2 }}>
                  {feature.icon}
                </Box>
                <Typography 
                  variant="h6" 
                  sx={{ color: textColor, fontWeight: 600, mb: 1 }}
                >
                  {feature.title}
                </Typography>
                <Typography 
                  variant="body2" 
                  sx={{ color: "#666" }}
                >
                  {feature.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* CTA Section */}
        <Box 
          sx={{ 
            bgcolor: sidebarColor, 
            borderRadius: 4, 
            p: 6, 
            textAlign: "center" 
          }}
        >
          <Typography 
            variant="h4" 
            sx={{ color: textColor, fontWeight: 700, mb: 2 }}
          >
            Ready to Get Organized?
          </Typography>
          <Typography 
            variant="h6" 
            sx={{ color: "#666", mb: 4 }}
          >
            Join thousands of job seekers who have streamlined their search process
          </Typography>
          <Button 
            variant="contained" 
            size="large"
            onClick={() => navigate("/signup")}
            sx={{ 
              background: accent, 
              borderRadius: 3, 
              px: 4, 
              py: 2, 
              fontSize: 18,
              boxShadow: "none", 
              textTransform: "none",
              "&:hover": { background: accent }
            }}
          >
            Get Started Free
          </Button>
        </Box>
      </Container>
    </Box>
  );
} 