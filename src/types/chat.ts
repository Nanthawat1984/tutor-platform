// Booking-scoped chat types — reuse Firestore, no new infra.
// messages/{messageId}: booking-scoped, readable only by booking parties.
export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderRole: 'teacher' | 'parent';
  text: string;
  createdAt: unknown;
}

export const CHAT_COLLECTION = 'messages';
export const CHAT_MAX_LENGTH = 1000;
