import { deriveCredential } from './derive.ts'

interface Request { secret: string, index: string }
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: { password?: string, error?: string }) => void
}
async function handleRequest(event: MessageEvent<Request>): Promise<void> {
  try {
    const { secret, index } = event.data
    const password = await deriveCredential(secret, index)
    scope.postMessage({ password })
  }
  catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Password generation failed.' })
  }
}

// Errors are reported inside the handler; the event dispatcher does not await it.
scope.onmessage = (event) => {
  void handleRequest(event)
}
