class Joystick {
    constructor(elemento) {
        this.el = elemento;
        this.circle = elemento.querySelector(".circle");
        this.horizontal = elemento.querySelector(".horizontal-line");
        this.vertical = elemento.querySelector(".vertical-line");

        this.x = 0; // -1 (esquerda) .. 1 (direita)
        this.y = 0; // -1 (cima)     .. 1 (baixo)
        this.ativo = false;
        this.pointerId = null;

        elemento.addEventListener("pointerdown", (e) => {
            this.ativo = true;
            this.pointerId = e.pointerId;
            elemento.setPointerCapture(e.pointerId);
            this.mover(e);
        });
        elemento.addEventListener("pointermove", (e) => {
            if (this.ativo && e.pointerId === this.pointerId) this.mover(e);
        });
        const soltar = (e) => {
            if (e.pointerId !== this.pointerId) return;
            this.ativo = false;
            this.pointerId = null;
        };
        elemento.addEventListener("pointerup", soltar);
        elemento.addEventListener("pointercancel", soltar);

        this.loop();
    }

    mover(e) {
        const r = this.circle.getBoundingClientRect();
        let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; } // limita ao círculo
        this.x = dx;
        this.y = dy;
    }

    loop() {
        // ao soltar, volta suavemente ao centro
        if (!this.ativo) {
            this.x *= 0.82;
            this.y *= 0.82;
            if (Math.abs(this.x) < 0.001) this.x = 0;
            if (Math.abs(this.y) < 0.001) this.y = 0;
        }
        this.renderizar();
        requestAnimationFrame(() => this.loop());
    }

    renderizar() {
        const { x, y } = this;
        if (x === this._ultX && y === this._ultY) return; // nada mudou: não toca no DOM
        this._ultX = x;
        this._ultY = y;
        this.el.style.setProperty("--x-value", x);
        this.el.style.setProperty("--y-value", y);

        // elipses que "curvam" na direção do arrasto, como uma esfera
        this.vertical.style.setProperty("--width", Math.max(0.04, Math.abs(x)));
        this.vertical.dataset.direction = x >= 0 ? 1 : -1;

        this.horizontal.style.setProperty("--height", Math.max(0.04, Math.abs(y)));
        this.horizontal.style.setProperty("--angle", `${-x * y * 0.6}rad`);
        this.horizontal.dataset.direction = y >= 0 ? 1 : -1;
    }
}
