import { ArrowPath, PaperPlane } from "@medusajs/icons"
import { Button, Container, Heading, Text, Textarea } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import {
  useB2BQuoteMessages,
  useCreateB2BQuoteMessage,
} from "../hooks/b2b-quotes"
import type { B2BQuote, B2BQuoteMessage } from "../types"

const lockedStatuses = new Set(["accepted", "customer_rejected", "merchant_rejected", "rejected"])

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : ""

const MessageBubble = ({ message }: { message: B2BQuoteMessage }) => {
  const mine = message.sender_type === "admin"
  const system = message.is_system_message || message.sender_type === "system"

  if (system) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] rounded-full bg-ui-bg-subtle px-3 py-2 text-center">
          <Text size="xsmall">{message.message}</Text>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-lg border border-ui-border-base px-3 py-2 ${mine ? "bg-ui-bg-interactive text-ui-fg-on-color" : "bg-ui-bg-base"}`}>
        <Text size="xsmall" className={mine ? "text-ui-fg-on-color" : "text-ui-fg-subtle"}>
          {message.sender_type === "admin" ? "Admin" : "Customer"}
        </Text>
        <Text size="small" className="whitespace-pre-wrap break-words">
          {message.message}
        </Text>
        <Text size="xsmall" className={mine ? "text-ui-fg-on-color" : "text-ui-fg-subtle"}>
          {formatTime(message.created_at)}
        </Text>
      </div>
    </div>
  )
}

export default function B2BQuoteChat({ quote }: { quote: B2BQuote }) {
  const messagesQuery = useB2BQuoteMessages(quote.id)
  const createMessage = useCreateB2BQuoteMessage(quote.id)
  const [draft, setDraft] = useState("")
  const scroller = useRef<HTMLDivElement | null>(null)
  const writable = !lockedStatuses.has(quote.status)
  const messages = messagesQuery.data?.messages || []

  useEffect(() => {
    if (!scroller.current) return
    scroller.current.scrollTop = scroller.current.scrollHeight
  }, [messages.length])

  const submit = async () => {
    const message = draft.trim()
    if (!message || createMessage.isPending || !writable) return
    await createMessage.mutateAsync({ message })
    setDraft("")
  }

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between gap-x-3">
        <div>
          <Heading level="h2">Chat</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {writable ? "Customer negotiation thread" : "Accepted and rejected quotes are read-only."}
          </Text>
        </div>
        <Button size="small" variant="secondary" onClick={() => messagesQuery.refetch()}>
          <ArrowPath className="mr-2" />
          Refresh
        </Button>
      </div>

      <div ref={scroller} className="max-h-80 overflow-y-auto rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
        {messagesQuery.isLoading ? (
          <Text size="small" className="text-ui-fg-subtle">Loading messages...</Text>
        ) : messages.length ? (
          <div className="flex flex-col gap-y-3">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        ) : (
          <Text size="small" className="py-8 text-center text-ui-fg-subtle">No messages yet.</Text>
        )}
      </div>

      {messagesQuery.error && (
        <Text size="small" className="text-ui-fg-error">
          {(messagesQuery.error as Error).message || "Failed to load messages."}
        </Text>
      )}

      {writable && (
        <div className="flex gap-x-3">
          <Textarea
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a reply..."
          />
          <Button className="self-stretch" disabled={!draft.trim() || createMessage.isPending} onClick={submit}>
            <PaperPlane className="mr-2" />
            Send
          </Button>
        </div>
      )}
    </Container>
  )
}
