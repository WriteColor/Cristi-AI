/**
 * Cristi AI - SessionTranscriptBuffer
 * Continuous dialogue history buffer across Live sessions.
 * Preserves volatile inter-session conversation (last 20-40 turns) between User and Model.
 * Strict Anti-Noise Filter: purges all toolCall, functionCalls, toolResponse, JSON blobs,
 * base64 binary chunks, and diagnostic artifacts to prevent context bloat and hallucination loops.
 * Calibrated for Google AI Studio quota limits (15 RPM / 1M TPM Free, 2000 RPM / 4M TPM Pay-as-you-go).
 */

export interface DialogueTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export class SessionTranscriptBuffer {
  private turns: DialogueTurn[] = [];
  private readonly maxTurns: number;
  private readonly maxTotalChars: number;

  constructor(maxTurns = 30, maxTotalChars = 24000) {
    this.maxTurns = Math.max(10, Math.min(50, maxTurns));
    this.maxTotalChars = maxTotalChars;
  }

  /**
   * Sanitizes and appends a conversational turn between user and model.
   * Discards any tool calls, function responses, JSON arguments, or binary blobs.
   */
  public addTurn(role: 'user' | 'model', rawText: string): void {
    if (!rawText || typeof rawText !== 'string') return;

    const cleaned = this.sanitizeText(rawText);
    if (!cleaned || cleaned.length < 2) return;

    // Avoid immediate duplicate consecutive turns with identical content
    const last = this.turns[this.turns.length - 1];
    if (last && last.role === role && last.text === cleaned) {
      return;
    }

    this.turns.push({
      role,
      text: cleaned,
      timestamp: Date.now(),
    });

    this.prune();
  }

  /**
   * Purges technical noise, tool calls, JSON dumps, base64 strings, and system tags.
   */
  public sanitizeText(text: string): string {
    let clean = text;

    // Strip JSON objects or arrays that might come from function calls / responses
    clean = clean.replace(/\{[\s\S]*?"(name|action|result|functionResponses|toolResponse)"[\s\S]*?\}/gi, '');
    clean = clean.replace(/```(json|javascript|typescript)?[\s\S]*?```/gi, '');

    // Strip base64 payloads
    clean = clean.replace(/data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]{60,}/gi, '');
    clean = clean.replace(/[a-zA-Z0-9+/]{120,}={0,2}/g, '');

    // Strip tool call artifacts and execution strings
    clean = clean.replace(/\[(TOOL_CALL|FUNCTION_CALL|TOOL_RESPONSE|IMAGE_FRAME|TELEMETRY)[\s\S]*?\]/gi, '');
    clean = clean.replace(/\b(call_[a-zA-Z0-9_]+|functionCall|toolResponse)\b/gi, '');

    // Normalize whitespace
    clean = clean.replace(/\s+/g, ' ').trim();

    return clean;
  }

  private prune(): void {
    // 1. Enforce max turn count (last N turns)
    if (this.turns.length > this.maxTurns) {
      this.turns = this.turns.slice(-this.maxTurns);
    }

    // 2. Enforce total character ceiling for strict TPM safety
    let totalChars = this.turns.reduce((acc, t) => acc + t.text.length, 0);
    while (this.turns.length > 2 && totalChars > this.maxTotalChars) {
      const removed = this.turns.shift();
      if (removed) totalChars -= removed.text.length;
    }
  }

  /**
   * Returns clean clientContent turns for session injection.
   */
  public getClientContentTurns(): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
    return this.turns.map(t => ({
      role: t.role,
      parts: [{ text: t.text }]
    }));
  }

  /**
   * Formats the clean conversation transcript for injection into systemInstruction.
   */
  public getFormattedTranscript(): string {
    if (this.turns.length === 0) return '';

    const lines = this.turns.map(t => {
      const speaker = t.role === 'user' ? 'Ariel' : 'Cristi';
      return `${speaker}: ${t.text}`;
    });

    return `\n\n=== CONTINUIDAD DE DIÁLOGO PREVIO ENTRE SESIONES ===\n` +
      `[HISTORIAL RECIENTE CONVERSACIONAL (Últimos ${this.turns.length} turnos directos)]:\n` +
      lines.join('\n') +
      `\n(Nota de continuidad: Esta es la conversación reciente inmediata. Mantén la continuidad natural del diálogo y de los temas tratados sin reiniciar tu personalidad ni pedir que te repita lo ya dicho.)`;
  }

  public getTurns(): readonly DialogueTurn[] {
    return [...this.turns];
  }

  public getEstimatedTokens(): number {
    const totalChars = this.turns.reduce((acc, t) => acc + t.text.length, 0);
    return Math.ceil(totalChars / 4);
  }

  public get count(): number {
    return this.turns.length;
  }

  public get isEmpty(): boolean {
    return this.turns.length === 0;
  }

  public clear(): void {
    this.turns = [];
  }
}

export const sessionTranscriptBuffer = new SessionTranscriptBuffer(30, 24000);
export default sessionTranscriptBuffer;
