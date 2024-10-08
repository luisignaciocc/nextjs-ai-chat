/* eslint-disable @next/next/no-img-element */

import 'server-only'

import {
  createAI,
  createStreamableUI,
  getMutableAIState,
  getAIState,
  streamUI,
  createStreamableValue
} from 'ai/rsc'
import { openai } from '@ai-sdk/openai'
import OpenAI from 'openai'
import { BotCard, BotMessage, SystemMessage } from '@/components/message'
import { spinner } from '@/components/spinner'
import { ImageLoadingSkeleton } from '@/components/image-loading-skeleton'

import { z } from 'zod'
import {
  formatNumber,
  runAsyncFnWithoutBlocking,
  sleep,
  nanoid
} from '@/lib/utils'
import { saveChat } from '@/app/actions'
import { SpinnerMessage, UserMessage } from '@/components/message'
import { Chat, Message } from '@/lib/types'
import { auth } from '@/auth'
import Image from 'next/image'

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function confirmPurchase(symbol: string, price: number, amount: number) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>
  )

  const systemMessage = createStreamableUI(null)

  runAsyncFnWithoutBlocking(async () => {
    await sleep(1000)

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>
    )

    await sleep(1000)

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{' '}
          {formatNumber(amount * price)}
        </p>
      </div>
    )

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
        {formatNumber(amount * price)}.
      </SystemMessage>
    )

    aiState.done({
      ...aiState.get(),
      messages: [
        ...aiState.get().messages,
        {
          id: nanoid(),
          role: 'system',
          content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
            amount * price
          }]`
        }
      ]
    })
  })

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: nanoid(),
      display: systemMessage.value
    }
  }
}

async function submitUserMessage({
  content,
  model,
  systemPrompt,
  temperature,
  topP
}: {
  content: string
  model: string
  systemPrompt: string
  temperature: number
  topP: number
}) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let textStream: undefined | ReturnType<typeof createStreamableValue<string>>
  let textNode: undefined | React.ReactNode

  const result = await streamUI({
    model: openai(model),
    initial: <SpinnerMessage />,
    system: systemPrompt,
    temperature,
    topP,
    messages: [
      ...aiState.get().messages.map((message: any) => ({
        role: message.role,
        content: message.content,
        name: message.name
      }))
    ],
    text: ({ content, done, delta }) => {
      if (!textStream) {
        textStream = createStreamableValue('')
        textNode = <BotMessage content={textStream.value} />
      }

      if (done) {
        textStream.done()
        aiState.done({
          ...aiState.get(),
          messages: [
            ...aiState.get().messages,
            {
              id: nanoid(),
              role: 'assistant',
              content
            }
          ]
        })
      } else {
        textStream.update(delta)
      }

      return textNode
    },
    tools: {
      dalle: {
        description: 'Generate an image based on a detailed text prompt.',
        parameters: z.object({
          prompt: z
            .string()
            .describe('A detailed description of the image to generate.'),
          size: z
            // .enum(['1792x1024', '1024x1024', '1024x1792'])
            .enum(['1024x1024'])
            .optional()
            .describe('The size of the requested image.'),
          model: z
            // .enum(['dall-e-2', 'dall-e-3'])
            .enum(['dall-e-2'])
            .optional()
            .default('dall-e-2')
            .describe('The DALL-E model to use.')
        }),
        generate: async function* ({
          prompt,
          size = '1024x1024',
          model = 'dall-e-2'
        }) {
          yield (
            <BotCard>
              <ImageLoadingSkeleton />
            </BotCard>
          )

          await sleep(1000)

          const toolCallId = nanoid()

          try {
            const response = await openaiClient.images.generate({
              model: model,
              prompt: prompt,
              n: 1,
              size: size
            })
            const imageUrl = response.data[0].url

            if (!imageUrl) {
              throw new Error('Failed to generate image')
            }

            const width = 640
            const height =
              size === '1024x1024' ? 640 : size === '1024x1792' ? 1120 : 366

            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'dalle',
                      toolCallId,
                      args: { prompt, size, model }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'dalle',
                      toolCallId,
                      result: { imageUrl, width, height }
                    }
                  ]
                }
              ]
            })

            return (
              <BotCard>
                <a href={imageUrl} target="_blank" rel="noreferrer">
                  <Image
                    src={imageUrl}
                    alt="Imagen generada por DALL-E"
                    className="w-full h-auto rounded-lg"
                    height={height}
                    width={width}
                  />
                </a>
              </BotCard>
            )
          } catch (error) {
            aiState.done({
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'dalle',
                      toolCallId,
                      args: { prompt, size, model }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'dalle',
                      toolCallId,
                      result: { error: 'Error generando la imagen' }
                    }
                  ]
                }
              ]
            })

            return (
              <BotCard>
                <p>Sorry, there was an error generating the image.</p>
              </BotCard>
            )
          }
        }
      }
    }
  })

  return {
    id: nanoid(),
    display: result.value
  }
}

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage,
    confirmPurchase
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] },
  onGetUIState: async () => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const aiState = getAIState() as Chat

      if (aiState) {
        const uiState = getUIStateFromAIState(aiState)
        return uiState
      }
    } else {
      return
    }
  },
  onSetAIState: async ({ state }) => {
    'use server'

    const session = await auth()

    if (session && session.user) {
      const { chatId, messages } = state

      const createdAt = new Date()
      const userId = session.user.id as string
      const path = `/chat/${chatId}`

      const firstMessageContent = messages[0].content as string
      const title = firstMessageContent.substring(0, 100)

      const chat: Chat = {
        id: chatId,
        title,
        userId,
        createdAt,
        messages,
        path
      }

      await saveChat(chat)
    } else {
      return
    }
  }
})

export const getUIStateFromAIState = (aiState: Chat) => {
  return aiState.messages
    .filter(message => message.role !== 'system')
    .map((message, index) => ({
      id: `${aiState.chatId}-${index}`,
      display:
        message.role === 'tool' ? (
          message.content.map(tool => {
            return tool.toolName === 'dalle' &&
              (tool.result as { imageUrl: string })?.imageUrl ? (
              <BotCard>
                <a
                  href={(tool.result as { imageUrl: string }).imageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    src={(tool.result as { imageUrl: string }).imageUrl}
                    alt="Imagen generada por DALL-E"
                    className="w-full h-auto rounded-lg"
                    height={(tool.result as { height: number }).height}
                    width={(tool.result as { width: number }).width}
                  />
                </a>
              </BotCard>
            ) : (
              <BotMessage content={`Error generando la imagen`} />
            )
          })
        ) : message.role === 'user' ? (
          <UserMessage>{message.content as string}</UserMessage>
        ) : message.role === 'assistant' &&
          typeof message.content === 'string' ? (
          <BotMessage content={message.content} />
        ) : null
    }))
}
