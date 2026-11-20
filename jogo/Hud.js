class Hud {
    constructor(jogo) {
        this.jogo = jogo;
        this.avisos = [];   // { texto, cor, vida }
        this.tam = 54;      // lado de cada slot
        this.gap = 8;
    }

    mensagem(texto, cor = "#ffffff") {
        this.avisos.push({ texto, cor, vida: 150 });
        if (this.avisos.length > 3) this.avisos.shift();
    }

    // retângulo do slot i
    slotRect(i, canvas) {
        const total = 3 * this.tam + 2 * this.gap;
        return {
            x: canvas.width / 2 - total / 2 + i * (this.tam + this.gap),
            y: canvas.height - this.tam - 16,
            w: this.tam, h: this.tam,
        };
    }

    // slot sob o ponto (x, y) do canvas, ou -1
    slotEm(x, y, canvas) {
        for (let i = 0; i < 3; i++) {
            const r = this.slotRect(i, canvas);
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
        }
        return -1;
    }

    texto(g, txt, x, y, cor = "#fff", tam = 13, alinha = "center") {
        g.font = `600 ${tam}px system-ui, sans-serif`;
        g.textAlign = alinha;
        g.textBaseline = "middle";
        g.lineWidth = 3; g.strokeStyle = "rgba(10,12,20,0.85)"; g.lineJoin = "round";
        g.strokeText(txt, x, y);
        g.fillStyle = cor;
        g.fillText(txt, x, y);
    }

    coracao(g, x, y, s, cheio) {
        g.beginPath();
        g.moveTo(x, y + s * 0.95);
        g.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 0.6, y - s * 0.85, x, y - s * 0.1);
        g.bezierCurveTo(x + s * 0.6, y - s * 0.85, x + s * 1.25, y + s * 0.1, x, y + s * 0.95);
        g.closePath();
        g.fillStyle = cheio ? "#e5333f" : "rgba(30,34,48,0.7)";
        g.fill();
        g.strokeStyle = cheio ? "#5a0f16" : "#6a7287";
        g.lineWidth = 1.6;
        g.stroke();
        if (cheio) {
            g.fillStyle = "rgba(255,255,255,0.45)";
            g.beginPath(); g.ellipse(x - s * 0.5, y - s * 0.25, s * 0.22, s * 0.32, -0.5, 0, 7); g.fill();
        }
    }

    desenhar(g, canvas) {
        const j = this.jogo, p = j.p;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.lineCap = "round";

        // ---- vida ----
        const s = 8.5;
        for (let k = 0; k < p.vidaMax; k++) this.coracao(g, 22 + k * 21, 24, s, k < p.vida);
        this.texto(g, `${Math.ceil(p.vida)} / ${p.vidaMax}`, 14, 48, "#ffd9dc", 12, "left");
        this.texto(g, `Abates: ${j.abates}`, 14, 66, "#fff", 12, "left");

        // ---- hotbar ----
        for (let i = 0; i < 3; i++) {
            const r = this.slotRect(i, canvas);
            const sel = i === j.inv.sel;
            const it = j.inv.slots[i];
            g.fillStyle = sel ? "rgba(48,56,80,0.88)" : "rgba(20,24,36,0.75)";
            this.rr(g, r.x, r.y, r.w, r.h, 9); g.fill();
            g.lineWidth = sel ? 3 : 2;
            g.strokeStyle = sel ? "#ffd75e" : "#7d869c";
            this.rr(g, r.x, r.y, r.w, r.h, 9); g.stroke();
            if (it) Itens.desenharIcone(g, it.tipo, r.x + r.w / 2, r.y + r.h / 2, 40);
            this.texto(g, String(i + 1), r.x + 9, r.y + 10, sel ? "#ffd75e" : "#c5cbd9", 11, "center");

            // recarga da arma selecionada
            if (sel && j.recarga > 0 && j.recargaMax > 0) {
                const f = j.recarga / j.recargaMax;
                g.fillStyle = "rgba(0,0,0,0.5)";
                g.fillRect(r.x + 2, r.y + 2 + (r.h - 4) * (1 - f), r.w - 4, (r.h - 4) * f);
            }
        }

        // nome do item selecionado
        const r1 = this.slotRect(0, canvas);
        const cx = canvas.width / 2;
        const atual = j.inv.atual();
        const def = atual ? Itens.tipos[atual.tipo] : Itens.punho;
        this.texto(g, `${def.nome} · ${def.info}`, cx, r1.y - 12, "#ffffff", 13);

        // dica para pegar item do chão
        if (j.itemPerto && !p.morto) {
            const d = Itens.tipos[j.itemPerto.tipo];
            this.texto(g, `[E] Pegar ${d.nome}`, cx, r1.y - 34, "#ffe08a", 14);
        }

        // ---- avisos ----
        let y = 22;
        for (let k = this.avisos.length - 1; k >= 0; k--) {
            const a = this.avisos[k];
            g.globalAlpha = Math.min(1, a.vida / 30);
            this.texto(g, a.texto, cx, y, a.cor, 14);
            y += 20;
            if (--a.vida <= 0) this.avisos.splice(k, 1);
        }
        g.globalAlpha = 1;

        // ---- morte ----
        if (p.morto) {
            g.fillStyle = "rgba(90,0,10,0.5)";
            g.fillRect(0, 0, canvas.width, canvas.height);
            this.texto(g, "Você morreu", cx, canvas.height / 2 - 14, "#ffffff", 34);
            this.texto(g, "Pressione R ou clique para reviver", cx, canvas.height / 2 + 22, "#ffd9dc", 15);
        }
        g.restore();
    }

    rr(g, x, y, w, h, r) {
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
}
