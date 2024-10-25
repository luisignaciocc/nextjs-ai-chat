'use client'

import * as React from 'react'
import Textarea from 'react-textarea-autosize'

import { useActions, useUIState } from 'ai/rsc'

import { UserMessage } from './message'
import { type AI } from '@/lib/chat/actions'
import { Button } from '@/components/ui/button'
import { IconArrowElbow, IconPlus } from '@/components/ui/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { useEnterSubmit } from '@/lib/hooks/use-enter-submit'
import { nanoid } from 'nanoid'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { FooterText } from './footer'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from './ui/accordion'
import { Label } from './ui/label'
import { Input } from './ui/input'

enum Model {
  'gpt-4o' = 'gpt-4o',
  'gpt-4o-mini' = 'gpt-4o-mini',
  'o1-preview' = 'o1-preview',
  'o1-mini' = 'o1-mini'
}

export function PromptForm({
  input,
  setInput
}: {
  input: string
  setInput: (value: string) => void
}) {
  const [model, setModel] = React.useState(Model['gpt-4o-mini'])
  const [config, setConfig] = React.useState({
    systemPrompt: `\
      You are ChatGPT, a large language model trained by OpenAI, based on the GPT-4 architecture. Knowledge cutoff: 2023-10. Current date: ${
        new Date().toISOString().split('T')[0]
      }.

      Capabilities:
      - Image input capabilities are enabled.
      - You provide direct and concise answers for straightforward questions.
      - You have the ability to generate images based on detailed text descriptions.
      - You can assist with a wide range of tasks, including answering questions, providing explanations, generating text, and more.

      Behavior:
      - Provide clear, concise, and accurate responses.
      - When asked to generate images, follow the guidelines and policies regarding image creation.
      - Always strive to be helpful, polite, and respectful.

      Tools:
      - You have access to the dalle tool, which you can use to enhance your responses and provide more detailed assistance.
      `,
    temperature: 0.7,
    topP: 1
  })
  const router = useRouter()
  const { formRef, onKeyDown } = useEnterSubmit()
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const { submitUserMessage } = useActions()
  const [_, setMessages] = useUIState<typeof AI>()

  React.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const handleConfigChange: React.ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement
  > = e => {
    const { name, value } = e.target
    setConfig(prev => ({ ...prev, [name]: value }))
  }

  return (
    <form
      ref={formRef}
      onSubmit={async (e: any) => {
        e.preventDefault()

        // Blur focus on mobile
        if (window.innerWidth < 600) {
          e.target['message']?.blur()
        }

        const value = input.trim()
        setInput('')
        if (!value) return

        // Optimistically add user message UI
        setMessages(currentMessages => [
          ...currentMessages,
          {
            id: nanoid(),
            display: <UserMessage>{value}</UserMessage>
          }
        ])

        // Submit and get response message
        const responseMessage = await submitUserMessage({
          content: value,
          model,
          systemPrompt: config.systemPrompt,
          temperature: config.temperature,
          topP: config.topP
        })
        setMessages(currentMessages => [...currentMessages, responseMessage])
      }}
      className="flex flex-col space-y-2"
    >
      <div className="relative flex max-h-60 w-full grow flex-col overflow-hidden bg-background px-8 sm:rounded-md sm:border sm:px-12">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-0 top-[14px] size-8 rounded-full bg-background p-0 sm:left-4"
              onClick={() => {
                router.push('/new')
              }}
            >
              <IconPlus />
              <span className="sr-only">New Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
        <Textarea
          ref={inputRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          placeholder="Send a message."
          className="min-h-[60px] w-full resize-none bg-transparent px-4 py-[1.3rem] focus-within:outline-none sm:text-sm"
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          name="message"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <div className="absolute right-0 top-[13px] sm:right-4 flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" size="icon" disabled={input === ''}>
                <IconArrowElbow />
                <span className="sr-only">Send message</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="w-full hidden sm:flex justify-between items-center">
        <FooterText />
        <Select
          onValueChange={value => setModel(value as unknown as Model)}
          value={model as unknown as string}
        >
          <SelectTrigger className="w-fit">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(Model).map(model => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Accordion type="single" collapsible className="w-full hidden sm:block">
        <AccordionItem value="config">
          <AccordionTrigger className="text-sm font-medium">
            Advanced Configuration
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="w-full space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  name="systemPrompt"
                  placeholder="Enter system prompt"
                  value={config.systemPrompt}
                  onChange={handleConfigChange}
                  className="w-full p-1 rounded-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="temperature">Temperature</Label>
                  <Input
                    id="temperature"
                    name="temperature"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={handleConfigChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="topP">Top P</Label>
                  <Input
                    id="topP"
                    name="topP"
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.topP}
                    onChange={handleConfigChange}
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  )
}
