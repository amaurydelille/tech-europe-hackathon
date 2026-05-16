import { fetcher } from "@/lib/fetcher";
import type { Message, Persona } from "@/types";

export const chatService = {
  sendMessage: (content: string, persona: Persona) =>
    fetcher.post<Message>("/api/chat", { content, persona }),

  getHistory: (sessionId: string) =>
    fetcher.get<Message[]>(`/api/chat/${sessionId}/history`),
};
