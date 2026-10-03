import { derivePassword } from './derive.ts'

interface Request { secret: string, index: string, version: number }
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: { password?: string, error?: string }) => void
}
scope.onmessage = async (event) => {
  try {
    const { secret, index, version } = event.data
    const password = await derivePassword(secret, index, version)
    scope.postMessage({ password })
  }
  catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Password generation failed.' })
  }
}
