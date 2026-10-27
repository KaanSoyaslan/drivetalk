// Kısa sesli komutları tanır. Uzun cümleler her zaman normal sohbet sayılır,
// böylece "I gave my team feedback yesterday" gibi bir cümle komut olarak algılanmaz.
const MAX_COMMAND_WORDS = 6;

// Sıra önemli: "stop the session" önce "end" olarak eşleşmeli, "pause" olarak değil.
const COMMANDS = [
  ['end', /\b(end|finish|stop) (the |this |our )?(session|practice|lesson|conversation)\b|\bthat'?s (all|it) for today\b|^(ok |okay )?(good ?bye|bye bye)\b/],
  ['feedback', /^(ok |okay )?(give me |can i (get|have) |(i want |i'd like )?(some |any |my )?)?feedback( please| now)?$|\bhow am i doing\b|\b(any|my) mistakes\b|\bcorrect me\b/],
  ['quiz', /\bquiz me\b|\b(vocabulary|word|phrase)s? (quiz|test|practice|review)\b|\b(test|review|practi[cs]e) (my )?(vocabulary|words|phrases)\b/],
  ['repeat', /^(sorry |ok |okay )?(can you |could you |please )?repeat( that| it| please| again)*$|\bsay (that|it) again\b|^pardon\b|^come again\b|\bwhat did you say\b/],
  ['slower', /^(a bit |a little )?slower( please)?$|\b(speak|talk) (a bit |a little )?(slower|more slowly)\b|\bslow down\b/],
  ['faster', /^(a bit |a little )?faster( please)?$|\b(speak|talk) (a bit |a little )?(faster|more quickly)\b|\bspeed up\b/],
  ['newtopic', /\b(new|another|different|next) (topic|subject|question)\b|\bchange the (topic|subject)\b/],
  ['pause', /^(pause|stop|wait|hold on)( please)?$|\bwait a (moment|minute|second)\b|\bhold on\b|\bpause\b/],
  ['resume', /^(resume|continue|go on|go ahead)\b|\bi'?m back\b|\blet'?s (continue|go on)\b|^(ok |okay )?(continue|resume)\b/],
];

export function normalize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function parseCommand(text) {
  const clean = normalize(text);
  if (!clean || clean.split(' ').length > MAX_COMMAND_WORDS) return null;
  for (const [id, re] of COMMANDS) {
    if (re.test(clean)) return id;
  }
  return null;
}
