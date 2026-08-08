ClosetMuse — Cloud Share Edition

WHAT THIS VERSION ADDS
- Keeps your existing browser/local wardrobe.
- Compresses new clothing photos before local storage.
- Adds a "Share with ChatGPT" screen.
- "Sync wardrobe" uploads a read-only copy to Netlify Blobs.
- "Copy ChatGPT link" creates a direct JSON URL at /api/wardrobe?share=...
- The share link can be revoked at any time.
- The private owner key remains in localStorage and is required to update/revoke a share.

IMPORTANT PRIVACY NOTE
The ChatGPT link is a bearer link: anyone who gets the exact URL can read the shared wardrobe.
Do not post it publicly. Revoke it if you no longer want it accessible.

DEPLOYMENT
This edition uses Netlify Functions + Netlify Blobs, so it needs a Netlify build that installs package.json dependencies.
Recommended: deploy the folder through a Git-connected Netlify project or Netlify CLI, rather than treating it as only a static HTML upload.

After deployment:
1. Open your site on the SAME iPhone/browser where your existing ClosetMuse wardrobe is stored.
2. Your existing localStorage clothes should still appear if the domain is unchanged.
3. Open Share -> Sync wardrobe.
4. Tap Copy ChatGPT link.
5. Send that /api/wardrobe?share=... link in ChatGPT.
6. After adding/deleting clothes, tap Sync wardrobe again.

If Netlify reports a function problem, check:
Netlify project -> Logs & Metrics -> Functions -> wardrobe
