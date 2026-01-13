export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address, email, purpose } = req.body

  if (!address || !email || !purpose) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // Google Sheets API integration
    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL
    const GS_SECRET_TOKEN = process.env.GS_SECRET_TOKEN

    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'YOUR_DEPLOYED_WEB_APP_URL') {
      // For development: log the data instead
      console.log('Form submission:', { address, email, purpose, timestamp: new Date().toISOString() })
      return res.status(200).json({ success: true, message: 'Data logged (development mode - please set GOOGLE_SCRIPT_URL in .env.local)' })
    }

    // Submit to Google Sheets via Web App with security token
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        email,
        purpose,
        timestamp: new Date().toISOString(),
        token: GS_SECRET_TOKEN, // Security token for authentication
      }),
    })

    if (!response.ok) {
      throw new Error('Google Sheets submission failed')
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error submitting to Google Sheets:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
