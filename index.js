/**
 * Host half of the NetEase Cloud Music panel.
 *
 * Responsibilities:
 *  - own the vendored `NeteaseCloudMusicApi` process (localhost only, no external service);
 *  - expose it to the page through one same-origin route (`/netease-music/*`) so the Client half
 *    never deals with cross-origin requests, ports, or the process lifetime;
 *  - hand a song to the installed desktop client through the registered `orpheus://` protocol.
 */
import { spawn, execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readClientCookie } from './session.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PREFIX = '/netease-music'
const DEFAULT_PORT = 4123

export const name = 'netease-music'
export const inject = ['webServer']

/** Requests carrying a foreign Origin must not reach the endpoints that return credentials. */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function sendJSON(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 2 * 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function apply(ctx, config = {}) {
  const port = Number(config?.port) || DEFAULT_PORT
  const upstream = `http://127.0.0.1:${port}`
  const allowClientSession = config?.clientSession !== false
  const log = typeof ctx.logger === 'function' ? ctx.logger('netease-music') : ctx.logger

  /**
   * The API runtime can arrive three ways: a normal npm dependency (published installs), a local
   * `npm run setup` into vendor/ (a git checkout), or a dependency of the linked checkout.
   */
  function resolveApiEntry() {
    const candidates = [
      path.join(here, 'vendor', 'ncm', 'node_modules', 'NeteaseCloudMusicApi', 'app.js'),
      path.join(here, 'node_modules', 'NeteaseCloudMusicApi', 'app.js'),
    ]
    try {
      candidates.push(createRequire(import.meta.url).resolve('NeteaseCloudMusicApi/app.js'))
    } catch {
      /* not resolvable from this file: try the profile next */
    }
    if (process.env.DSH_PROFILE_DIR) {
      candidates.push(
        path.join(process.env.DSH_PROFILE_DIR, 'node_modules', 'NeteaseCloudMusicApi', 'app.js'),
      )
    }
    return candidates.find((candidate) => fs.existsSync(candidate))
  }

  const entry = resolveApiEntry()
  const apiRoot = entry ? path.dirname(entry) : null

  const vendorReady = Boolean(entry)
  if (!vendorReady) {
    log?.warn?.('NetEase API runtime is missing — run `npm run setup` in the plugin directory')
  }

  let child = null
  let stopped = false

  const recent = []
  function record(item) {
    recent.push(item)
    if (recent.length > 80) recent.splice(0, recent.length - 80)
  }

  function startServer() {
    if (!vendorReady || stopped || (child && child.exitCode === null)) return
    try {
      child = spawn(process.execPath, [entry], {
        cwd: apiRoot,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PORT: String(port),
          HOST: '127.0.0.1',
          NODE_ENV: 'production',
        },
        stdio: 'ignore',
        windowsHide: true,
      })
      child.on('exit', () => {
        child = null
      })
      child.on('error', (error) => {
        child = null
        log?.warn?.(`local music API failed to start: ${error?.message ?? error}`)
      })
    } catch (error) {
      child = null
      log?.warn?.(`local music API spawn threw: ${error?.message ?? error}`)
    }
  }

  /** The API process warms up for a moment (anonymous token), so retry instead of failing the first click. */
  async function fetchUpstream(target, init) {
    let lastError
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (stopped) throw lastError ?? new Error('plugin disposed')
      startServer()
      try {
        return await fetch(target, init)
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    throw lastError ?? new Error('local music API unreachable')
  }

  async function handle(req, res) {
    let url
    try {
      url = new URL(req.url, 'http://127.0.0.1')
    } catch {
      sendJSON(res, 400, { error: 'bad url' })
      return
    }

    if (url.pathname === `${PREFIX}/ping`) {
      sendJSON(res, 200, {
        ok: true,
        vendorReady,
        upstream: { port, running: Boolean(child && child.exitCode === null) },
      })
      return
    }

    if (url.pathname === `${PREFIX}/diag`) {
      sendJSON(res, 200, {
        vendorReady,
        upstream: { port, running: Boolean(child && child.exitCode === null) },
        recent,
      })
      return
    }

    if (url.pathname === `${PREFIX}/client-session`) {
      if (!sameOrigin(req)) {
        sendJSON(res, 403, { ok: false, error: 'cross-origin request refused' })
        return
      }
      if (!allowClientSession) {
        sendJSON(res, 403, { ok: false, error: 'clientSession is disabled in this configuration' })
        return
      }
      try {
        const cookie = await readClientCookie()
        record({ at: new Date().toISOString(), from: 'client-session', ok: true })
        sendJSON(res, 200, { ok: true, cookie })
      } catch (error) {
        record({ at: new Date().toISOString(), from: 'client-session', error: String(error?.message ?? error) })
        sendJSON(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
      return
    }

    // The page cannot show a console worth reading from the outside, so it reports its own failures here.
    if (url.pathname === `${PREFIX}/log` && req.method === 'POST') {
      if (!sameOrigin(req)) {
        sendJSON(res, 403, { error: 'cross-origin request refused' })
        return
      }
      try {
        const raw = await readBody(req)
        const text = raw.toString('utf8').slice(0, 2000)
        record({ at: new Date().toISOString(), from: 'client', text })
        sendJSON(res, 200, { ok: true })
      } catch (error) {
        sendJSON(res, 400, { error: String(error?.message ?? error) })
      }
      return
    }

    if (url.pathname === `${PREFIX}/client-play`) {
      const id = String(url.searchParams.get('id') ?? '').replace(/[^0-9]/g, '')
      if (!id) {
        sendJSON(res, 400, { error: 'id required' })
        return
      }
      const target = url.searchParams.get('type') === 'album'
        ? `orpheus://album/${id}`
        : `orpheus://song/${id}`
      execFile('cmd.exe', ['/c', 'start', '', target], { windowsHide: true }, (error) => {
        if (error) sendJSON(res, 500, { error: String(error.message ?? error) })
        else sendJSON(res, 200, { ok: true, target })
      })
      return
    }

    if (url.pathname === `${PREFIX}/image`) {
      const raw = url.searchParams.get('url') ?? ''
      let target
      try {
        target = new URL(raw)
      } catch {
        sendJSON(res, 400, { error: 'url required' })
        return
      }
      const allowed = /^(https?:)$/.test(target.protocol)
        && /(^|\.)(126\.net|163\.com)$/i.test(target.hostname)
      if (!allowed) {
        sendJSON(res, 403, { error: 'host not allowed' })
        return
      }
      try {
        const response = await fetchUpstream(target.toString(), {
          headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://music.163.com/' },
        })
        const body = Buffer.from(await response.arrayBuffer())
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'image/jpeg',
          'content-length': String(body.length),
          'cache-control': 'public, max-age=86400',
        })
        res.end(body)
      } catch (error) {
        sendJSON(res, 502, { error: `image upstream failed: ${error?.message ?? error}` })
      }
      return
    }

    if (url.pathname === `${PREFIX}/audio`) {
      const raw = url.searchParams.get('url') ?? ''
      let target
      try {
        target = new URL(raw)
      } catch {
        sendJSON(res, 400, { error: 'url required' })
        return
      }
      const allowed = /^(https?:)$/.test(target.protocol)
        && /(^|\.)(126\.net|163\.com)$/i.test(target.hostname)
      if (!allowed) {
        sendJSON(res, 403, { error: 'host not allowed' })
        return
      }
      const headers = { 'user-agent': 'Mozilla/5.0', referer: 'https://music.163.com/' }
      if (req.headers.range) headers.range = String(req.headers.range)
      try {
        const response = await fetchUpstream(target.toString(), { headers })
        const out = {
          'content-type': response.headers.get('content-type') ?? 'audio/mpeg',
          'accept-ranges': response.headers.get('accept-ranges') ?? 'bytes',
          'cache-control': 'no-store',
        }
        const length = response.headers.get('content-length')
        if (length) out['content-length'] = length
        const range = response.headers.get('content-range')
        if (range) out['content-range'] = range
        res.writeHead(response.status, out)
        if (!response.body) {
          res.end()
          return
        }
        Readable.fromWeb(response.body).pipe(res)
      } catch (error) {
        sendJSON(res, 502, { error: `audio upstream failed: ${error?.message ?? error}` })
      }
      return
    }

    if (url.pathname.startsWith(`${PREFIX}/api/`)) {
      if (!vendorReady) {
        sendJSON(res, 503, {
          error: '本地音乐服务未安装：请在插件目录运行 `npm run setup` 后重试',
        })
        return
      }
      const rest = url.pathname.slice(`${PREFIX}/api`.length) || '/'
      const init = {
        method: req.method,
        headers: {
          accept: 'application/json',
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          init.body = await readBody(req)
        } catch (error) {
          sendJSON(res, 413, { error: String(error?.message ?? error) })
          return
        }
      }
      try {
        const response = await fetchUpstream(upstream + rest + url.search, init)
        const body = Buffer.from(await response.arrayBuffer())
        if (!rest.startsWith('/image') && !rest.startsWith('/lyric')) {
          let code
          try {
            code = JSON.parse(body.toString('utf8')).code
          } catch {
            code = undefined
          }
          record({ at: new Date().toISOString(), path: rest, status: response.status, code })
        }
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'content-length': String(body.length),
          'cache-control': 'no-store',
        })
        res.end(body)
      } catch (error) {
        record({ at: new Date().toISOString(), path: rest, status: 502, error: String(error?.message ?? error) })
        sendJSON(res, 502, { error: `local music API unreachable: ${error?.message ?? error}` })
      }
      return
    }

    sendJSON(res, 404, { error: 'not found' })
  }

  ctx.effect(() => {
    startServer()
    return () => {
      stopped = true
      if (child) {
        try {
          child.kill()
        } catch {
          /* already gone */
        }
        child = null
      }
    }
  }, 'netease-music: local API process')

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: handle }),
    'netease-music: web route',
  )
}
