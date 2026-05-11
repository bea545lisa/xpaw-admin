taskkill /F /IM node.exe
$env:NODE_OPTIONS="--max-old-space-size=8192"
Remove-Item -Recurse -Force node_modules\.vite
npm run dev