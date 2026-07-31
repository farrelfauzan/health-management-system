/**
 * The §3.1 rule 4 escalation copy, returned **instead of** calling the
 * provider when an emergency pattern matches. Deterministic on purpose: when
 * someone describes chest pain, the right answer must not depend on an
 * upstream API being reachable, on a model's mood, or on the safety guards
 * catching whatever it decided to say. 119 is Indonesia's national emergency
 * ambulance line (PSC 119); 112 is the general emergency number.
 */
export const AI_CHAT_EMERGENCY_TEMPLATE = [
  'Gejala yang Anda sebutkan bisa merupakan keadaan darurat medis.',
  'Segera hubungi 119 (ambulans) atau 112, atau pergi ke IGD rumah sakit terdekat sekarang.',
  'Jangan menunggu balasan dari layanan ini.',
  '',
  'The symptoms you described may be a medical emergency.',
  'Call 119 (ambulance) or 112 immediately, or go to the nearest hospital emergency department (IGD) now.',
  'Do not wait for a reply from this service.',
].join('\n');
