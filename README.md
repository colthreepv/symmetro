# symmetro
Encrypt and decrypt text with AES-256-GCM on a easy to deploy webpage
Available on [github pages](https://colthreepv.github.io/symmetro/) and [statically build releases](https://github.com/colthreepv/symmetro/releases)

## Security & Verification

This is critical security software. To ensure the integrity of the built files, we use **GitHub Attestations** which provide cryptographic proof of provenance.

### Verifying Build Integrity

To verify that a downloaded `index.html` file was built from the official source code:

```bash
# Install GitHub CLI if you haven't already
# Then verify the file:
gh attestation verify index.html -R colthreepv/symmetro
```

This will show you:
- ✅ **Exact commit SHA** used to build the file
- ✅ **When it was built** and by which workflow
- ✅ **Cryptographic proof** it hasn't been tampered with

**Always verify files before using them for sensitive operations!**

## Usage
- have node 20.x or higher installed
- install pnpm (`corepack use pnpm@latest`)
- `pnpm install`
- `pnpm start` (for dev mode)
- `pnpm build` (for production build)

# one gif
![gif showing ui](https://github.com/user-attachments/assets/0ff6774f-5929-4d05-bc26-92e8272e39b4)
