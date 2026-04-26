const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standalone)) {
  console.error('post-build: .next/standalone não existe — output: standalone está habilitado no next.config.js?')
  process.exit(1)
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.copyFileSync(src, dest)
  }
}

copyRecursive(path.join(root, 'public'), path.join(standalone, 'public'))
copyRecursive(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'))

console.log('post-build: public/ e .next/static/ copiados para .next/standalone/')
