export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    addEventListener('keydown', (e) => {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  down(code) { return this.keys.has(code); }

  // -1 when `neg` is held, +1 when `pos` is held
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  // true once per key press
  consume(code) { return this.pressed.delete(code); }

  endFrame() { this.pressed.clear(); }
}
