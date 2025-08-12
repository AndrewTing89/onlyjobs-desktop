// GitHub repository details
const GITHUB_OWNER = 'ndting';
const GITHUB_REPO = 'onlyjobs-desktop';
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// Detect user's operating system
function detectOS() {
    const platform = navigator.platform.toLowerCase();
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (platform.includes('mac') || userAgent.includes('mac')) {
        // Check if it's Apple Silicon
        if (userAgent.includes('arm') || navigator.userAgent.includes('Apple')) {
            return 'mac-arm';
        }
        return 'mac-intel';
    } else if (platform.includes('win') || userAgent.includes('win')) {
        return 'windows';
    }
    return 'unknown';
}

// Format file size
function formatFileSize(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

// Update download buttons with latest release info
async function updateDownloadButtons() {
    try {
        const response = await fetch(RELEASES_API);
        const release = await response.json();
        
        if (!release || !release.assets) {
            console.log('No releases found');
            setFallbackLinks();
            return;
        }
        
        // Find assets for each platform
        const assets = {
            'mac-arm': release.assets.find(a => a.name.includes('-arm64.dmg')),
            'mac-intel': release.assets.find(a => a.name.endsWith('.dmg') && !a.name.includes('-arm64')),
            'windows': release.assets.find(a => a.name.endsWith('.exe'))
        };
        
        // Update main download button based on detected OS
        const detectedOS = detectOS();
        const mainDownloadBtn = document.getElementById('downloadBtn');
        const downloadText = document.getElementById('downloadText');
        
        if (detectedOS === 'mac-arm' && assets['mac-arm']) {
            mainDownloadBtn.href = assets['mac-arm'].browser_download_url;
            downloadText.textContent = 'Download for Mac (Apple Silicon)';
        } else if (detectedOS === 'mac-intel' && assets['mac-intel']) {
            mainDownloadBtn.href = assets['mac-intel'].browser_download_url;
            downloadText.textContent = 'Download for Mac (Intel)';
        } else if (detectedOS === 'windows' && assets['windows']) {
            mainDownloadBtn.href = assets['windows'].browser_download_url;
            downloadText.textContent = 'Download for Windows';
        } else {
            downloadText.textContent = 'Download Latest Release';
            mainDownloadBtn.href = release.html_url;
        }
        
        // Update specific download buttons
        if (assets['mac-arm']) {
            const macArmBtn = document.getElementById('macArmBtn');
            macArmBtn.href = assets['mac-arm'].browser_download_url;
            macArmBtn.title = `Size: ${formatFileSize(assets['mac-arm'].size)}`;
        }
        
        if (assets['mac-intel']) {
            const macIntelBtn = document.getElementById('macIntelBtn');
            macIntelBtn.href = assets['mac-intel'].browser_download_url;
            macIntelBtn.title = `Size: ${formatFileSize(assets['mac-intel'].size)}`;
        }
        
        if (assets['windows']) {
            const windowsBtn = document.getElementById('windowsBtn');
            windowsBtn.href = assets['windows'].browser_download_url;
            windowsBtn.title = `Size: ${formatFileSize(assets['windows'].size)}`;
        }
        
        // Add version number to hero section if available
        if (release.tag_name) {
            const versionBadge = document.createElement('span');
            versionBadge.className = 'version-badge';
            versionBadge.textContent = release.tag_name;
            versionBadge.style.cssText = `
                background: rgba(37, 99, 235, 0.1);
                color: var(--primary-color);
                padding: 0.25rem 0.75rem;
                border-radius: 9999px;
                font-size: 0.875rem;
                font-weight: 600;
                margin-left: 1rem;
                display: inline-block;
            `;
            const heroNote = document.querySelector('.hero-note');
            if (heroNote && !document.querySelector('.version-badge')) {
                heroNote.appendChild(versionBadge);
            }
        }
        
    } catch (error) {
        console.error('Error fetching releases:', error);
        setFallbackLinks();
    }
}

// Set fallback links if API fails
function setFallbackLinks() {
    const releasesUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
    
    document.getElementById('downloadBtn').href = releasesUrl;
    document.getElementById('macArmBtn').href = releasesUrl;
    document.getElementById('macIntelBtn').href = releasesUrl;
    document.getElementById('windowsBtn').href = releasesUrl;
}

// Smooth scroll for navigation links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Add scroll effect to navbar
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        if (currentScroll > 50) {
            navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        } else {
            navbar.style.boxShadow = 'none';
        }
        
        lastScroll = currentScroll;
    });
}

// Initialize animations on scroll
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Add initial styles and observe elements
    const animatedElements = document.querySelectorAll('.feature-card, .step, .download-card');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    updateDownloadButtons();
    initSmoothScroll();
    initNavbarScroll();
    initScrollAnimations();
    
    // Make download button clickable
    document.getElementById('downloadBtn').addEventListener('click', function(e) {
        if (this.href && this.href !== '#') {
            window.location.href = this.href;
        } else {
            e.preventDefault();
            window.location.href = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
        }
    });
});