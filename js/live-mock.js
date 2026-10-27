// Demo modunda Gemini Live sunucusunu taklit eden sahte WebSocket. Gerçek sunucuyla aynı
// mesaj biçimini kullanır, böylece live.js anahtar ve mikrofon olmadan aynen denenebilir.
// Sesli giriş anlamaz; yazarak test moduyla gönderilen metinlere cevap verir.
import { mockLookup } from './gemini.js';

const REPLIES = [
  'That sounds interesting! What did you do after that?',
  'I see. How did you feel about it?',
  'Nice. Do you usually do that on weekends, or only sometimes?',
  'Really? Tell me a bit more about that.',
];

const LOOKUP_TOOLS = {
  weather: ['get_weather', 'city'],
  news: ['search_news', 'keywords'],
  wikipedia: ['search_wikipedia', 'query'],
  currency: ['get_exchange_rates', 'currencies'],
};

const SECONDS_PER_WORD = 0.12; // demo sessizdir; testler hızlı bitsin diye kısa tutulur

const short = (text, max = 220) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')}…`);

// Belirtilen süre kadar sessiz 24 kHz PCM, base64.
const silence = (seconds) => 'A'.repeat(Math.max(1, Math.round(seconds * 8000)) * 8);

export class MockLiveSocket {
  constructor() {
    this.readyState = 0;
    this.binaryType = 'blob';
    this.timers = new Set();
    this.busyUntil = 0;
    this.calls = 0;
    this.quiz = [];
    this.turn = 0;
    this.later(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 50);
  }

  later(fn, ms) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.readyState !== 3) fn();
    }, ms);
    this.timers.add(timer);
  }

  // Gerçek sunucu gibi ikili (ArrayBuffer) çerçeve gönderir.
  emit(message) {
    if (this.readyState === 1) this.onmessage?.({ data: new TextEncoder().encode(JSON.stringify(message)).buffer });
  }

  send(raw) {
    const message = JSON.parse(raw);
    if (message.setup) {
      this.setup = message.setup;
      this.later(() => {
        this.emit({ setupComplete: {} });
        this.emit({ sessionResumptionUpdate: { newHandle: 'demo-handle', resumable: true } });
      }, 150);
    } else if (message.realtimeInput?.text) {
      this.later(() => this.onText(message.realtimeInput.text), 250);
    } else if (message.toolResponse) {
      this.later(() => this.onToolResponse(message.toolResponse.functionResponses || []), 250);
    }
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 0);
  }

  hasTool(name) {
    return (this.setup?.tools?.[0]?.functionDeclarations || []).some((t) => t.name === name);
  }

  // Cümleyi parça parça "konuşur": yazıya dökümü ve sessiz ses parçaları, sonra turnComplete.
  speak(text) {
    const words = text.split(/\s+/);
    const start = Math.max(0, this.busyUntil - Date.now());
    let at = start;
    for (let i = 0; i < words.length; i += 6) {
      const chunk = words.slice(i, i + 6);
      this.later(() => {
        this.emit({ serverContent: { outputTranscription: { text: `${chunk.join(' ')} ` } } });
        this.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: silence(chunk.length * SECONDS_PER_WORD) } }] } } });
      }, at);
      at += 100;
    }
    this.later(() => this.emit({ serverContent: { turnComplete: true } }), at + 50);
    this.busyUntil = Date.now() + at + 100;
  }

  callTool(name, args) {
    this.emit({ toolCall: { functionCalls: [{ id: `call-${++this.calls}`, name, args }] } });
  }

  onText(text) {
    if (!text.startsWith('[App]')) {
      this.onLearner(text);
      return;
    }
    const quoted = text.match(/"([\s\S]+)"\s*$/)?.[1];
    if (/start of the (session|conversation)/.test(text)) {
      if (/vocabulary_quiz/.test(text)) {
        this.speak('Hi! Let\'s start with a quick vocabulary quiz.');
        this.later(() => this.callTool('vocabulary_quiz', {}), 600);
        return;
      }
      const material = this.setup?.systemInstruction?.parts?.[0]?.text.split('Material fetched from Wikipedia today')[1];
      const item = material?.split('\n').find((l) => l.startsWith('- '))?.slice(2).replace(/^\[[^\]]*\]\s*/, '');
      this.speak(item ? `Hi! Here is something interesting from today. ${short(item)} What do you think?` : 'Hi! Nice to talk with you. How has your day been so far?');
    } else if (/Coach note/.test(text)) {
      this.speak(`Quick feedback. ${short(text.replace(/^[\s\S]*?:\s*/, ''), 200)}`);
    } else if (quoted) {
      this.speak(quoted);
    } else if (/is back/.test(text)) {
      this.speak('Welcome back! So, where were we?');
    } else {
      this.speak('Okay, let\'s move on. What else would you like to talk about?');
    }
  }

  onLearner(text) {
    const s = text.toLowerCase();
    if (this.quiz.length) {
      const phrase = this.quiz.shift();
      this.callTool('record_quiz_answer', { phrase, correct: s.includes(phrase.split(' ')[0].toLowerCase()) });
    } else if (/\b(bye|end the session|that's all)\b/.test(s)) {
      this.callTool('end_session', {});
    } else if (/\b(pause|hold on|wait a)\b/.test(s)) {
      this.callTool('pause_session', {});
    } else if (/\bfeedback\b|how am i doing/.test(s)) {
      this.callTool('give_feedback', {});
    } else if (/\bquiz\b/.test(s)) {
      this.callTool('vocabulary_quiz', {});
    } else {
      const lookup = mockLookup(text);
      const tool = lookup && LOOKUP_TOOLS[lookup.lookup];
      if (tool && this.hasTool(tool[0])) {
        this.speak('Let me check.');
        this.later(() => this.callTool(tool[0], { [tool[1]]: lookup.query }), 400);
      } else {
        this.turn += 1;
        this.speak(REPLIES[this.turn % REPLIES.length]);
      }
    }
  }

  onToolResponse(responses) {
    for (const { name, response } of responses) {
      const result = response?.result;
      if (name === 'end_session') {
        this.speak('It was great talking with you. Goodbye!');
      } else if (name === 'pause_session') {
        this.speak('Sure, I\'ll wait.');
      } else if (name === 'give_feedback') {
        const mistakes = result?.mistakes || [];
        this.speak(mistakes.length
          ? `Here is some feedback. ${mistakes.map((m) => `You said "${m.said}"; better: "${m.better}".`).join(' ')} Let's continue!`
          : 'I didn\'t notice any new mistakes. Well done!');
      } else if (name === 'vocabulary_quiz') {
        this.quiz = (result?.phrases || []).map((p) => p.phrase).slice(0, 2);
        this.speak(this.quiz.length ? `Make a sentence with "${this.quiz[0]}".` : 'You don\'t have any saved phrases yet. Let\'s just chat.');
      } else if (name === 'record_quiz_answer') {
        this.speak(this.quiz.length ? `Thanks! Next one: make a sentence with "${this.quiz[0]}".` : 'Great job! Now, back to our chat.');
      } else {
        const found = (typeof result === 'string' ? result : JSON.stringify(result))
          .split('\n').map((l) => l.replace(/^- /, '')).filter((l) => l && !l.endsWith(':')).slice(0, 2).join(' ');
        this.speak(`Here's what I found. ${short(found)} What do you think about that?`);
      }
    }
  }
}
