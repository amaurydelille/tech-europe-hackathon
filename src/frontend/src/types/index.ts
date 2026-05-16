export interface Course {
  id: string;
  title: string;
  description: string;
  videoUrl?: string;
  status: "pending" | "generating" | "ready";
  createdAt: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Persona {
  learningStyle: string;
  priorKnowledge: string;
  topic: string;
}

export interface ApiError {
  message: string;
  status: number;
}
