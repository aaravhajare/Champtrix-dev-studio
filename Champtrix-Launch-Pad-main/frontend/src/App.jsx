import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(text) {
  const cleaned = normalizeText(text).replace(/[^a-z0-9\s]/g, ' ')
  return cleaned.split(' ').filter(Boolean)
}

function unique(items) {
  return Array.from(new Set(items))
}

function mockRerank({ query, documents }) {
  // Future integration (NO real calls now):
  // POST https://openrouter.ai/api/v1/rerank
  // model: "cohere/rerank-4-pro"
  // body: { query, documents }
  const qTokens = new Set(tokenize(query))

  const scored = documents.map((doc) => {
    const dTokens = tokenize(`${doc.title} ${doc.text}`)
    let score = 0
    for (const t of dTokens) {
      if (qTokens.has(t)) score += 1
    }
    return { ...doc, score }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, 3)
}

function extractProjectDetails(userText) {
  const text = userText ?? ''
  const lower = normalizeText(text)

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  const phoneRegex =
    /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/

  const addressRegex =
    /\b(\d{1,6}\s+[a-z0-9.\-'\s]+?\s+(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|court|ct)\b)|\b(po box|p\.o\. box)\b|\b(zip|postal code|postcode)\b/i

  const websiteTypeKeywords = [
    'landing page',
    'ecommerce',
    'e-commerce',
    'shop',
    'store',
    'portfolio',
    'restaurant',
    'menu',
    'booking',
    'appointment',
    'saas',
    'marketing site',
    'website',
    'web site',
    'webpage',
    'web page',
  ]

  const designKeywords = [
    'modern',
    'minimal',
    'luxury',
    'bold',
    'clean',
    'dark',
    'light',
    'color',
    'theme',
    'layout',
    'sections',
    'pages',
    'features',
    'logo',
    'brand',
  ]

  const hasEmail = emailRegex.test(text)
  const hasPhone = phoneRegex.test(text)
  const hasContact = hasEmail || hasPhone || lower.includes('contact') || lower.includes('call') || lower.includes('email')

  const hasAddress =
    addressRegex.test(text) ||
    lower.includes('address') ||
    lower.includes('located in') ||
    lower.includes('location') ||
    lower.includes('city') ||
    lower.includes('near ') ||
    lower.includes('service area')

  const hasWebsiteType = websiteTypeKeywords.some((k) => lower.includes(k))
  const hasDesignHints = designKeywords.some((k) => lower.includes(k))
  const hasWebDesignInfo = hasWebsiteType || hasDesignHints

  const businessSignals = [
    'business name',
    'company',
    'brand',
    'we are',
    'i am',
    'clinic',
    'restaurant',
    'studio',
    'agency',
    'shop',
    'store',
    'salon',
  ]
  const hasBusinessSignal = businessSignals.some((k) => lower.includes(k))

  // Heuristic: if user includes a likely name phrase near "business name is"
  const explicitBusinessName =
    /\b(business name|company name|brand name)\s*(is|:)\s*([^\n\r,.;]{2,60})/i.exec(text)?.[3]?.trim() ?? ''

  const hasBusinessName = Boolean(explicitBusinessName) || hasBusinessSignal

  const missing = []
  if (!hasBusinessName) missing.push('Business Name')
  if (!hasContact) missing.push('Contact Details')
  if (!hasWebDesignInfo) missing.push('Web Design Info')
  if (!hasAddress) missing.push('Address')

  return {
    hasBusinessName,
    hasContact,
    hasWebDesignInfo,
    hasAddress,
    allFieldsPresent: missing.length === 0,
    missing,
    extracted: {
      businessName: explicitBusinessName || null,
      email: hasEmail ? text.match(emailRegex)?.[0] ?? null : null,
    },
  }
}

function isLikelyQuestion(text) {
  const lower = normalizeText(text)
  if (lower.endsWith('?')) return true
  if (/(^|\s)(what|how|why|when|where|which|who|can you|do you|should i)\b/.test(lower)) return true
  if (lower.startsWith('help')) return true
  return false
}

function isWebsiteGenerationRequest(text) {
  const lower = normalizeText(text)
  if (!lower) return false

  const intentKeywords = [
    'website',
    'web site',
    'webpage',
    'web page',
    'landing page',
    'portfolio',
    'ecommerce',
    'e-commerce',
    'online store',
    'store',
    'shop',
    'booking',
    'appointment',
    'restaurant menu',
    'business site',
  ]

  const actionKeywords = ['create', 'build', 'generate', 'make', 'design', 'develop', 'need', 'want']

  const hasIntent = intentKeywords.some((k) => lower.includes(k))
  const hasAction = actionKeywords.some((k) => lower.includes(k))

  // Treat as a website request if they mention a website directly,
  // or if they use strong action language + a known website type.
  return hasIntent || (hasAction && intentKeywords.some((k) => lower.includes(k)))
}

function MessageBubble({ role, content, type = 'default' }) {
  const isUser = role === 'user'
  let bubbleClass = isUser ? 'bubble bubble--user' : 'bubble bubble--ai'
  
  // Add type-specific styling
  if (type === 'status') bubbleClass += ' bubble--status'
  else if (type === 'missing') bubbleClass += ' bubble--missing'
  else if (type === 'success') bubbleClass += ' bubble--success'
  else if (type === 'error') bubbleClass += ' bubble--error'

  return (
    <div className={isUser ? 'row row--right' : 'row row--left'}>
      <div className={bubbleClass}>
        <div className="bubble__text">{content}</div>
      </div>
    </div>
  )
}

function ChatWindow({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  return (
    <div className="chatWindow" role="log" aria-live="polite" aria-relevant="additions">
      <div className="chatWindow__inner">
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} type={m.type} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

function InputBar({ onSend }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  function sendAndClear() {
    const text = value
    setValue('')
    onSend(text)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }, 0)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendAndClear()
    }
  }

  function handleChange(e) {
    const text = e.target.value
    setValue(text)
    // Auto-expand textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }

  const canSend = value.trim().length > 0

  return (
    <div className="inputBar">
      <textarea
        ref={textareaRef}
        className="inputBar__input"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder="Message Champtrix Launch Pad…"
        rows={1}
      />

      <button
        className="inputBar__send"
        onClick={sendAndClear}
        disabled={!canSend}
        aria-label="Send message"
        type="button"
      >
        ⏎ Send
      </button>
    </div>
  )
}

export default function App() {
  const mockDocuments = useMemo(
    () => [
      {
        id: 'doc-1',
        title: 'Website Types (Examples)',
        text: 'Common types: landing page, ecommerce store, portfolio, restaurant menu, booking site, SaaS marketing site.',
      },
      {
        id: 'doc-2',
        title: 'Business Info Checklist',
        text: 'To generate a business website, we typically need business name, contact info (phone/email), address/location, and the website type.',
      },
      {
        id: 'doc-3',
        title: 'Contact Details Formats',
        text: 'Provide phone number with country code if possible, and a business email address like hello@yourdomain.com.',
      },
      {
        id: 'doc-4',
        title: 'Address Tips',
        text: 'Include street, city, state/province, and postal code. If online-only, specify service area instead.',
      },
    ],
    [],
  )

  const [messages, setMessages] = useState(() => [
    {
      id: nowId(),
      role: 'ai',
      type: 'default',
      content:
        "Hi! I'm Champtrix Launch Pad.\n\nTell me what you want to build and include:\n- Business Name\n- Contact Details\n- Address\n- Type of Website",
      createdAt: Date.now(),
    },
  ])

  const isRespondingRef = useRef(false)

  async function pushMessage(next) {
    setMessages((prev) => [...prev, next])
    await sleep(80)
  }

  async function pushAiBoxes(boxes) {
    for (const box of boxes) {
      await pushMessage({
        id: nowId(),
        role: 'ai',
        content: box.content,
        type: box.type ?? 'default',
        createdAt: Date.now(),
      })
    }
  }

  async function handleSend(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    if (isRespondingRef.current) return

    isRespondingRef.current = true
    try {
      const newUserMessage = {
        id: nowId(),
        role: 'user',
        type: 'default',
        content: trimmed,
        createdAt: Date.now(),
      }
      await pushMessage(newUserMessage)

      let aiResponse = ''
      let msgType = 'default'

      const isWebsiteRequest = isWebsiteGenerationRequest(trimmed)

      if (!isWebsiteRequest || isLikelyQuestion(trimmed)) {
        await pushAiBoxes([
          { type: 'error', content: '🚫 Not a Website Request' },
          {
            type: 'default',
            content: 'I am Champtrix Launch Pad — specialized in WEBSITE GENERATION only.',
          },
          {
            type: 'default',
            content: 'I cannot process:\n- General questions\n- Chat\n- Coding unrelated to websites',
          },
          {
            type: 'success',
            content: '✅ Try something like:\n"Create a portfolio website for a photographer in Mumbai"',
          },
          {
            type: 'status',
            content:
              'Include:\n• Business Name\n• Contact Details\n• Address\n• Website Type',
          },
        ])
        return
      }

      {
        const details = extractProjectDetails(trimmed)
        if (details.allFieldsPresent) {
          aiResponse =
            'Your website is being created. It will take 5-10 minutes. Status: In Progress. Please wait.'
          msgType = 'success'
        } else {
          const missing = unique(details.missing)
          aiResponse = `Missing: ${missing.join(', ')}`
          msgType = 'missing'
        }
      }

      if (aiResponse.includes('Your website is being created')) {
        await pushAiBoxes([
          { type: 'success', content: 'Website Creation Initiated' },
          { type: 'status', content: 'Status: In Progress' },
          { type: 'status', content: 'Estimated time: 5–10 minutes' },
          { type: 'default', content: aiResponse },
        ])
      } else if (aiResponse.startsWith('Missing:')) {
        const parts = aiResponse.replace(/^Missing:\s*/i, '').split(',').map((s) => s.trim()).filter(Boolean)
        await pushAiBoxes([
          { type: 'missing', content: 'Incomplete Information' },
          ...parts.map((p) => ({ type: 'missing', content: p })),
          { type: 'default', content: 'Please send the missing details to proceed.' },
        ])
      } else {
        await pushAiBoxes([{ type: msgType, content: aiResponse }])
      }
    } finally {
      isRespondingRef.current = false
    }
  }

  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeader__subtitle"><h1>Champtrix Launch Pad</h1></div>
      </header>

      <main className="appMain" aria-label="Chat">
        <ChatWindow messages={messages} />
      </main>

      <footer className="appFooter">
        <InputBar onSend={handleSend} />
      </footer>
    </div>
  )
}