import { BadRequestError } from '@clearideas/core/errors'
import { envValue } from '../../lib/env.js'

/**
 * Chat models from the environment: `AI_CHAT_MODEL` (falls back to the legacy `CHAT_MODEL`) is the
 * default, `AI_CHAT_MODELS` an optional comma-separated allow-list users may pick from.
 */
export function configuredChatModels() {
  const defaultModel = envValue('AI_CHAT_MODEL', 'CHAT_MODEL') ?? ''
  const models = (envValue('AI_CHAT_MODELS') ?? defaultModel)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return {
    defaultModel,
    models: models.includes(defaultModel) || !defaultModel ? models : [defaultModel, ...models],
  }
}

/** The model for a turn: the requested one if it is allowed, else the default. */
export function resolveChatModel(requested?: string) {
  const { defaultModel, models } = configuredChatModels()
  const model = requested?.trim() || defaultModel
  if (!model) throw new BadRequestError('AI_CHAT_MODEL is not configured')
  if (models.length > 0 && !models.includes(model))
    throw new BadRequestError('Requested chat model is not allowed')
  return model
}
