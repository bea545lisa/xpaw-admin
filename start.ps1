taskkill /F /IM node.exe
$env:NODE_OPTIONS="--max-old-space-size=8192"
npm run dev