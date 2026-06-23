export default async function handler(req, res) {

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: 'ok' });
  }

  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    return res.status(405).json({ error: 'Not allowed' });
  }
  try {

    const { query } = req.body;
    const { GoogleGenAI } = await import('@google/genai');

    const ai = new GoogleGenAI({});

    const data = ``;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: `
        Query: ${query}
        Return: A single concise, natural, accurate answer (1–3 short paragraphs). If the draft lacks necessary info, return exactly: Sorry! I am unable to understand your question. Please contact PixelWeave Team directly at pixelweave.tech@gmail.com.
        `,
      config: {
        thinkingConfig: {
          thinkingBudget: 0, // Disables thinking
        },
        temperature: 0.2,
        systemInstruction: `You are a personal ai assistant of PixelWeave, a tech startup that empowers other businesses to grow, and is hosted on official Pixelweave website. Your primary task is to assist website visitors by answering their queries on brand\'s behalf. Here is some of the information about the company. DATA: ${data}\nUse ONLY given information. Do NOT invent facts. Output ONLY the final answer text — no JSON, no commentary, nothing else.`
      }
    });

    res.status(200).json({ message: response.text, "request.header": req.header });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error: "+ e.message });
  }
}