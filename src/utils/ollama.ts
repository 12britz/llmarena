import { OllamaModel, ArenaResult } from '../types';

const OLLAMA_URL = 'http://localhost:11434';

export class OllamaAdapter {
  private baseUrl: string;

  constructor(url: string = OLLAMA_URL) {
    this.baseUrl = url;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('Failed to fetch models from Ollama');
    }
    const data = await response.json() as { models?: OllamaModel[] };
    return data.models || [];
  }

  async generateResponse(
    model: string,
    prompt: string,
    onChunk?: (text: string) => void
  ): Promise<ArenaResult> {
    const startTime = performance.now();
    let fullResponse = '';
    let inputTokens = 0;
    let outputTokens = 0;

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullResponse += data.response;
            onChunk?.(data.response);
          }
          if (data.prompt_eval_count) {
            inputTokens = data.prompt_eval_count;
          }
          if (data.eval_count) {
            outputTokens = data.eval_count;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000;
    const tokensPerSecond = outputTokens > 0 ? outputTokens / totalTime : 0;

    return {
      modelId: model,
      modelName: model,
      response: fullResponse,
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      totalTime: Math.round(totalTime * 100) / 100,
      inputTokens,
      outputTokens,
    };
  }
}

export const ollama = new OllamaAdapter();
