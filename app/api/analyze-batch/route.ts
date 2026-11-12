import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30; // 30 seconds max for AI

// In-memory sliding window rate limiter (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20; // Max 20 batch requests per minute per IP

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

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    if (checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment before trying again.' }, { status: 429 });
    }

    const { images, category } = await req.json();

    // 2. Payload Validation
    if (!images || !Array.isArray(images) || images.length === 0 || images.length > 5) {
      return NextResponse.json({ error: 'Please provide between 1 and 5 images.' }, { status: 400 });
    }

    for (const img of images) {
      if (typeof img !== 'string' || img.length > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image payload exceeds the maximum limit (10MB).' }, { status: 413 });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI is not configured. Missing API Key.' }, { status: 500 });
    }

    // Convert base64 data URIs to raw base64
    const parts: any[] = images.map((img: string) => {
      const base64Data = img.split(',')[1] || img;
      return {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg"
        }
      };
    });

    const promptText = `
    You are an AI assistant for a facility management system. The user uploaded a photo of a physical register or list of ${category} records.
    Your job is to read the document and extract ALL individuals/vehicles listed.
    
    If category is 'Vehicle', extract: name (driver or owner name), phone, id_number (vehicle plate), address (department or company).
    If category is 'Staff' or 'Volunteer', extract: name, phone, id_number (ID card or Aadhar), address (department, role, or location).
    
    Return EXACTLY a JSON array of objects. Do not wrap it in markdown block quotes like \`\`\`json. Return ONLY the raw JSON array.
    Format:
    [
      { "name": "...", "phone": "...", "id_number": "...", "address": "..." },
      ...
    ]
    
    If nothing is found, return an empty array [].
    `;

    parts.unshift({ text: promptText });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Gemini API Error: ${errText}` }, { status: response.status });
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({ records: [] });
    }

    // Clean up possible markdown wrappers
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);

    return NextResponse.json({ records: parsed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Batch analysis failed' }, { status: 500 });
  }
}
