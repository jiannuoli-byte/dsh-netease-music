#!/usr/bin/env node
/**
 * Installs the vendored NeteaseCloudMusicApi runtime into `vendor/ncm`.
 *
 * The package was taken off npmjs.org, so the default registry is npmmirror. Override with
 * `NCM_REGISTRY`, pin another version with `NCM_VERSION`.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'vendor', 'ncm')
const registry = process.env.NCM_REGISTRY || 'https://registry.npmmirror.com'
const version = process.env.NCM_VERSION || '4.32.0'
const entry = path.join(target, 'node_modules', 'NeteaseCloudMusicApi', 'app.js')
const spec = `NeteaseCloudMusicApi@${version}`
const isWindows = process.platform === 'win32'

fs.mkdirSync(target, { recursive: true })
const manifest = path.join(target, 'package.json')
if (!fs.existsSync(manifest)) {
  fs.writeFileSync(manifest, JSON.stringify({ name: 'ncm-vendor', private: true, version: '1.0.0' }, null, 2))
}

function quote(part) {
  return /[\s"]/.test(part) ? '"' + part.replace(/"/g, '\\"') + '"' : part
}

function run(label, command, args) {
  const line = [command, ...args].map(quote).join(' ')
  console.log(`\n[setup] ${label}: ${line}`)
  // One command string with `shell: true` avoids Node's "args with shell" deprecation warning and
  // lets Windows resolve `npm.cmd`/`pnpm.cmd` the same way a terminal would.
  const result = isWindows
    ? spawnSync(line, { cwd: target, stdio: 'inherit', shell: true, windowsHide: true })
    : spawnSync(command, args, { cwd: target, stdio: 'inherit' })
  if (result.error) {
    console.log(`[setup] ${label} unavailable: ${result.error.message}`)
    return false
  }
  return result.status === 0
}

// npm and pnpm do not share flags: `--no-audit`/`--no-fund` are npm-only, `--node-linker` is pnpm-only.
const npmArgs = ['install', spec, '--omit=dev', '--no-audit', '--no-fund', '--registry', registry]
const pnpmArgs = ['add', spec, '--node-linker', 'hoisted', '--registry', registry]
let done = run('npm', isWindows ? 'npm.cmd' : 'npm', npmArgs)

if (!done) {
  done = run('pnpm', isWindows ? 'pnpm.cmd' : 'pnpm', pnpmArgs)
}

// Last resorts: the pnpm that ships next to the running Node (DSH Desktop), or the one under DSH_HOME.
if (!done) {
  const deps = path.resolve(path.dirname(process.execPath), '..', '..')
  const candidates = [path.join(deps, 'pnpm', 'bin', 'pnpm.cjs')]
  if (process.env.DSH_HOME) {
    candidates.push(
      path.join(process.env.DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs'),
    )
  }
  for (const bundled of candidates) {
    if (!fs.existsSync(bundled)) continue
    done = run('bundled pnpm', process.execPath, [bundled, ...pnpmArgs])
    if (done) break
  }
}

if (!done) {
  console.error('\n[setup] 安装失败。请确认能访问 npm 镜像，或手动安装：')
  console.error(`  cd vendor/ncm && npm install ${spec} --registry ${registry}`)
  process.exit(1)
}

if (!fs.existsSync(entry)) {
  console.error(`\n[setup] 安装完成但找不到 ${entry}`)
  process.exit(1)
}

console.log(`\n[setup] 完成：${path.relative(root, entry)}`)
console.log('[setup] 现在可以在 DSH 里 install_bundle 这个目录了。')
