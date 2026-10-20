/**
 * Reads the NetEase Cloud Music desktop client's own login session.
 *
 * The client is Chromium-based: its cookies live in a SQLite store under
 * `%LOCALAPPDATA%\Netease\CloudMusic\webapp91x64\Cookies`, encrypted with AES-256-GCM ("v10" rows).
 * The AES key itself is DPAPI-protected in `LocalPrefs.json` → `os_crypt.encrypted_key`, which only
 * the current Windows user can unwrap. Everything here stays on this machine.
 */
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const WANTED = ['MUSIC_U', 'MUSIC_A_T', 'MUSIC_R_T', '__csrf', 'NMTID', 'JSESSIONID-WYYY']

function clientRoot() {
  const local = process.env.LOCALAPPDATA
  if (!local) throw new Error('找不到 LOCALAPPDATA')
  return path.join(local, 'Netease', 'CloudMusic', 'webapp91x64')
}

function unwrapKey(encryptedKey) {
  return new Promise((resolve, reject) => {
    const script = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.Security',
      `$raw = [Convert]::FromBase64String("${encryptedKey}")`,
      '$blob = $raw[5..($raw.Length - 1)]',
      '$key = [System.Security.Cryptography.ProtectedData]::Unprotect($blob, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
      '[BitConverter]::ToString($key).Replace("-", "")',
    ].join('; ')
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true },
      (error, stdout) => {
        if (error) reject(new Error('无法解密客户端密钥：' + (error.message || error)))
        else resolve(String(stdout).trim())
      },
    )
  })
}

function decryptValue(key, value) {
  const buffer = Buffer.from(value)
  if (buffer.length < 20) return ''
  const prefix = buffer.subarray(0, 3).toString('latin1')
  if (prefix !== 'v10' && prefix !== 'v11') return ''
  const nonce = buffer.subarray(3, 15)
  const tag = buffer.subarray(buffer.length - 16)
  const data = buffer.subarray(15, buffer.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export async function readClientCookie() {
  const root = clientRoot()
  const prefsPath = path.join(root, 'LocalPrefs.json')
  const cookiesPath = path.join(root, 'Cookies')
  if (!fs.existsSync(prefsPath) || !fs.existsSync(cookiesPath)) {
    throw new Error('没有找到网易云客户端的登录数据，请确认客户端安装并登录过')
  }

  let prefs
  try {
    prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
  } catch {
    throw new Error('客户端配置文件读不出来')
  }
  const encryptedKey = prefs && prefs.os_crypt && prefs.os_crypt.encrypted_key
  if (!encryptedKey) throw new Error('客户端没有保存登录密钥')

  const hex = await unwrapKey(encryptedKey)
  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) throw new Error('客户端密钥长度异常')

  // The running client holds the SQLite file open; read a copy (plus any WAL) instead.
  const temp = path.join(os.tmpdir(), 'dsh-netease-cookies-' + process.pid + '.db')
  fs.copyFileSync(cookiesPath, temp)
  for (const suffix of ['-wal', '-shm']) {
    try {
      fs.copyFileSync(cookiesPath + suffix, temp + suffix)
    } catch {
      /* the sidecar files are optional */
    }
  }

  const found = new Map()
  try {
    const db = new DatabaseSync(temp, { readOnly: true })
    try {
      for (const row of db.prepare('select name, encrypted_value from cookies').all()) {
        if (found.has(row.name)) continue
        try {
          const value = decryptValue(key, row.encrypted_value)
          if (value) found.set(row.name, value)
        } catch {
          /* an unreadable cookie is simply skipped */
        }
      }
    } finally {
      db.close()
    }
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.unlinkSync(temp + suffix)
      } catch {
        /* ignore */
      }
    }
  }

  const musicU = found.get('MUSIC_U')
  if (!musicU) throw new Error('客户端当前没有登录（找不到 MUSIC_U），请先在客户端里登录')

  return WANTED.filter((name) => found.has(name))
    .map((name) => name + '=' + found.get(name))
    .join('; ')
}
