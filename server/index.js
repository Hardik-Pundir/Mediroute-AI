import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config({ path: "../.env" });

const app = express();
app.use(cors());
app.use(express.json());

// 🚑 EXPLICIT API KEY
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
  res.send("🚑 MediBot Backend Running");
});

app.post("/medibot", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question?.trim()) {
      return res.json({
        reply: "Please describe the patient condition clearly."
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are MediBot — an ambulance emergency nurse.
              ABSOLUTE RULES (DO NOT BREAK):
              - Respond ONLY in plain text
              - EACH step MUST be on a NEW LINE
              - Add a BLANK LINE between steps
              - DO NOT combine steps in one sentence
              - DO NOT use paragraphs
              - DO NOT explain
              - DO NOT greet
              - DO NOT conclude

              EXACT OUTPUT FORMAT (MANDATORY):

              • Step one

              • Step two

              • Step three

              Patient condition:
              ${question}`
            }
          ]
        }
      ]
    });

    const reply =
      response?.text ||
      response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "• Maintain airway\n• Check breathing\n• Transport immediately";

    res.json({ reply });
    } catch (err) {
      console.error("GEMINI ERROR:", err);
      res.json({
        reply: "• Maintain airway\n• Check breathing\n• Transport immediately"
      });
    }
});

app.listen(5050, "0.0.0.0", () => {
  console.log("🚑 MediBot LIVE on http://localhost:5050");
});
