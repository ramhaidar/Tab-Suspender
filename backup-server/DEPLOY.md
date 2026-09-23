# Firebase Deployment Checklist

## Prerequisites
- [ ] Firebase account created at https://console.firebase.google.com/
- [ ] Firebase project created (e.g., `tab-suspender-backup`)
- [ ] Firebase CLI available from `pnpm install` in `backup-server/` (local dev dependency)

## Before First Deploy

1. **Install dependencies**:
   ```bash
   cd backup-server
   pnpm install
   ```

2. **Login to Firebase**:
   ```bash
   pnpm exec firebase login
   ```

3. **Update `.firebaserc`** with your Firebase project ID:
   ```json
   {
     "projects": {
       "default": "your-firebase-project-id"
     }
   }
   ```

## Deploy Steps

1. **Test locally** (optional):
   ```bash
   pnpm run dev:https
   # Visit https://localhost:8080
   ```

2. **Deploy to Firebase**:
   ```bash
   pnpm run deploy
   ```

   Or use preview channel first:
   ```bash
   pnpm run deploy:preview
   ```

3. **Verify deployment**:
   - Check Firebase Console → Hosting
   - Visit your Firebase URL: `https://your-project-id.web.app`
   - Test sync.html: `https://your-project-id.web.app/sync.html`

## Custom Domain Setup

1. **In Firebase Console**:
   - Go to Hosting → Add custom domain
   - Enter: `uninstall.tab-suspender.com`
   - Copy provided DNS records

2. **In your DNS provider** (Cloudflare, etc.):
   - Add A record pointing to Firebase IPs
   - Or add CNAME record as instructed
   - Wait for propagation (can take up to 24h)

3. **Wait for SSL**:
   - Firebase automatically provisions SSL certificate
   - Usually takes 15-30 minutes after DNS propagation

## Update Extension After Deploy

Once deployed to production domain, update extension code:

### Files to update:
1. `offscreenDocument.ts` - line 14:
   ```typescript
   const BACKUP_SYNC_ORIGIN = 'https://uninstall.tab-suspender.com';
   ```

2. `offscreenDocument.html` - line 10:
   ```html
   <iframe id="backupSyncFrame"
           src="https://uninstall.tab-suspender.com/sync.html"
           style="display:none;">
   ```

### Rebuild and test (from the repository root):
```bash
pnpm run build
# Reload extension in Chrome
# Test with suspended tabs
```

## Verify Everything Works

- [ ] Visit `https://uninstall.tab-suspender.com/` - should load recovery page
- [ ] Visit `https://uninstall.tab-suspender.com/sync.html` - should load (blank page)
- [ ] Extension loads offscreen document without errors
- [ ] Console shows: `[BackupSync] iframe marked as ready, starting initial sync`
- [ ] Console shows: `Synced X suspended tabs to backup`
- [ ] Visit recovery page - should show synced tabs

## Troubleshooting

### CORS errors
- Check firebase.json headers configuration
- Ensure extension ID matches in CORS headers

### iframe not loading
- Check HTTPS is working
- Check domain is accessible
- Check browser console for errors

### No tabs syncing
- Check offscreenDocument console logs
- Verify BACKUP_SYNC_ORIGIN matches deployed domain
- Check extension has suspended tabs

## Rollback

If something goes wrong:
```bash
pnpm exec firebase hosting:rollback
```

This will restore the previous deployment.
