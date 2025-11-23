import { GoogleGenAI, Type } from "@google/genai";

export const extractBillDetails = async (base64Image: string): Promise<{ customerName: string; address: string; invoiceNo: string; billDate: string }> => {
  if (!process.env.API_KEY) {
    console.warn("Gemini API Key is missing. Returning empty details.");
    return { customerName: '', address: '', invoiceNo: '', billDate: '' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Extract base64 data if it includes the prefix (e.g., data:image/jpeg;base64,...)
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: "Analyze this bill image. Extract the Shop Name (or Customer Name), Full Address (City/Area), Invoice Number, and Bill Date. Return date in YYYY-MM-DD format. For 'customerName', prioritize the Shop/Business Name over a person's name if both are present. If a field is not found, return an empty string.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            address: { type: Type.STRING },
            invoiceNo: { type: Type.STRING },
            billDate: { type: Type.STRING },
          },
        },
      },
    });

    let text = response.text;
    if (text) {
      // Remove markdown code blocks if present to prevent JSON.parse errors
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      return JSON.parse(text);
    }
    throw new Error("No text returned from Gemini");
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    // Fallback to manual entry if AI fails
    return { customerName: '', address: '', invoiceNo: '', billDate: '' };
  }
};

export const sendGeminiChat = async (history: { role: string; parts: { text: string }[] }[], newMessage: string, context: string): Promise<string> => {
    if (!process.env.API_KEY) return "I need an API Key to chat! (Check metadata.json setup)";
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: `You are Grace, a helpful packing assistant. 
                Current Context: ${context}
                Keep answers short, friendly, and focused on logistics/packing.`,
            },
            history: history
        });

        const result = await chat.sendMessage({ message: newMessage });
        return result.text || "I didn't catch that.";
    } catch (e: any) {
        console.error("Chat Error", e);
        return "Sorry, I'm having trouble connecting right now.";
    }
};