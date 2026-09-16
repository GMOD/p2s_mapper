function hostOf(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const MAX_DETAIL = 200

function firstLine(body: string) {
  const line = body.split('\n', 1)[0]?.trim() ?? ''
  return line.length > MAX_DETAIL ? `${line.slice(0, MAX_DETAIL)}…` : line
}

/**
 * A failed response, carrying its status so a caller can tell a definitive
 * refusal from one worth asking again. `instanceof Error` and the message are
 * unchanged, so existing error rendering is unaffected.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** A 4xx means the server understood and declined, so asking again gets the
 * same answer. Anything else — 5xx, a timeout, a dropped connection — might
 * not. */
export function isDefinitiveFailure(e: unknown) {
  return e instanceof HttpError && e.status >= 400 && e.status < 500
}

/**
 * The error a failed response deserves: status and host, plus at most the first
 * line of the body. A whole body is an HTML error page or a megabyte of JSON,
 * and pasting it into the dialog buries the one line that says what went wrong.
 */
export async function httpError(response: Response, url: string) {
  const detail = firstLine(await response.text().catch(() => ''))
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} from ${hostOf(url)}`
  return new HttpError(
    detail ? `${status}: ${detail}` : status,
    response.status,
  )
}

/**
 * `fetch` rejects with a bare `TypeError: Failed to fetch` for a DNS failure,
 * an offline browser and a refused cross-origin request alike, naming neither
 * the host nor the cause. Anything else — an abort, most notably — passes
 * through untouched.
 */
export function networkError(url: string, cause: unknown) {
  return cause instanceof TypeError
    ? new Error(
        `Could not reach ${hostOf(url)}. Check your network connection; the server may also be refusing cross-origin requests from this page.`,
        { cause },
      )
    : cause
}

/**
 * Request options plus the `fetch` to make the request with. Every network
 * function here takes them, so a caller can hand in a host's instrumented
 * fetch, a test double, or nothing at all and get `globalThis.fetch`. Resolved
 * per call rather than captured at import, so a page that installs its fetch
 * late is still honored.
 */
export interface FetchOptions extends RequestInit {
  fetch?: typeof globalThis.fetch
}

export async function rawfetch(url: string, args?: FetchOptions) {
  const { fetch: f = globalThis.fetch, ...init } = args ?? {}
  try {
    return await f(url, init)
  } catch (e) {
    throw networkError(url, e)
  }
}

export async function myfetch(url: string, args?: FetchOptions) {
  const response = await rawfetch(url, args)

  if (!response.ok) {
    throw await httpError(response, url)
  }

  return response
}

export async function jsonfetch<T = unknown>(
  url: string,
  args?: FetchOptions,
): Promise<T> {
  // The caller names the shape it expects; `Response.json` promises `any`, and
  // narrowing it here rather than at the return keeps the body free of casts.
  const response: { json: () => Promise<T> } = await myfetch(url, args)
  return response.json()
}

/**
 * An AbortSignal's reason as a real Error. `signal.reason` is `any` — usually a
 * DOMException, but a caller can abort with anything at all — and throwing a
 * non-Error loses the stack and breaks `instanceof Error` checks in the UI's
 * error rendering. Normalize at every throw site.
 */
export function abortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Aborted', { cause: signal.reason })
}

export function timeout(time: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal))
    } else {
      const id = setTimeout(resolve, time)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(id)
          reject(abortError(signal))
        },
        { once: true },
      )
    }
  })
}
