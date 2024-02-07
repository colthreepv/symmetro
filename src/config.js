import { env as nodeEnv } from 'node:process'
import { cleanEnv, str } from 'envalid'
import { configDotenv } from 'dotenv'

configDotenv()

export const env = cleanEnv(nodeEnv, {
  EXAMPLE_VAR: str(),
})
