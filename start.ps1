$env:NODE_OPTIONS="--max-old-space-size=8192"
try { Stop-Process -Name node -Force -ErrorAction Stop } catch {}
if (Test-Path node_modules\.vite) { Remove-Item -Recurse -Force node_modules\.vite }
npm run dev
