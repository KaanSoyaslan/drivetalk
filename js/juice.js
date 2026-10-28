// Dokunma hissi: basınca dalga (ripple), kısa titreşim, panellerin kayarak kapanması,
// listelerin sırayla belirmesi ve Başla'daki patlama. "Hareketi azalt" açıksa animasyonlar kapanır.
const RIPPLE = '.btn, .btn-primary, .btn-control, .picker, .chip, .char-card, .segmented button, .session-card, .sheet-close';
const HAPTIC = `${RIPPLE}, .tabs button, .home-char, .stage-char, .switch`;
const SHEET_CLOSE_MS = 220;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Android'de hafif bir tık hissi; desteklemeyen cihazda sessizce geçer.
export function haptic(ms = 8) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // tarayıcı ilk dokunuştan önce izin vermez
  try { navigator.vibrate?.(ms); } catch { /* izin yok */ }
}

export function installTouchFeedback() {
  document.addEventListener('pointerdown', (e) => {
    const target = e.target.closest(RIPPLE);
    if (!target || target.disabled || reducedMotion.matches) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
    target.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }, { passive: true });
  // Titreşim tıklamada: kaydırırken parmak bir düğmeye değince titremesin.
  document.addEventListener('click', (e) => {
    const target = e.target.closest(HAPTIC);
    if (target && !target.disabled) haptic(target.matches('.btn-primary, .btn-control') ? 14 : 7);
  }, { passive: true });
}

// Alttan açılan paneller kapanırken aşağı kayar (close() her yerden çağrılsa da).
export function animateSheets(sheets) {
  const nativeClose = HTMLDialogElement.prototype.close;
  for (const sheet of sheets) {
    sheet.close = function close(...args) {
      if (!this.open || this.classList.contains('closing')) return;
      if (reducedMotion.matches) {
        nativeClose.apply(this, args);
        return;
      }
      this.classList.add('closing');
      setTimeout(() => {
        this.classList.remove('closing');
        nativeClose.apply(this, args);
      }, SHEET_CLOSE_MS);
    };
    sheet.addEventListener('cancel', (e) => {
      e.preventDefault();
      sheet.close();
    });
  }
}

// Çocuklara sıra numarası verir; CSS her birini biraz gecikmeyle getirir (--i).
export function stagger(nodes) {
  [...nodes].forEach((node, i) => node.style.setProperty('--i', i));
}

// Animasyonu baştan oynatır (aynı sınıf tekrar eklenince CSS yeniden başlatmaz).
export function replay(node, className) {
  if (!node || reducedMotion.matches) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

// Düğmenin ortasından ekrana yayılan renk dalgası (oturuma geçiş).
export function burst(from) {
  if (reducedMotion.matches) return;
  const rect = from.getBoundingClientRect();
  const wave = document.createElement('div');
  wave.className = 'launch-burst';
  wave.style.left = `${rect.left + rect.width / 2}px`;
  wave.style.top = `${rect.top + rect.height / 2}px`;
  document.body.append(wave);
  wave.addEventListener('animationend', () => wave.remove());
}
