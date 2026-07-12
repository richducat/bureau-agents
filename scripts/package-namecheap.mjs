import { mkdir, rm, cp, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const output = 'output/namecheap'
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const file of ['server-dist', 'server.js', 'package.json', 'package-lock.json', '.env.example']) {
  await cp(file, `${output}/${file}`, { recursive: true })
}
await writeFile(`${output}/DEPLOY.txt`, 'Upload this package to the dedicated Namecheap Node.js application root. Configure environment variables in cPanel, run npm ci --omit=dev, run node server-dist/migrate.js, then restart the application. Never upload a real .env file.\n')
await mkdir('output', { recursive: true })
await rm('output/bureau-namecheap-api.zip', { force: true })
await exec('zip', ['-qr', '../bureau-namecheap-api.zip', '.'], { cwd: output })
console.log('Created output/bureau-namecheap-api.zip')
