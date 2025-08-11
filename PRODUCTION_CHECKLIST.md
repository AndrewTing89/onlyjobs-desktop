# Production Checklist for OnlyJobs Desktop

## Pre-Build Checklist
- [ ] Remove all .env files from the repository
- [ ] Ensure LLM model is downloaded (`models/model.gguf`)
- [ ] Test all core features locally
- [ ] Clear any test data from the database

## Build Process
1. **Build React app for production:**
   ```bash
   npm run build
   ```

2. **Create distribution package:**
   ```bash
   # For macOS only
   npm run electron-dist
   
   # For all platforms
   npm run dist -- -mwl
   ```

## Testing Packaged App
- [ ] Test Gmail authentication flow
- [ ] Test email syncing
- [ ] Test job classification with LLM
- [ ] Test email deduplication
- [ ] Test View Email functionality
- [ ] Test database operations (add/update/delete jobs)

## Distribution Files
After building, you'll find:
- **macOS**: `dist/OnlyJobs Desktop-<version>.dmg`
- **Windows**: `dist/OnlyJobs Desktop Setup <version>.exe`
- **Linux**: `dist/onlyjobs-desktop-<version>.AppImage`

## Important Notes
1. The LLM model file (2GB) is included in the build
2. User data is stored in:
   - macOS: `~/Library/Application Support/onlyjobs-desktop/`
   - Windows: `%APPDATA%/onlyjobs-desktop/`
   - Linux: `~/.config/onlyjobs-desktop/`

3. OAuth credentials are embedded (consider using environment variables for production)

## Security Considerations
- [ ] Review OAuth client credentials handling
- [ ] Ensure no sensitive data in logs
- [ ] Test with fresh install (no existing config)

## Final Steps
1. Test the packaged app on a clean system
2. Sign the app for distribution (macOS/Windows)
3. Create release notes
4. Upload to distribution platform