export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS, PATCH, DELETE, POST, PUT",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      query,
      systemPrompt,
      fallbackMessage = "Unable to understand the query. Please contact us directly.",
    } = req.body || {};

    if (!query || !systemPrompt) {
      return res.status(400).json({ error: "Missing query or systemPrompt" });
    }

    const errors = [];

    // Try OpenAI first
    try {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey && !openaiKey.startsWith("YOUR_")) {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: process.env.OPENAI_MODEL || "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query },
              ],
              temperature: 0.4,
              max_tokens: 220,
            }),
          },
        );

        const text = await response.text();
        if (response.ok) {
          const json = JSON.parse(text);
          const message = json?.choices?.[0]?.message?.content?.trim();
          if (message) {
            return res.status(200).json({ message, provider: "openai" });
          }
        } else {
          errors.push({
            provider: "openai",
            status: response.status,
            message: text.substring(0, 200),
          });
        }
      }
    } catch (error) {
      errors.push({ provider: "openai", error: String(error.message) });
    }

    // Try Gemini as fallback
    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && !geminiKey.startsWith("YOUR_")) {
        const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
          }),
        });

        const text = await response.text();
        if (response.ok) {
          const json = JSON.parse(text);
          const message = json?.candidates?.[0]?.content?.parts
            ?.map((part) => part?.text || "")
            .join("")
            .trim();
          if (message) {
            return res.status(200).json({ message, provider: "gemini" });
          }
        } else {
          errors.push({
            provider: "gemini",
            status: response.status,
            message: text.substring(0, 200),
          });
        }
      }
    } catch (error) {
      errors.push({ provider: "gemini", error: String(error.message) });
    }

    // All providers failed, return fallback
    return res.status(200).json({
      message: fallbackMessage,
      provider: "fallback",
      errors: errors,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: String(error.message || error),
    });
  }
}
