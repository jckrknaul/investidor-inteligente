const fs = require('fs')
const path = require('path')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const frontendEnv = loadEnvFile(path.join(__dirname, 'frontend', '.env.local'))
const backendEnv = loadEnvFile(path.join(__dirname, 'backend', '.env'))

module.exports = {
  apps: [
    {
      name: 'investidor-backend',
      cwd: './backend',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production', ...backendEnv },
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
    },
    {
      name: 'investidor-frontend',
      cwd: './frontend/.next/standalone',
      script: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOSTNAME: '0.0.0.0',
        ...frontendEnv,
      },
      max_memory_restart: '800M',
      autorestart: true,
      watch: false,
    },
  ],
}
