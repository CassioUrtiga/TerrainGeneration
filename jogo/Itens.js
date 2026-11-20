class Itens {
    static garantir() {
        if (Itens.pronto) return;
        Itens.pronto = true;
        for (const tipo in Itens.desenhos) Itens.sprites[tipo] = Itens.criar(Itens.desenhos[tipo]);
    }

    static criar(desenhar) {
        const R = 3;
        const c = document.createElement("canvas");
        c.width = 32 * R; c.height = 32 * R;
        const g = c.getContext("2d");
        g.scale(R, R);
        g.lineJoin = "round"; g.lineCap = "round";
        desenhar(g);
        return { img: c };
    }

    // ícone centrado em (cx, cy) com "tam" pixels de lado (hotbar)
    static desenharIcone(g, tipo, cx, cy, tam) {
        Itens.garantir();
        const sp = Itens.sprites[tipo];
        if (!sp) return;
        g.save();
        g.translate(cx, cy);
        g.rotate(Itens.tipos[tipo].rot || 0);
        g.drawImage(sp.img, -tam / 2, -tam / 2, tam, tam);
        g.restore();
    }

    // item pousado no chão (x, y = ponto do chão na tela), com brilho e flutuando
    static desenharChao(g, tipo, x, y, quadro, destaque) {
        Itens.garantir();
        const sp = Itens.sprites[tipo];
        if (!sp) return;
        const bob = Math.sin(quadro * 0.08 + x * 0.1) * 1.6;
        g.fillStyle = destaque ? "rgba(255,240,120,0.5)" : "rgba(255,236,150,0.26)";
        g.beginPath(); g.ellipse(x, y, destaque ? 11 : 9, destaque ? 5 : 4.2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.beginPath(); g.ellipse(x, y + 0.5, 5.5, 2.2, 0, 0, Math.PI * 2); g.fill();
        Itens.desenharIcone(g, tipo, x, y - 11 + bob, destaque ? 24 : 20);
    }

    // arma na mão: (hx, hy) = mão; ang = inclinação em radianos; k = escala
    static desenharMao(g, tipo, hx, hy, ang, k) {
        Itens.garantir();
        const sp = Itens.sprites[tipo], a = Itens.tipos[tipo].anc;
        if (!sp) return;
        g.save();
        g.translate(hx, hy);
        g.rotate(ang);
        g.drawImage(sp.img, -a[0] * k, -a[1] * k, 32 * k, 32 * k);
        g.restore();
    }

    // item aleatório para recompensas: 35% armas, 65% comidas
    static sorteio() {
        const h = Math.random();
        if (h < 0.15) return "espada";
        if (h < 0.25) return "machado";
        if (h < 0.35) return "arco";
        if (h < 0.60) return "maca";
        if (h < 0.80) return "pao";
        return "carne";
    }
}

Itens.pronto = false;
Itens.sprites = {};

// cat: arma | comida. Armas: dano, alcance (em tiles), recarga (frames), tiro (dispara flecha)
Itens.tipos = {
    espada:  { nome: "Espada",  cat: "arma", dano: 2, alcance: 1.7, recarga: 22, rot: 0.785, anc: [16, 25], info: "dano 2" },
    machado: { nome: "Machado", cat: "arma", dano: 4, alcance: 1.5, recarga: 42, rot: 0.785, anc: [16, 25], info: "dano 4 · lento" },
    arco:    { nome: "Arco",    cat: "arma", dano: 2, alcance: 11,  recarga: 30, tiro: true, rot: 0, anc: [23, 16], info: "dano 2 · à distância" },
    maca:    { nome: "Maçã",    cat: "comida", cura: 2, rot: 0, info: "+2 vida" },
    pao:     { nome: "Pão",     cat: "comida", cura: 3, rot: 0, info: "+3 vida" },
    carne:   { nome: "Carne",   cat: "comida", cura: 5, rot: 0, info: "+5 vida" },
};
Itens.punho = { nome: "Mãos", cat: "arma", dano: 1, alcance: 1.2, recarga: 20, info: "dano 1" };

// itens garantidos perto do ponto inicial, para você já começar armado
Itens.iniciais = { "3,1": "espada", "-3,2": "maca", "1,-3": "arco", "-2,-3": "pao" };

const _C = "#202433";
function _forma(g, cor, largura = 0.9) {
    g.fillStyle = cor; g.fill();
    g.strokeStyle = _C; g.lineWidth = largura; g.stroke();
}
function _poli(g, pts, cor) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.closePath(); _forma(g, cor);
}
function _ret(g, x, y, w, h, cor) { g.beginPath(); g.rect(x, y, w, h); _forma(g, cor); }
function _circ(g, x, y, r, cor) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); _forma(g, cor); }

// Desenhos na vertical, no quadro 32×32. A empunhadura fica em "anc".
Itens.desenhos = {
    espada(g) {
        _poli(g, [[16, 2], [18.6, 5.2], [18.6, 19.5], [13.4, 19.5], [13.4, 5.2]], "#dfe5ee");
        g.strokeStyle = "#aab4c2"; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(16, 6); g.lineTo(16, 18.5); g.stroke();
        _ret(g, 9.5, 19.5, 13, 3, "#d8b04a");
        _ret(g, 14.6, 22.5, 2.8, 6, "#6b4528");
        _circ(g, 16, 29.6, 2, "#d8b04a");
    },
    machado(g) {
        _ret(g, 14.6, 5, 2.8, 25, "#7a5230");
        _poli(g, [[17.4, 4.5], [26.5, 2.5], [28, 13.5], [17.4, 12]], "#bcc5d2");
        g.strokeStyle = "#f1f4f9"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(26.3, 3.5); g.lineTo(27.6, 12.8); g.stroke();
        _poli(g, [[14.6, 6], [9.5, 8.2], [14.6, 10.6]], "#8c97a6");
    },
    arco(g) {
        g.strokeStyle = _C; g.lineWidth = 4.2;
        g.beginPath(); g.arc(9, 16, 14, -1.0, 1.0); g.stroke();
        g.strokeStyle = "#9a6330"; g.lineWidth = 2.6;
        g.beginPath(); g.arc(9, 16, 14, -1.0, 1.0); g.stroke();
        g.strokeStyle = "#eeeeee"; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(16.56, 4.2); g.lineTo(16.56, 27.8); g.stroke();
        g.strokeStyle = _C; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(11, 16); g.lineTo(27, 16); g.stroke();
        g.strokeStyle = "#a9794a"; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(11, 16); g.lineTo(27, 16); g.stroke();
        _poli(g, [[30.5, 16], [26, 13.6], [26, 18.4]], "#b8c2cf");
        _poli(g, [[11, 16], [8.6, 13.6], [12.6, 14.4]], "#c24a4a");
        _poli(g, [[11, 16], [8.6, 18.4], [12.6, 17.6]], "#c24a4a");
    },
    maca(g) {
        _circ(g, 16, 18.5, 9.2, "#d9393b");
        g.fillStyle = "rgba(255,255,255,0.45)";
        g.beginPath(); g.ellipse(12.3, 15, 2.1, 3.4, 0.4, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#6b4528"; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(16, 10.5); g.lineTo(17.6, 5.8); g.stroke();
        g.beginPath(); g.ellipse(21, 8, 3.8, 1.9, -0.5, 0, Math.PI * 2); _forma(g, "#4caf50");
    },
    pao(g) {
        g.beginPath(); g.ellipse(16, 18.5, 11.5, 7.8, 0, 0, Math.PI * 2); _forma(g, "#dba75e");
        g.strokeStyle = "#a9742f"; g.lineWidth = 1.4;
        for (const x of [10.5, 16, 21.5]) { g.beginPath(); g.moveTo(x - 1.5, 14.5); g.lineTo(x + 1.5, 19.5); g.stroke(); }
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.beginPath(); g.ellipse(13, 14.2, 4.5, 1.6, -0.2, 0, Math.PI * 2); g.fill();
    },
    carne(g) {
        g.strokeStyle = _C; g.lineWidth = 5.4;
        g.beginPath(); g.moveTo(19, 19); g.lineTo(26.5, 26.5); g.stroke();
        g.strokeStyle = "#f5f1e6"; g.lineWidth = 3.4;
        g.beginPath(); g.moveTo(19, 19); g.lineTo(26.5, 26.5); g.stroke();
        _circ(g, 27.6, 24.6, 2.4, "#f5f1e6");
        _circ(g, 24.6, 27.6, 2.4, "#f5f1e6");
        g.beginPath(); g.ellipse(13, 13.5, 9.8, 8, -0.7, 0, Math.PI * 2); _forma(g, "#b5502f");
        g.fillStyle = "#d9825a";
        g.beginPath(); g.ellipse(11.2, 11.6, 5, 3.4, -0.7, 0, Math.PI * 2); g.fill();
    },
};
