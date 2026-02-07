// pages/api/debug.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// 这是一个诊断 API，用来查看你的 API Key 能看到什么模型
export default async function handler(req, res) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const data = await response.json();
    
    res.status(200).json({ 
      status: "Check Success",
      available_models: data 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}