import { NextRequest } from "next/server";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getSessionUser } from "@/lib/session";
import { buildTools, systemPromptFor } from "@/lib/ai/tools";

// Asistente IA (fusión Codia Task, fase A — solo lectura). Gemini vía
// tier gratuito de Google AI Studio en vez de OpenAI (que usaba Codia
// Task) — sin GOOGLE_GENERATIVE_AI_API_KEY configurada, responde con un
// mensaje claro en vez de fallar silenciosamente, mismo patrón que
// RESEND_API_KEY en lib/email.ts.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role === "CLIENTE") {
    return new Response("No autorizado", { status: 401 });
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return new Response(
      "El asistente no está configurado todavía (falta GOOGLE_GENERATIVE_AI_API_KEY).",
      { status: 503 },
    );
  }

  const { messages }: { messages: UIMessage[] } = await req.json();
  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: await systemPromptFor(user),
    messages: await convertToModelMessages(messages),
    tools: buildTools(user),
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
