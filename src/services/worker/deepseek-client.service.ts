import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ConfigService } from '../../config/config.service.js';

/**
 * Tool definition as sent to DeepSeek's API.
 * Uses OpenAI-compatible function calling format.
 */
export interface WorkerToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * DeepSeekClient — wraps the OpenAI SDK for communication with DeepSeek's API.
 *
 * Key configuration (PRD §7.3, verified July 2026):
 * - Base URL: https://api.deepseek.com (NOT /anthropic — broken tool calls)
 * - Thinking mode: OFF by default (required for temperature: 0 to work)
 * - Temperature: 0 (deterministic implementation work)
 * - Model: from DEEPSEEK_MODEL env (default deepseek-v4-flash)
 * - AbortSignal passthrough for cancellation
 */
@Injectable()
export class DeepSeekClient {
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  /**
   * Send a chat completion request to DeepSeek.
   * Non-streaming — the worker loop processes the full response.
   */
  async chatCompletion(params: {
    messages: ChatCompletionMessageParam[];
    tools?: WorkerToolDefinition[];
    signal?: AbortSignal;
  }): Promise<ChatCompletionResult> {
    // Build request body
    const body: Record<string, unknown> = {
      model: this.config.deepseekModel,
      messages: params.messages,
      temperature: 0,
      max_tokens: 128_000,
      // Honor DS_WORKER_THINKING config (default false).
      // When thinking is ON, temperature is silently ignored by DeepSeek.
      thinking: this.config.workerThinking
        ? { type: 'enabled' as const }
        : { type: 'disabled' as const },
    };

    // Attach tools if provided
    if (params.tools && params.tools.length > 0) {
      body['tools'] = params.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      body['tool_choice'] = 'auto';
    }

    // Use raw fetch to pass AbortSignal through the OpenAI SDK
    const response = await this.client.chat.completions.create(
      body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { signal: params.signal },
    );

    const choice = response.choices?.[0];
    if (!choice) {
      return {
        content: null,
        toolCalls: [],
        finishReason: 'stop',
      };
    }

    const message = choice.message;

    // Extract tool calls if present
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        // Log malformed JSON so the issue is visible, then return as-is
        // so the worker sees the raw arguments in the error
        args = { _malformed: tc.function.arguments };
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      };
    });

    return {
      content: message.content,
      toolCalls,
      finishReason: choice.finish_reason,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
