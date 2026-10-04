import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPlan } from './ai.types';

export interface LlamafilePlanResult {
  plan: AiPlan;
  model: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export function extractLlamafilePlanJson(text: string): AiPlan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? text).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error('Local model returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Local model returned invalid JSON');
  }

  return parsed as AiPlan;
}

@Injectable()
export class LlamafileProvider {
  constructor(private readonly config: ConfigService) {}

  async plan(task: string, context: Record<string, unknown>, tools: unknown[]): Promise<LlamafilePlanResult> {
    const endpoint = this.config.get<string>('JASLYN_LLAMAFILE_ENDPOINT', 'http://127.0.0.1:8080/v1').trim();
    const model = this.config.get<string>('JASLYN_LLAMAFILE_MODEL', 'LLaMA_CPP').trim();
    const apiKey = this.config.get<string>('JASLYN_LLAMAFILE_API_KEY', '').trim();
    const timeoutMs = Math.max(1000, this.config.get<number>('JASLYN_LLAMAFILE_TIMEOUT_MS', 15000));

    const url = this.chatCompletionsUrl(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1800,
          messages: [
            {
              role: 'system',
              content: 'You are the JASLYN NET local operations planner. Return ONLY valid JSON matching {summary:string,steps:[{id?:string,title:string,agent:string,capability:string,toolKey:string,risk:string,requiresApproval:boolean,verify:string}],stopConditions:string[]}. Use only the supplied tool keys. Never invent tools. HIGH and CRITICAL require approval. Never claim an action was executed; produce a plan only.',
            },
            {
              role: 'user',
              content: JSON.stringify({ task, context, tools }),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).trim().slice(0, 500);
        throw new Error(`Llamafile request failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('Llamafile returned no planning content');

      return {
        plan: extractLlamafilePlanJson(content),
        model: payload.model ?? model,
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private chatCompletionsUrl(endpoint: string): string {
    const base = endpoint.replace(/\/+$/, '');
    if (base.endsWith('/chat/completions')) return base;
    if (base.endsWith('/v1')) return `${base}/chat/completions`;
    return `${base}/v1/chat/completions`;
  }
}
