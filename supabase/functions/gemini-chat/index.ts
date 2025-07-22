import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string
    }>
  }>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
  }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message, context } = await req.json()
    
    if (!message) {
      throw new Error('Message is required')
    }

    // Remove Deno.env and .env usage, always use the hardcoded key
    const geminiApiKey = 'AIzaSyBzIwU6Kn_0J77zo8tgTtlJpU_y5S4LbbM';
    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured')
    }

    // Create request for Gemini
    const geminiRequest: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: `You are an AI assistant that helps users browse the web and complete tasks. Parse the user's request and provide:
              1. A clear understanding of what they want
              2. The action to take (browse, search, order, book, etc.)
              3. Any specific details or preferences
              4. If it requires web browsing, indicate which site or search to perform
              
              User request: ${message}
              ${context ? `Context: ${context}` : ''}
              
              Respond in a conversational way and indicate what browsing action you'll take.`
            }
          ]
        }
      ]
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify(geminiRequest),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Gemini API error:', error)
      throw new Error('Failed to get response from Gemini')
    }

    const data: GeminiResponse = await response.json()
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini')
    }

    const aiResponse = data.candidates[0].content.parts[0].text

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})