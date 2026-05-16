"use client";

import { useState } from "react";
import { chatService } from "@/services/chat.service";
import type { Message, Persona } from "@/types";

export function useChat(persona: Persona) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  async function send(content: string) {
    setLoading(true);
    try {
      const reply = await chatService.sendMessage(content, persona);
      setMessages((prev) => [...prev, reply]);
      return reply;
    } finally {
      setLoading(false);
    }
  }

  return { messages, loading, send };
}
