import type { Mongoose } from 'mongoose'
import { Schema } from 'mongoose'

export interface CeChatModels {
  ChatConversationModel: any
}

/** Most messages kept in one conversation; start a new one after that. */
export const MAX_CHAT_MESSAGES = 200

/**
 * Chat conversations (Ask and Site AI), stored per user. `siteId` fixes the scope to one site (a
 * Site AI conversation); without it the conversation uses every site the user can read that has
 * AI chat turned on, resolved again on every turn.
 */
export function registerCeChatModels(mongoose: Mongoose): CeChatModels {
  const messageSchema = new Schema(
    {
      id: { type: String, required: true },
      role: { type: String, required: true, enum: ['user', 'assistant'] },
      text: { type: String, required: true, default: '' },
      sources: { type: [Schema.Types.Mixed], required: true, default: [] },
      model: { type: String, required: false },
      createdAt: { type: Date, required: true, default: () => new Date() },
    },
    { _id: false },
  )

  const conversationSchema = new Schema(
    {
      accountId: { type: Schema.Types.ObjectId, required: true, ref: 'Account', index: true },
      userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
      siteId: { type: Schema.Types.ObjectId, required: false, ref: 'Site' },
      title: { type: String, required: true },
      messages: { type: [messageSchema], required: true, default: [] },
    },
    { timestamps: true },
  )
  conversationSchema.index({ userId: 1, updatedAt: -1 })
  conversationSchema.index({ userId: 1, siteId: 1, updatedAt: -1 })

  return {
    ChatConversationModel:
      mongoose.models.CeChatConversation ?? mongoose.model('CeChatConversation', conversationSchema),
  }
}
