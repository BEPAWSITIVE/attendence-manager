import { NextResponse } from 'next/server';

// In-memory sliding window rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // Max 30 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  if (rateLimitMap.size > 1000) {
    rateLimitMap.forEach((v, k) => {
      if (now > v.resetTime) rateLimitMap.delete(k);
    });
  }
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_REQUESTS) {
    return true;
  }
  entry.count += 1;
  return false;
}

export async function POST(req: Request) {
  try {
    // 1. IP Rate Limiting
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    if (checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment before trying again.' }, { status: 429 });
    }

    const { images } = await req.json();
    
    // 2. Payload Validation
    if (!images || !Array.isArray(images) || images.length === 0 || images.length > 5) {
      return NextResponse.json({ error: 'Invalid images payload. Maximum 5 images allowed per request.' }, { status: 400 });
    }

    for (const img of images) {
      if (typeof img !== 'string' || img.length > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image payload exceeds the maximum limit (10MB).' }, { status: 413 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing. Add it to Vercel env vars.' }, { status: 500 });
    }

    const parts: any[] = images.map((base64Data: string) => {
      const b64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
      return {
        inlineData: {
          mimeType: "image/jpeg",
          data: b64
        }
      };
    });

    parts.push({
      text: `Analyze the provided image(s). Determine if it is a delivery package/parcel OR an ID document (Aadhaar, DL, Passport, Voter ID, ID Card, etc.).
Return ONLY a raw JSON object (no markdown formatting, no code blocks) with the following exact structure:

If it is a delivery parcel:
{"type": "parcel", "company_name": "Delivery company like Amazon, Flipkart, BlueDart, Swiggy", "recipient_name": "Name of person receiving it", "order_id": "Order ID or Order Number if printed on label (e.g. 402-1234567-8901234, OD123456, or order #)", "barcode": "Any tracking number, AWB, or barcode number text"}

If it is an ID document (for a visitor):
{"type": "visitor", "name": "Full name of the person", "id_number": "The ID number", "address": "Full address if visible"}

If it is completely unreadable or neither:
{"type": "unknown"}
`
    });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) {
      return NextResponse.json({ type: 'unknown' });
    }

    const jsonStr = textOutput.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);

    return NextResponse.json(result);

  } catch (err: any) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: err.message || 'Failed to analyze document' }, { status: 500 });
  }
}
