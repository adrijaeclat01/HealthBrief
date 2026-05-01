export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64, mimeType } = req.body;

  if (!base64 || !mimeType) {
    return res.status(400).json({ error: 'Missing file data' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are a medical report reader helping elderly patients understand their health reports in simple language.

Analyse the uploaded medical report carefully. Return ONLY a valid JSON object with this exact structure:

{
  "parameters": [
    {
      "name": "Parameter name (e.g. Haemoglobin, Blood Sugar, Blood Pressure)",
      "value": "The actual value with unit (e.g. 11.2 g/dL, 98 mg/dL)",
      "status": "normal or abnormal or borderline",
      "note": "One short plain-English sentence about what this means (e.g. Slightly low — may cause tiredness)"
    }
  ],
  "actions": [
    {
      "text": "Clear plain-English instruction of what the patient needs to do (e.g. Get a repeat blood sugar test)",
      "timing": "When to do it (e.g. Within the next 2 weeks, At your next visit, In 3 months)"
    }
  ]
}

Rules:
- Use simple words a 70-year-old can understand. No jargon.
- For status: use "normal" if within range, "abnormal" if clearly out of range, "borderline" if slightly off
- List all key parameters found in the report
- Actions should be specific tests to repeat, doctor visits needed, or lifestyle steps — no vague advice
- Do NOT include recommendations or treatment suggestions — only what tests/checkups are needed
- Return ONLY the JSON object, no markdown, no explanation`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64
                  }
                },
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1500
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      console.error('Gemini error:', errData);
      return res.status(500).json({ error: 'Could not read report. Please check the file and try again.' });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip any markdown fences if present
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse failed:', cleaned);
      return res.status(500).json({ error: 'Could not process the report. Please try a clearer image or PDF.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
