export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { district, estate, estateId, block, floor, flat, email, purpose } = req.body

  // Validate required fields
  if (!district || !estate || !block || !floor || !flat || !email || !purpose) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // Get environment variables
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL
    const GS_SECRET_TOKEN = process.env.GS_SECRET_TOKEN

    // Debug: Log environment variables (without exposing full token)
    console.log('=== API Debug Info ===')
    console.log('GOOGLE_SCRIPT_URL exists:', !!GOOGLE_SCRIPT_URL)
    console.log('GOOGLE_SCRIPT_URL value:', GOOGLE_SCRIPT_URL ? `${GOOGLE_SCRIPT_URL.substring(0, 50)}...` : 'NOT SET')
    console.log('GS_SECRET_TOKEN exists:', !!GS_SECRET_TOKEN)
    console.log('GS_SECRET_TOKEN length:', GS_SECRET_TOKEN ? GS_SECRET_TOKEN.length : 0)
    console.log('Request body:', { district, estate, estateId, block, floor, flat, email, purpose })

    // Check if environment variables are set
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'YOUR_DEPLOYED_WEB_APP_URL') {
      console.error('❌ GOOGLE_SCRIPT_URL not configured or is placeholder')
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'GOOGLE_SCRIPT_URL is not set in .env.local. Please check your environment variables.'
      })
    }

    if (!GS_SECRET_TOKEN) {
      console.error('❌ GS_SECRET_TOKEN not configured')
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'GS_SECRET_TOKEN is not set in .env.local. Please check your environment variables.'
      })
    }

    // Prepare request payload
    const payload = {
      action: 'submit_valuation',
      district,
      estate,
      estateId,
      block,
      floor,
      flat,
      email,
      purpose,
      timestamp: new Date().toISOString(),
      token: GS_SECRET_TOKEN, // Security token for authentication
    }

    console.log('📤 Sending request to Google Script...')
    console.log('Payload (without token):', { district, estate, estateId, block, floor, flat, email, purpose, timestamp: payload.timestamp })

    // Submit to Google Sheets via Web App with security token
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    console.log('📥 Google Script Response Status:', response.status)
    console.log('📥 Google Script Response OK:', response.ok)
    console.log('📥 Google Script Response Headers:', Object.fromEntries(response.headers.entries()))

    // Get response text first (for debugging)
    const responseText = await response.text()
    console.log('📥 Google Script Response Body (raw):', responseText)

    // Check if the request was successful
    if (!response.ok) {
      console.error('❌ Google Sheets API error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      })
      return res.status(500).json({ 
        error: 'Google Sheets submission failed',
        message: `Google Script returned status ${response.status}: ${responseText.substring(0, 200)}`
      })
    }

    // Try to parse response (Google Apps Script may return text or JSON)
    let result
    try {
      result = JSON.parse(responseText)
      console.log('✅ Successfully parsed JSON response:', result)
    } catch (parseError) {
      // If not JSON, treat as success if status is OK
      console.log('⚠️ Response is not JSON, treating as success')
      result = { success: true, rawResponse: responseText }
    }

    console.log('✅ Request successful!')
    return res.status(200).json({ success: true, data: result })
  } catch (error) {
    console.error('❌ Error submitting to Google Sheets:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    })
  }
}
