function json(res, status, payload) {
  res.status(status).json(payload);
}

function pickMessageFromOpenAI(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.choices?.[0]?.message?.content?.trim();
  } catch {
    return "";
  }
}

function pickMessageFromGemini(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();
  } catch {
    return "";
  }
}

async function callOpenAI({ query, systemPrompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    temperature: 0.4,
    max_tokens: 220,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${text}`);
  }

  const message = pickMessageFromOpenAI(text);
  if (!message) {
    throw new Error("OpenAI returned empty response");
  }

  return message;
}

async function callGemini({ query, systemPrompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: query }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 220,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${text}`);
  }

  const message = pickMessageFromGemini(text);
  if (!message) {
    throw new Error("Gemini returned empty response");
  }

  return message;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 200, { success: "ok" });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Not allowed" });
  }

  try {
    const {
      query,
      systemPrompt,
      fallbackMessage = "Unable to understand the query. Please contact us directly.",
    } = req.body || {};

    if (!query || !systemPrompt) {
      return json(res, 400, { error: "Missing query or systemPrompt" });
    }

    const providers = [
      { name: "openai", run: () => callOpenAI({ query, systemPrompt }) },
      { name: "gemini", run: () => callGemini({ query, systemPrompt }) },
    ];

    const errors = [];
    for (const provider of providers) {
      try {
        const message = await provider.run();
        if (message) {
          return json(res, 200, { message, provider: provider.name });
        }
      } catch (error) {
        errors.push({
          provider: provider.name,
          reason: String(error.message || error),
        });
      }
    }

    return json(res, 200, {
      message: fallbackMessage,
      provider: "fallback",
      errors,
    });
  } catch (error) {
    return json(res, 500, {
      error: "Internal Server Error",
      details: String(error.message || error),
    });
  }
}
