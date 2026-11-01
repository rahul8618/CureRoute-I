// FALLBACK ROUTE: Used when the FastAPI NLP backend is unavailable.
// The primary pipeline now runs through the Python FastAPI server with Hugging Face models.
import { NextRequest, NextResponse } from "next/server";

// TODO: ADD YOUR OPENROUTER_API_KEY IN .env.local
// Get your key at: https://openrouter.ai/keys
const apiKey = process.env.OPENROUTER_API_KEY?.trim();

const SEVERE_KEYWORDS = [
  "chest pain",
  "heart attack",
  "stroke",
  "bleeding",
  "blood",
  "breathing difficulty",
  "shortness of breath",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "unconscious",
  "seizure",
  "convulsion",
  "severe pain",
  "paralysis",
  "choking",
  "suicidal",
  "suicide",
  "overdose",
  "poisoning",
  "anaphylaxis",
  "allergic reaction severe",
  "head injury",
  "broken bone",
  "fracture",
];

/**
 * Build the Chain of Thought system prompt, injecting the user's selected language.
 * Uses OpenRouter with Llama 3 — no external SDK needed.
 */
function buildSystemPrompt(language: string): string {
  const langName =
    {
      en: "English",
      hi: "Hindi",
      kn: "Kannada",
      ta: "Tamil",
      te: "Telugu",
    }[language] || "English";

  return `You are a medical triage assistant. The user prefers to communicate in ${langName}. First, internally analyze the provided symptoms to identify the most likely root cause. Second, based on that specific cause, suggest 2 highly specific, safe over-the-counter (OTC) or home remedies. Ensure they do not conflict with any provided allergies/prescriptions. Third, you MUST append this exact text at the end: '⚠️ MEDICAL DISCLAIMER: I am an AI, not a doctor. Consult a healthcare provider.' 

CRITICAL: The user has requested the response in ${langName}. You MUST generate the entire clinical assessment, home remedies, and doctor disclaimers completely in ${langName}. DO NOT use English if ${langName} is not English.

Additional rules:
- If the user describes SEVERE/EMERGENCY symptoms (chest pain, heavy bleeding, breathing difficulty, stroke symptoms, seizures, loss of consciousness, severe allergic reactions, head injuries, broken bones, suicidal thoughts, overdose, poisoning), REFUSE to provide home remedies, strongly urge IMMEDIATE emergency care (call 112/108 in India), and still append the disclaimer.
- If an image description or prescription details are mentioned, extract any allergies or existing medications and ensure your suggestions do not conflict with them.
- Use markdown formatting with ## headers, bullet points, and **bold** text.
- Structure: Assessment → Likely Root Cause → Specific Remedies → When to See a Doctor → Disclaimer.
- Be empathetic and caring. Never diagnose — only suggest what symptoms "might indicate."`;
}

export async function POST(request: NextRequest) {
  let symptoms = "";
  let language = "en";

  try {
    const contentType = request.headers.get("content-type") || "";
    let prescriptionInfo = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      symptoms = (formData.get("symptoms") as string) || "";
      language = (formData.get("language") as string) || "en";

      const file = formData.get("file") as File | null;
      if (file && file.size > 0) {
        prescriptionInfo =
          "\n\n[The user has uploaded a medical document/prescription. Please ask them to describe any medications or allergies listed on it, and ensure your suggestions do not conflict.]";
      }
    } else {
      const body = await request.json();
      symptoms = body.symptoms || "";
      language = body.language || "en";
    }

    if (!symptoms || typeof symptoms !== "string" || symptoms.trim().length === 0) {
      return NextResponse.json({ error: "Please describe your symptoms." }, { status: 400 });
    }

    // Check for severe symptoms
    const lowerSymptoms = symptoms.toLowerCase().trim();
    const isSevere = SEVERE_KEYWORDS.some((keyword) => lowerSymptoms.includes(keyword));

    if (!apiKey || apiKey === "YOUR_OPENROUTER_API_KEY_HERE") {
      return NextResponse.json({
        error: "AI triage is not configured. Set OPENROUTER_API_KEY in the Vercel project environment variables and redeploy.",
      }, { status: 503 });
    }

    const langNameForCmd = {
      en: "English",
      hi: "Hindi",
      kn: "Kannada",
      ta: "Tamil",
      te: "Telugu",
    }[language] || "English";

    const translationCommand = language !== 'en' 
      ? `\n\n[CRITICAL INSTRUCTION: TRANSLATE YOUR ENTIRE RESPONSE TO THE PREFERRED LANGUAGE (${langNameForCmd}). DO NOT OUTPUT IN ENGLISH. YOU MUST REPLY IN ${langNameForCmd.toUpperCase()} ONLY!]` 
      : "";

    const userMessage = prescriptionInfo
      ? `Patient symptoms: ${symptoms.trim()}${prescriptionInfo}${translationCommand}`
      : `Patient symptoms: ${symptoms.trim()}${translationCommand}`;

    // Call OpenRouter API using native fetch with stream: true
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : request.nextUrl.origin,
        "X-Title": "CureRoute",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct",
        temperature: 0.4,
        max_tokens: 2048,
        stream: true,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(language),
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      return NextResponse.json({ error: `OpenRouter API returned ${response.status}` }, { status: response.status });
    }

    // Pipe the raw readable stream directly back to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        // Pass the pre-computed severity flag in headers so the client knows it
        "X-Is-Severe": isSevere ? "true" : "false",
      },
    });
  } catch (error) {
    console.error("Triage API error:", error);
    return NextResponse.json(
      { error: "The AI service could not process this request. Please try again shortly." },
      { status: 502 }
    );
  }
}
